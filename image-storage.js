// IndexedDB wrapper for storing exam images
// Provides significantly more storage than localStorage (50MB-1GB+)

class ImageStorage {
    constructor() {
        this.dbName = 'ExamImagesDB';
        this.storeName = 'images';
        this.version = 1;
        this.db = null;
        this.initPromise = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('❌ Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'key' });
                    objectStore.createIndex('examId', 'examId', { unique: false });
                    console.log('📦 Created IndexedDB object store for images');
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
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            
            const key = `${examId}_${fileName}`;
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            
            const record = {
                key: key,
                examId: examId,
                fileName: fileName,
                dataUrl: dataUrl,
                mimeType: mimeType,
                size: base64Data.length,
                timestamp: Date.now()
            };
            
            const request = objectStore.put(record);
            
            request.onsuccess = () => {
                resolve(key);
            };
            
            request.onerror = () => {
                console.error(`❌ Failed to store image ${fileName}:`, request.error);
                reject(request.error);
            };
        });
    }

    async getImage(examId, fileName) {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            
            const key = `${examId}_${fileName}`;
            const request = objectStore.get(key);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.dataUrl);
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
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const index = objectStore.index('examId');
            
            const request = index.openCursor(IDBKeyRange.only(examId));
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                } else {
                    console.log(`🗑️ Deleted ${deletedCount} images for exam: ${examId}`);
                    resolve(deletedCount);
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getExamImageCount(examId) {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
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
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            
            const request = objectStore.getAll();
            
            request.onsuccess = () => {
                const records = request.result;
                const stats = {
                    totalImages: records.length,
                    totalSizeBytes: 0,
                    exams: {}
                };
                
                records.forEach(record => {
                    stats.totalSizeBytes += record.size;
                    if (!stats.exams[record.examId]) {
                        stats.exams[record.examId] = {
                            count: 0,
                            sizeBytes: 0
                        };
                    }
                    stats.exams[record.examId].count++;
                    stats.exams[record.examId].sizeBytes += record.size;
                });
                
                stats.totalSizeMB = (stats.totalSizeBytes / (1024 * 1024)).toFixed(2);
                Object.keys(stats.exams).forEach(examId => {
                    stats.exams[examId].sizeMB = (stats.exams[examId].sizeBytes / (1024 * 1024)).toFixed(2);
                });
                
                resolve(stats);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async clearAll() {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            
            const request = objectStore.clear();
            
            request.onsuccess = () => {
                console.log('🗑️ Cleared all images from IndexedDB');
                resolve();
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// Create global instance
window.imageStorage = new ImageStorage();
