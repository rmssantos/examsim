// Encrypted export/import (AES-GCM + PBKDF2) and SHA-256 integrity helpers.
// Offline-first, no external dependencies: uses the browser Web Crypto API only.
(function () {
    'use strict';

    window.ExamApp = window.ExamApp || {};

    const ENVELOPE_FORMAT = 'examsim-encrypted';
    const ENVELOPE_VERSION = 1;
    const KDF_ITERATIONS = 210000;
    const SALT_BYTES = 16;
    const IV_BYTES = 12;
    const MIN_PASSPHRASE_LENGTH = 8;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    function getCrypto() {
        const cryptoRef = (typeof crypto !== 'undefined') ? crypto : null;
        if (!cryptoRef || !cryptoRef.subtle) {
            throw new Error('Secure crypto is unavailable. Open the app over HTTPS or localhost to enable encrypted export/import.');
        }
        return cryptoRef;
    }

    function toBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    function fromBase64(value) {
        const binary = atob(String(value || ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function bufferToHex(buffer) {
        const bytes = new Uint8Array(buffer);
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    async function deriveKey(passphrase, salt, iterations) {
        const cryptoRef = getCrypto();
        const baseKey = await cryptoRef.subtle.importKey(
            'raw',
            encoder.encode(String(passphrase)),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return cryptoRef.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encrypt(data, passphrase) {
        const cryptoRef = getCrypto();
        if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
            throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
        }
        const salt = cryptoRef.getRandomValues(new Uint8Array(SALT_BYTES));
        const iv = cryptoRef.getRandomValues(new Uint8Array(IV_BYTES));
        const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
        const plaintext = encoder.encode(JSON.stringify(data));
        const cipher = await cryptoRef.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
        return {
            format: ENVELOPE_FORMAT,
            version: ENVELOPE_VERSION,
            kdf: 'PBKDF2',
            hash: 'SHA-256',
            cipher: 'AES-GCM',
            iterations: KDF_ITERATIONS,
            salt: toBase64(salt),
            iv: toBase64(iv),
            data: toBase64(cipher)
        };
    }

    function isEncryptedEnvelope(value) {
        return Boolean(
            value
            && typeof value === 'object'
            && value.format === ENVELOPE_FORMAT
            && typeof value.data === 'string'
            && typeof value.salt === 'string'
            && typeof value.iv === 'string'
        );
    }

    async function decrypt(envelope, passphrase) {
        if (!isEncryptedEnvelope(envelope)) {
            throw new Error('This file is not a valid ExamSim encrypted export.');
        }
        const iterations = Number.isInteger(envelope.iterations) && envelope.iterations > 0
            ? envelope.iterations
            : KDF_ITERATIONS;
        const salt = fromBase64(envelope.salt);
        const iv = fromBase64(envelope.iv);
        const key = await deriveKey(passphrase, salt, iterations);
        let plaintext;
        try {
            plaintext = await getCrypto().subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                fromBase64(envelope.data)
            );
        } catch (error) {
            throw new Error('Decryption failed. The passphrase is wrong or the file is corrupted.');
        }
        try {
            return JSON.parse(decoder.decode(plaintext));
        } catch (error) {
            throw new Error('Decrypted content is not valid JSON.');
        }
    }

    async function sha256Hex(input) {
        const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
        const digest = await getCrypto().subtle.digest('SHA-256', bytes);
        return bufferToHex(digest);
    }

    // Verify a set of { path -> ArrayBuffer|string } against a manifest { files: { path: sha256 } }.
    // Returns { valid, mismatched: [], missing: [] }.
    async function verifyManifest(manifest, files) {
        const result = { valid: true, mismatched: [], missing: [] };
        const expected = manifest && typeof manifest === 'object' ? manifest.files || {} : {};
        for (const path of Object.keys(expected)) {
            if (!(path in (files || {}))) {
                result.missing.push(path);
                result.valid = false;
                continue;
            }
            const actual = await sha256Hex(files[path]);
            if (actual !== String(expected[path]).toLowerCase()) {
                result.mismatched.push(path);
                result.valid = false;
            }
        }
        return result;
    }

    // DOM-safe passphrase prompt. Resolves with the passphrase string, or null if cancelled.
    function promptPassphrase(options = {}) {
        const config = {
            title: options.title || 'Enter passphrase',
            message: options.message || '',
            confirmLabel: options.confirmLabel || 'Continue',
            requireConfirmation: Boolean(options.requireConfirmation),
            minLength: Number.isInteger(options.minLength) ? options.minLength : MIN_PASSPHRASE_LENGTH
        };

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'secure-passphrase-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);padding:16px;';

            const dialog = document.createElement('div');
            dialog.className = 'secure-passphrase-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.style.cssText = 'background:#fff;color:#1a1a1a;max-width:420px;width:100%;border-radius:10px;padding:22px;box-shadow:0 18px 48px rgba(0,0,0,0.35);font-family:inherit;';

            const heading = document.createElement('h2');
            heading.style.cssText = 'margin:0 0 10px;font-size:19px;';
            heading.textContent = config.title;
            dialog.appendChild(heading);

            if (config.message) {
                const description = document.createElement('p');
                description.style.cssText = 'margin:0 0 14px;color:#555;font-size:14px;line-height:1.5;';
                description.textContent = config.message;
                dialog.appendChild(description);
            }

            const makeField = (labelText) => {
                const label = document.createElement('label');
                label.style.cssText = 'display:block;margin:0 0 12px;font-size:13px;font-weight:600;color:#333;';
                label.textContent = labelText;
                const input = document.createElement('input');
                input.type = 'password';
                input.autocomplete = 'off';
                input.style.cssText = 'display:block;width:100%;margin-top:6px;padding:9px 10px;border:1px solid #c8c8c8;border-radius:6px;font-size:14px;box-sizing:border-box;';
                label.appendChild(input);
                dialog.appendChild(label);
                return input;
            };

            const primaryInput = makeField('Passphrase');
            const confirmInput = config.requireConfirmation ? makeField('Confirm passphrase') : null;

            const error = document.createElement('p');
            error.style.cssText = 'margin:0 0 12px;color:#c0392b;font-size:13px;min-height:18px;';
            error.setAttribute('aria-live', 'polite');
            dialog.appendChild(error);

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'padding:9px 14px;border:1px solid #c8c8c8;background:#f4f4f4;border-radius:6px;cursor:pointer;font-size:14px;';

            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.textContent = config.confirmLabel;
            confirmBtn.style.cssText = 'padding:9px 14px;border:none;background:#2563eb;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;';

            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);
            dialog.appendChild(actions);
            overlay.appendChild(dialog);

            let settled = false;
            const cleanup = (value) => {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKeyDown, true);
                overlay.remove();
                resolve(value);
            };

            const onKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    cleanup(null);
                }
            };

            const submit = () => {
                const value = primaryInput.value;
                if (value.length < config.minLength) {
                    error.textContent = `Passphrase must be at least ${config.minLength} characters.`;
                    primaryInput.focus();
                    return;
                }
                if (confirmInput && confirmInput.value !== value) {
                    error.textContent = 'Passphrases do not match.';
                    confirmInput.focus();
                    return;
                }
                cleanup(value);
            };

            cancelBtn.addEventListener('click', () => cleanup(null));
            confirmBtn.addEventListener('click', submit);
            const onEnter = (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    submit();
                }
            };
            primaryInput.addEventListener('keydown', onEnter);
            if (confirmInput) confirmInput.addEventListener('keydown', onEnter);
            document.addEventListener('keydown', onKeyDown, true);

            document.body.appendChild(overlay);
            primaryInput.focus();
        });
    }

    window.ExamApp.secureTransfer = {
        ENVELOPE_FORMAT,
        ENVELOPE_VERSION,
        KDF_ITERATIONS,
        MIN_PASSPHRASE_LENGTH,
        encrypt,
        decrypt,
        isEncryptedEnvelope,
        sha256Hex,
        verifyManifest,
        promptPassphrase
    };
})();
