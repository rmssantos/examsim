# Image Storage Migration - IndexedDB

## What Changed?

The exam simulator now uses **IndexedDB** instead of localStorage for storing images. This provides:

✅ **Much larger storage**: 50MB-1GB+ instead of 5-10MB  
✅ **Better performance**: Optimized for binary data  
✅ **No quota errors**: Can store hundreds of images per exam  
✅ **Automatic migration**: Old localStorage images are moved automatically  

## How It Works

When you import a ZIP file containing exam questions and images:

1. **Questions** → Stored in localStorage (JSON data)
2. **Images** → Extracted and stored in IndexedDB (base64 encoded)
3. **Loading** → Images are loaded from IndexedDB when displaying questions

## Migration Process

When you first load the updated simulator:

1. The system checks for old `exam_image_*` keys in localStorage
2. Automatically migrates them to IndexedDB
3. Removes old localStorage entries to free up space
4. Logs the migration process in the browser console

## Files Added/Modified

### New Files
- `image-storage.js` - IndexedDB wrapper for image management
- `image-inspector.html` - Debug tool to inspect storage

### Modified Files
- `index.html` - Updated to use IndexedDB for image extraction
- `image-loader.js` - Updated to load images from IndexedDB

## Troubleshooting

### Images Not Loading?

1. **Check Console**: Open browser DevTools (F12) → Console tab
2. **Look for logs**: 
   - `✅ IndexedDB initialized successfully`
   - `✅ Migrated X images from localStorage to IndexedDB`
   - `✓ Loaded {filename} from IndexedDB`

### Inspect Storage

Open `image-inspector.html` in your browser to:
- View total images stored
- See storage usage per exam
- Delete specific exam images
- Clear all IndexedDB data

### Manual Check

In browser console, run:
```javascript
// Get storage statistics
await window.imageStorage.getStorageStats()

// Check specific exam
await window.imageStorage.getExamImageCount('ai900')

// List all images for an exam
await window.imageStorage.getAllExamImages('ai900')
```

### Clear Old Data

If you have leftover localStorage images:

**Option 1**: Use Inspector
1. Open `image-inspector.html`
2. Click "Clear Old localStorage Images"

**Option 2**: Browser Console
```javascript
// Clear old localStorage images
for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith('exam_image_')) {
        localStorage.removeItem(key);
    }
}
```

**Option 3**: Clear everything and re-import
```javascript
// Clear all IndexedDB images
await window.imageStorage.clearAll()

// Then re-import your ZIP files
```

## Benefits

### Before (localStorage)
- ❌ 5-10MB limit
- ❌ Could store ~90 images for ai900
- ❌ Quota exceeded errors
- ❌ Could not store multiple large exams

### After (IndexedDB)
- ✅ 50MB-1GB+ storage
- ✅ Can store all 134 images for ai900
- ✅ No quota errors
- ✅ Can store multiple exams with images

## Technical Details

### IndexedDB Structure

**Database**: `ExamImagesDB`  
**Store**: `images`  
**Key**: `{examId}_{fileName}`  
**Index**: `examId` (for filtering by exam)

### Record Format
```javascript
{
    key: "ai900_00b3c927-56d1-4b7d-b9ed-55d794cadfb4.jpg",
    examId: "ai900",
    fileName: "00b3c927-56d1-4b7d-b9ed-55d794cadfb4.jpg",
    dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    mimeType: "image/jpeg",
    size: 14745,  // base64 length
    timestamp: 1700000000000
}
```

### API Methods

```javascript
// Store image
await window.imageStorage.storeImage(examId, fileName, base64Data, mimeType)

// Get image
await window.imageStorage.getImage(examId, fileName)

// Delete exam images
await window.imageStorage.deleteExamImages(examId)

// Get statistics
await window.imageStorage.getStorageStats()

// Clear all
await window.imageStorage.clearAll()
```

## Browser Compatibility

IndexedDB is supported in all modern browsers:
- ✅ Chrome 24+
- ✅ Firefox 16+
- ✅ Safari 10+
- ✅ Edge 12+

## Performance

Loading times:
- **IndexedDB**: ~5-10ms per image
- **localStorage**: ~2-5ms per image (but limited capacity)
- **File system**: ~50-100ms per image (requires manual extraction)

The slight overhead is worth it for the massive storage increase.

---

**Need Help?** 
Check the browser console for detailed logs, or open `image-inspector.html` to inspect storage.
