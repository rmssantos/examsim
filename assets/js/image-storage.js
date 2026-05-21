// IndexedDB wrapper for storing exam images
// Provides significantly more storage than localStorage (50MB-1GB+)

class ImageStorage {
    constructor() {
        this.dbName = 'ExamImagesDB';
        this.storeName = 'images';
        this.version = 2;
        this.db = null;
        this.initPromise = this.init();
    }

    async init() {
        if (!window.indexedDB) {
            window.ExamApp.warn('IndexedDB not available, image storage disabled');
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('❌ Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                window.ExamApp.log('✅ IndexedDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const transaction = event.target.transaction;
                
                // Create images store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'key' });
                    objectStore.createIndex('examId', 'examId', { unique: false });
                    window.ExamApp.log('📦 Created IndexedDB object store for images');
                }

                // Create image_metadata store if it doesn't exist
                const metadataStoreName = 'image_metadata';
                if (!db.objectStoreNames.contains(metadataStoreName)) {
                    const metadataStore = db.createObjectStore(metadataStoreName, { keyPath: 'key' });
                    metadataStore.createIndex('examId', 'examId', { unique: false });
                    window.ExamApp.log('📦 Created IndexedDB object store for image metadata');

                    // If we are upgrading from version 1, migrate existing records
                    if (event.oldVersion === 1) {
                        const imagesStore = transaction.objectStore(this.storeName);
                        const requestCursor = imagesStore.openCursor();
                        requestCursor.onsuccess = (e) => {
                            const cursor = e.target.result;
                            if (cursor) {
                                const record = cursor.value;
                                const metadataRecord = {
                                    key: record.key,
                                    examId: record.examId,
                                    fileName: record.fileName,
                                    mimeType: record.mimeType,
                                    size: record.size,
                                    timestamp: record.timestamp || Date.now()
                                };
                                metadataStore.put(metadataRecord);
                                cursor.continue();
                            } else {
                                window.ExamApp.log('✅ Migrated image metadata to new store');
                            }
                        };
                    }
                }
            };
        });
    }

    async ensureReady() {
        if (!this.db) {
            await this.initPromise;
        }
    }

    async storeImage(examId, fileName, base64Data, mimeType = 'image/jpeg') {
        const blob = this.base64ToBlob(base64Data, mimeType);
        return this.storeImageBlob(examId, fileName, blob, mimeType);
    }

    base64ToBlob(base64Data, mimeType) {
        const binary = atob(String(base64Data || ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    }

    async storeImageBlob(examId, fileName, blob, mimeType = blob?.type || 'image/jpeg') {
        await this.ensureReady();
        if (!window.ExamApp.isSafeExamId(examId)) {
            throw new Error('Invalid exam id');
        }
        if (!window.ExamApp.isSafeImageFileName(fileName)) {
            throw new Error('Invalid image filename');
        }
        if (!window.ExamApp.EXAM_LIMITS.allowedImageMimeTypes.includes(mimeType)) {
            throw new Error('Unsupported image MIME type');
        }
        if (!(blob instanceof Blob)) {
            throw new Error('Invalid image blob');
        }
        if (blob.size > window.ExamApp.EXAM_LIMITS.maxImageBytes) {
            throw new Error('Image is too large');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName, 'image_metadata'], 'readwrite');
            const imagesStore = transaction.objectStore(this.storeName);
            const metadataStore = transaction.objectStore('image_metadata');
            
            const key = `${examId}_${fileName}`;
            const timestamp = Date.now();
            
            const imageRecord = {
                key: key,
                examId: examId,
                fileName: fileName,
                blob: blob,
                mimeType: mimeType,
                size: blob.size,
                timestamp: timestamp
            };

            const metadataRecord = {
                key: key,
                examId: examId,
                fileName: fileName,
                mimeType: mimeType,
                size: blob.size,
                timestamp: timestamp
            };
            
            imagesStore.put(imageRecord);
            metadataStore.put(metadataRecord);
            
            transaction.oncomplete = () => {
                resolve(key);
            };
            
            transaction.onerror = () => {
                console.error(`❌ Failed to store image ${fileName}:`, transaction.error);
                reject(transaction.error);
            };
        });
    }

    async getImage(examId, fileName) {
        await this.ensureReady();
        if (!window.ExamApp.isSafeExamId(examId) || !window.ExamApp.isSafeImageFileName(fileName)) {
            return null;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            
            const key = `${examId}_${fileName}`;
            const request = objectStore.get(key);
            
            request.onsuccess = () => {
                if (request.result) {
                    if (request.result.blob instanceof Blob) {
                        resolve(URL.createObjectURL(request.result.blob));
                    } else {
                        resolve(request.result.dataUrl || null);
                    }
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error(`❌ Failed to retrieve image ${fileName}:`, request.error);
                reject(request.error);
            };
        });
    }

    async deleteExamImages(examId) {
        await this.ensureReady();
        if (!window.ExamApp.isSafeExamId(examId)) return 0;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName, 'image_metadata'], 'readwrite');
            const imagesStore = transaction.objectStore(this.storeName);
            const metadataStore = transaction.objectStore('image_metadata');

            const indexImages = imagesStore.index('examId');
            const indexMetadata = metadataStore.index('examId');

            let deletedCount = 0;

            const reqImages = indexImages.openCursor(IDBKeyRange.only(examId));
            reqImages.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                }
            };

            const reqMetadata = indexMetadata.openCursor(IDBKeyRange.only(examId));
            reqMetadata.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => {
                window.ExamApp.log(`🗑️ Deleted ${deletedCount} images for exam: ${examId}`);
                resolve(deletedCount);
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    async getExamImageCount(examId) {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['image_metadata'], 'readonly');
            const objectStore = transaction.objectStore('image_metadata');
            const index = objectStore.index('examId');
            
            const request = index.count(IDBKeyRange.only(examId));
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getAllExamImages(examId) {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const index = objectStore.index('examId');
            
            const request = index.getAll(IDBKeyRange.only(examId));
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getStorageStats() {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['image_metadata'], 'readonly');
            const objectStore = transaction.objectStore('image_metadata');

            const stats = {
                totalImages: 0,
                totalSizeBytes: 0,
                exams: {}
            };

            const request = objectStore.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const record = cursor.value;
                    stats.totalImages++;
                    stats.totalSizeBytes += record.size || 0;

                    if (!stats.exams[record.examId]) {
                        stats.exams[record.examId] = {
                            count: 0,
                            sizeBytes: 0
                        };
                    }
                    stats.exams[record.examId].count++;
                    stats.exams[record.examId].sizeBytes += record.size || 0;

                    cursor.continue();
                } else {
                    stats.totalSizeMB = (stats.totalSizeBytes / (1024 * 1024)).toFixed(2);
                    Object.keys(stats.exams).forEach(examId => {
                        stats.exams[examId].sizeMB = (stats.exams[examId].sizeBytes / (1024 * 1024)).toFixed(2);
                    });

                    resolve(stats);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async clearAll() {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName, 'image_metadata'], 'readwrite');
            const imagesStore = transaction.objectStore(this.storeName);
            const metadataStore = transaction.objectStore('image_metadata');
            
            imagesStore.clear();
            metadataStore.clear();
            
            transaction.oncomplete = () => {
                window.ExamApp.log('🗑️ Cleared all images and metadata from IndexedDB');
                resolve();
            };
            
            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }
}

// Create global instance
window.ExamApp = window.ExamApp || {};
window.ExamApp.imageStorage = new ImageStorage();
window.imageStorage = window.ExamApp.imageStorage; // backwards compat
