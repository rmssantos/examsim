/* global JSZip, importScripts, postMessage, close */

'use strict';

// ZIP parsing and inflation stay off the UI thread. The worker also owns hard
// upper bounds, so message-provided limits may make an import stricter but can
// never raise the production ceilings.
importScripts('../vendor/jszip/jszip.min.js');

const HARD_LIMITS = Object.freeze({
    maxZipBytes: 50 * 1024 * 1024,
    maxZipEntries: 512,
    maxZipUncompressedBytes: 120 * 1024 * 1024,
    maxJsonBytes: 5 * 1024 * 1024,
    maxImages: 250,
    maxImageBytes: 10 * 1024 * 1024,
    maxTotalImageBytes: 100 * 1024 * 1024
});

const SAFE_IMAGE_RE = /^[A-Za-z0-9_. -]+\.(?:jpe?g|png|gif|webp)$/i;
const ZIP_SIGNATURES = Object.freeze({
    localFile: 0x04034b50,
    centralFile: 0x02014b50,
    endOfCentralDirectory: 0x06054b50,
    zip64EndOfCentralDirectory: 0x06064b50,
    zip64Locator: 0x07064b50
});

function limitError(message) {
    const error = new Error(message);
    error.code = 'ZIP_LIMIT_EXCEEDED';
    return error;
}

function invalidArchive(message) {
    const error = new Error(message);
    error.code = 'ZIP_INVALID_ARCHIVE';
    return error;
}

function resolveLimits(requested = {}) {
    const limits = {};
    for (const [name, hardLimit] of Object.entries(HARD_LIMITS)) {
        const value = Number(requested[name]);
        limits[name] = Number.isSafeInteger(value) && value > 0
            ? Math.min(value, hardLimit)
            : hardLimit;
    }
    return limits;
}

function normalizePath(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
}

function isDumpPath(path) {
    return /(^|\/)dump\.json$/i.test(path);
}

function isMetadataPath(path) {
    return /(^|\/)metadata\.json$/i.test(path);
}

function safeImageName(path) {
    const fileName = path.split('/').pop() || '';
    return fileName.length <= 128
        && SAFE_IMAGE_RE.test(fileName)
        && !fileName.startsWith('.')
        ? fileName
        : null;
}

function findEndOfCentralDirectory(view) {
    if (view.byteLength < 22) {
        throw invalidArchive('ZIP is too short to contain an end-of-directory record.');
    }
    const minimumOffset = Math.max(0, view.byteLength - 22 - 0xffff);
    for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
        if (
            view.getUint32(offset, true)
            !== ZIP_SIGNATURES.endOfCentralDirectory
        ) {
            continue;
        }
        const commentLength = view.getUint16(offset + 20, true);
        if (offset + 22 + commentLength === view.byteLength) {
            return offset;
        }
    }
    throw invalidArchive('ZIP end-of-directory record is missing or malformed.');
}

function normalizedRawNameKey(bytes) {
    let path = '';
    for (const rawValue of bytes) {
        if (rawValue < 0x20 || rawValue > 0x7e) {
            return null;
        }
        const value = rawValue === 0x5c ? 0x2f : rawValue;
        path += String.fromCharCode(value);
    }
    if (!path || path.startsWith('/')) return null;

    const isDirectory = path.endsWith('/');
    const parts = path.split('/');
    if (isDirectory) parts.pop();
    if (
        parts.length === 0
        || parts.some(part => !part || part === '.' || part === '..')
    ) {
        return null;
    }
    return `${parts.join('/')}${isDirectory ? '/' : ''}`;
}

function sameBytes(left, right) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

function preflightRawArchive(archiveBuffer, limits) {
    if (archiveBuffer.byteLength > limits.maxZipBytes) {
        throw limitError(
            `ZIP file is too large. Maximum is ${Math.round(limits.maxZipBytes / 1024 / 1024)} MB.`
        );
    }

    const view = new DataView(archiveBuffer);
    const bytes = new Uint8Array(archiveBuffer);
    const eocdOffset = findEndOfCentralDirectory(view);
    if (
        eocdOffset >= 20
        && view.getUint32(eocdOffset - 20, true) === ZIP_SIGNATURES.zip64Locator
    ) {
        throw invalidArchive('ZIP64 archives are not supported.');
    }

    const diskNumber = view.getUint16(eocdOffset + 4, true);
    const centralDisk = view.getUint16(eocdOffset + 6, true);
    const diskEntries = view.getUint16(eocdOffset + 8, true);
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralSize = view.getUint32(eocdOffset + 12, true);
    const centralOffset = view.getUint32(eocdOffset + 16, true);
    if (
        diskEntries === 0xffff
        || totalEntries === 0xffff
        || centralSize === 0xffffffff
        || centralOffset === 0xffffffff
    ) {
        throw invalidArchive('ZIP64 archives are not supported.');
    }
    if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
        throw invalidArchive('Multi-disk ZIP archives are not supported.');
    }
    if (totalEntries > limits.maxZipEntries) {
        throw limitError(
            `ZIP contains too many entries. Maximum is ${limits.maxZipEntries}.`
        );
    }

    const centralEnd = centralOffset + centralSize;
    if (
        !Number.isSafeInteger(centralEnd)
        || centralOffset > eocdOffset
        || centralEnd !== eocdOffset
    ) {
        throw invalidArchive('ZIP central directory boundaries are malformed.');
    }

    const names = new Set();
    const declaredSizes = new Map();
    let cursor = centralOffset;
    for (let index = 0; index < totalEntries; index += 1) {
        if (
            cursor + 46 > centralEnd
            || view.getUint32(cursor, true) !== ZIP_SIGNATURES.centralFile
        ) {
            throw invalidArchive('ZIP central directory entry is malformed.');
        }
        const compressedSize = view.getUint32(cursor + 20, true);
        const uncompressedSize = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const startDisk = view.getUint16(cursor + 34, true);
        const localOffset = view.getUint32(cursor + 42, true);
        if (
            compressedSize === 0xffffffff
            || uncompressedSize === 0xffffffff
            || startDisk === 0xffff
            || localOffset === 0xffffffff
        ) {
            throw invalidArchive('ZIP64 entries are not supported.');
        }
        if (startDisk !== 0 || nameLength === 0) {
            throw invalidArchive('ZIP entry location or name is invalid.');
        }

        const nameStart = cursor + 46;
        const nextCursor = nameStart + nameLength + extraLength + commentLength;
        if (nextCursor > centralEnd) {
            throw invalidArchive('ZIP central directory entry exceeds its boundary.');
        }
        const centralName = bytes.subarray(nameStart, nameStart + nameLength);
        const nameKey = normalizedRawNameKey(centralName);
        if (!nameKey || names.has(nameKey)) {
            throw invalidArchive(
                'ZIP contains duplicate, non-ASCII, empty, or ambiguous entry names.'
            );
        }
        names.add(nameKey);
        declaredSizes.set(nameKey, uncompressedSize);

        if (
            localOffset + 30 > centralOffset
            || view.getUint32(localOffset, true) !== ZIP_SIGNATURES.localFile
        ) {
            throw invalidArchive('ZIP local file header is malformed.');
        }
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const localNameStart = localOffset + 30;
        const dataStart = localNameStart + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (
            dataStart > centralOffset
            || dataEnd > centralOffset
            || localNameStart + localNameLength > centralOffset
        ) {
            throw invalidArchive('ZIP local file data exceeds its boundary.');
        }
        const localName = bytes.subarray(
            localNameStart,
            localNameStart + localNameLength
        );
        if (!sameBytes(centralName, localName)) {
            throw invalidArchive('ZIP local and central filenames do not match.');
        }

        cursor = nextCursor;
    }
    if (cursor !== centralEnd) {
        throw invalidArchive('ZIP central directory entry count is inconsistent.');
    }
    return declaredSizes;
}

function shortestEntry(entries, predicate) {
    let selected = null;
    for (const descriptor of entries) {
        if (descriptor.entry.dir || !predicate(descriptor.path)) continue;
        if (
            !selected
            || descriptor.path.length < selected.path.length
            || (
                descriptor.path.length === selected.path.length
                && descriptor.path < selected.path
            )
        ) {
            selected = descriptor;
        }
    }
    return selected;
}

function selectImages(entries) {
    const byBaseName = new Map();
    for (const descriptor of entries) {
        if (descriptor.entry.dir) continue;
        const fileName = safeImageName(descriptor.path);
        if (!fileName) continue;
        const selected = byBaseName.get(fileName);
        if (
            !selected
            || descriptor.path.length < selected.path.length
            || (
                descriptor.path.length === selected.path.length
                && descriptor.path < selected.path
            )
        ) {
            byBaseName.set(fileName, descriptor);
        }
    }
    return Array.from(byBaseName.values()).sort((left, right) => {
        const leftName = safeImageName(left.path);
        const rightName = safeImageName(right.path);
        return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
    });
}

function deriveExamId(entries) {
    const roots = new Set();
    let hasRootFile = false;
    for (const descriptor of entries) {
        if (descriptor.entry.dir || !descriptor.path) continue;
        const parts = descriptor.path.split('/').filter(Boolean);
        if (parts.length < 2) {
            hasRootFile = true;
            continue;
        }
        roots.add(parts[0]);
    }
    return !hasRootFile && roots.size === 1 ? Array.from(roots)[0] : null;
}

function concatChunks(chunks, byteLength) {
    const output = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return output.buffer;
}

function streamEntry(entry, onChunk) {
    return new Promise((resolve, reject) => {
        const stream = entry.internalStream('uint8array');
        let settled = false;

        stream.on('data', (chunk) => {
            if (settled) return;
            try {
                onChunk(chunk);
            } catch (error) {
                settled = true;
                stream.pause();
                reject(error);
            }
        });
        stream.on('error', (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        });
        stream.on('end', () => {
            if (settled) return;
            settled = true;
            resolve();
        });
        stream.resume();
    });
}

function preflight(entries, limits, declaredSizes) {
    if (entries.length > limits.maxZipEntries) {
        throw limitError(`ZIP contains too many entries. Maximum is ${limits.maxZipEntries}.`);
    }

    let packageBytes = 0;
    let imageBytes = 0;
    let imageCount = 0;
    for (const descriptor of entries) {
        if (descriptor.entry.dir) continue;
        const fileName = safeImageName(descriptor.path);
        if (fileName) {
            imageCount += 1;
            if (imageCount > limits.maxImages) {
                throw limitError(`ZIP contains too many images. Maximum is ${limits.maxImages}.`);
            }
        }
        const declared = declaredSizes.get(descriptor.path);
        if (!Number.isSafeInteger(declared) || declared < 0) {
            throw invalidArchive(
                `ZIP size metadata is missing for ${descriptor.path}.`
            );
        }

        packageBytes += declared;
        if (packageBytes > limits.maxZipUncompressedBytes) {
            throw limitError('ZIP declared size exceeds the package safety limit.');
        }
        if (
            (isDumpPath(descriptor.path) || isMetadataPath(descriptor.path))
            && declared > limits.maxJsonBytes
        ) {
            throw limitError(`${descriptor.path} exceeds the JSON safety limit.`);
        }

        if (!fileName) continue;
        imageBytes += declared;
        if (declared > limits.maxImageBytes) {
            throw limitError(`Image ${fileName} exceeds the per-image safety limit.`);
        }
        if (imageBytes > limits.maxTotalImageBytes) {
            throw limitError('ZIP images exceed the shared image safety limit.');
        }
    }
}

async function extractArchive(archiveBuffer, requestedLimits) {
    if (!(archiveBuffer instanceof ArrayBuffer)) {
        const error = new Error('ZIP payload must be an ArrayBuffer.');
        error.code = 'ZIP_INVALID_ARCHIVE';
        throw error;
    }

    const limits = resolveLimits(requestedLimits);
    const declaredSizes = preflightRawArchive(archiveBuffer, limits);
    const zip = await JSZip.loadAsync(archiveBuffer);
    const entries = [];
    zip.forEach((relativePath, entry) => {
        entries.push({
            entry,
            path: normalizePath(relativePath || entry.name)
        });
    });

    preflight(entries, limits, declaredSizes);
    const dump = shortestEntry(entries, isDumpPath);
    const metadata = shortestEntry(entries, isMetadataPath);
    if (!dump) {
        const error = new Error('ZIP file missing dump.json.');
        error.code = 'ZIP_MISSING_DUMP';
        throw error;
    }

    const imageDescriptors = selectImages(entries);
    const selectedImages = new Set(imageDescriptors);
    const dumpChunks = [];
    const metadataChunks = [];
    const imageChunks = new Map(
        imageDescriptors.map(descriptor => [descriptor, []])
    );
    const imageLengths = new Map(
        imageDescriptors.map(descriptor => [descriptor, 0])
    );
    let packageBytes = 0;
    let totalImageBytes = 0;

    for (const descriptor of entries) {
        if (descriptor.entry.dir) continue;
        let entryBytes = 0;
        const isJson = isDumpPath(descriptor.path) || isMetadataPath(descriptor.path);
        const imageName = safeImageName(descriptor.path);
        const retainDump = descriptor === dump;
        const retainMetadata = descriptor === metadata;
        const retainImage = selectedImages.has(descriptor);

        await streamEntry(descriptor.entry, (chunk) => {
            const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
            entryBytes += bytes.byteLength;
            packageBytes += bytes.byteLength;
            if (packageBytes > limits.maxZipUncompressedBytes) {
                throw limitError('ZIP expands beyond the package safety limit.');
            }
            if (isJson && entryBytes > limits.maxJsonBytes) {
                throw limitError(`${descriptor.path} expands beyond the JSON safety limit.`);
            }
            if (imageName) {
                totalImageBytes += bytes.byteLength;
                if (entryBytes > limits.maxImageBytes) {
                    throw limitError(`Image ${imageName} expands beyond the per-image safety limit.`);
                }
                if (totalImageBytes > limits.maxTotalImageBytes) {
                    throw limitError('ZIP images expand beyond the shared image safety limit.');
                }
            }

            // Copy each emitted view because JSZip may reuse its backing buffer.
            const copy = bytes.slice();
            if (retainDump) dumpChunks.push(copy);
            if (retainMetadata) metadataChunks.push(copy);
            if (retainImage) {
                imageChunks.get(descriptor).push(copy);
                imageLengths.set(descriptor, entryBytes);
            }
        });

        descriptor.actualBytes = entryBytes;
    }

    const dumpBuffer = concatChunks(dumpChunks, dump.actualBytes);
    const metadataBuffer = metadata
        ? concatChunks(metadataChunks, metadata.actualBytes)
        : null;
    const imageFiles = imageDescriptors.map((descriptor) => ({
        fileName: safeImageName(descriptor.path),
        buffer: concatChunks(
            imageChunks.get(descriptor),
            imageLengths.get(descriptor)
        )
    }));

    return {
        dumpBuffer,
        metadataBuffer,
        imageFiles,
        derivedExamId: deriveExamId(entries)
    };
}

self.onmessage = async (event) => {
    try {
        const result = await extractArchive(
            event?.data?.archiveBuffer,
            event?.data?.limits
        );
        const transfer = [result.dumpBuffer];
        if (result.metadataBuffer) transfer.push(result.metadataBuffer);
        for (const image of result.imageFiles) transfer.push(image.buffer);
        postMessage({ ok: true, ...result }, transfer);
    } catch (error) {
        postMessage({
            ok: false,
            error: {
                code: error?.code || 'ZIP_EXTRACTION_FAILED',
                message: error?.message || 'ZIP extraction failed.'
            }
        });
    } finally {
        close();
    }
};
