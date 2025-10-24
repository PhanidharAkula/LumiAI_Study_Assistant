# File Handling Best Practices Guide

## 📚 Overview

LumiAI handles two types of file inputs:

1. **Tagged Files (🏷️)** - Files from your classes in Supabase
2. **Uploaded Files (➕)** - Files uploaded directly from your device

## 🎯 Current Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User Action                          │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        🏷️ Tag Button            ➕ Upload Button
                │                       │
                ▼                       ▼
    ┌───────────────────┐   ┌─────────────────────┐
    │ Select from       │   │ Pick from device    │
    │ existing classes  │   │ (FileReader API)    │
    └───────────────────┘   └─────────────────────┘
                │                       │
                ▼                       ▼
    ┌───────────────────┐   ┌─────────────────────┐
    │ buildAIContext()  │   │ Extract text/image  │
    │ - Fetch from      │   │ - PDF.js            │
    │   Supabase        │   │ - Base64 images     │
    │ - Extract text    │   │ - Text files        │
    └───────────────────┘   └─────────────────────┘
                │                       │
                └───────────┬───────────┘
                            ▼
            ┌───────────────────────────┐
            │ fetchStreamingResponse()  │
            │ - context parameter       │
            │ - files parameter         │
            └───────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────┐
            │   OpenAI API (gpt-4o)    │
            │ - Study Materials Context │
            │ - Uploaded Documents      │
            │ - User Question           │
            └───────────────────────────┘
```

## 🔧 Implementation Details

### 1. Tagged Files (Context Selector)

**When to Use:**

- Files already uploaded to classes
- Persistent context across multiple questions
- Want to reference study materials repeatedly

**How It Works:**

```javascript
// In ChatComponent.jsx - handleSendMessage()
const contextFiles = [];
selectedFiles.forEach((fileId) => {
  // Find file in allClasses
  const fileObj = cls.files?.find((f) => f.id === fileId);
  contextFiles.push({
    id: fileObj.id,
    name: fileObj.name,
    type: fileObj.type,
    source: "context",
    className: cls.name,
  });
});

// Store in message
userMessage.contextFiles = contextFiles;
```

**Text Extraction:**

```javascript
// In ChatComponent.jsx - buildAIContext()
if (isPDF) {
  const { url } = await getFilePublicUrl("files", fileObj.path);
  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  // Extract text from all pages...
}
```

**Visual Display:**

- 🟡 Yellow background (`#FFF9E6`)
- 🏷️ Tag icon
- Shows: `[filename] (classname)`
- Persistent - stays in context

### 2. Uploaded Files (Direct Upload)

**When to Use:**

- One-time file analysis
- Files not in your classes yet
- Quick questions about a document
- Image analysis

**How It Works:**

```javascript
// In ChatInput.jsx - handleFileChange()
if (isImage) {
  const reader = new FileReader();
  reader.onload = (e) => {
    validFiles.push({
      file,
      type: file.type,
      name: file.name,
      base64: e.target.result, // For vision API
    });
  };
  reader.readAsDataURL(file);
} else if (file.type === "application/pdf") {
  const text = await extractPdfText(file);
  validFiles.push({
    file,
    type: file.type,
    name: file.name,
    text: text, // Extracted text
  });
}
```

**Visual Display:**

- 🔵 Blue background (`#F0F9FF`)
- 📎 Paperclip icon
- Shows: thumbnails or document icons
- Temporary - cleared after sending

## 🎨 Visual Design

### Message Display Structure

```
┌─────────────────────────────────────────┐
│ 🏷️ Context:                             │ ← Yellow box
│ [📄 Thesis.pdf (Research Methods)]     │
│ [📄 Notes.txt (Research Methods)]      │
├─────────────────────────────────────────┤
│ 📎 Uploaded:                            │ ← Blue box
│ [🖼️ diagram.png]  [📄 temp_notes.pdf]  │
├─────────────────────────────────────────┤
│ Explain these concepts together         │ ← User's message
└─────────────────────────────────────────┘
```

### Color Scheme

| Type           | Background         | Border    | Icon Color | Purpose            |
| -------------- | ------------------ | --------- | ---------- | ------------------ |
| Context Files  | `#FFF9E6` (Yellow) | `#FFD700` | `#B8860B`  | Persistent context |
| Uploaded Files | `#F0F9FF` (Blue)   | `#3B82F6` | `#1D4ED8`  | Temporary uploads  |

## 🚀 Best Practices

### For Users

1. **Use Tagged Files (🏷️) When:**

   - You want to discuss materials multiple times
   - Files are part of your study materials
   - You need context to persist across questions
   - Working with class-related content

2. **Use Upload Button (➕) When:**

   - Quick one-off analysis needed
   - File not in your classes yet
   - Testing or experimentation
   - Image analysis (screenshots, diagrams)

3. **Combine Both When:**
   - Comparing class materials with external documents
   - Adding context to a specific uploaded file
   - Building comprehensive analysis

### For Developers

1. **Keep Separation of Concerns:**

   ```javascript
   // Clear separation in message object
   {
     type: "user",
     content: "question",
     contextFiles: [...],  // From tag selector
     files: [...],         // From upload button
   }
   ```

2. **Maintain Clear Visual Distinction:**

   - Different background colors
   - Different icons
   - Clear labels

3. **Handle Both in AI Service:**

   ```javascript
   // Order matters for AI understanding:
   // 1. Context from tagged files
   // 2. User's question
   // 3. Content from uploaded files
   ```

4. **Persist Context Appropriately:**
   - Tagged files: Save to database, restore on load
   - Uploaded files: Temporary, don't persist

## 🔄 Data Persistence

### What Gets Saved

```javascript
// In Supabase conversations table
{
  question: "user message",
  answer: "ai response",
  context_classes: [class_ids],    // ✅ Persisted
  context_files: [file_ids],       // ✅ Persisted
  // Note: Uploaded files are NOT saved
}
```

### Why This Design?

- **Tagged Files**: Already in Supabase, can be referenced by ID
- **Uploaded Files**: May contain sensitive/temporary data, large size
- **Best Practice**: Encourage users to add important files to classes

## 📊 Performance Considerations

### Tagged Files

- ✅ Files already in cloud storage
- ✅ Can be cached
- ✅ Shared across users (if public)
- ⚠️ Network latency for fetching
- ⚠️ PDF extraction can be slow

### Uploaded Files

- ✅ Instant access (local)
- ✅ No network requests
- ⚠️ Browser memory limits
- ⚠️ Lost on page refresh
- ⚠️ Can't be shared

## 🐛 Common Issues & Solutions

### Issue 1: PDF Extraction Fails

**Symptoms:**

- "Unable to extract text from PDF"
- Empty context sent to AI

**Solutions:**

1. Check if PDF is image-based (use OCR instead)
2. Verify Supabase storage permissions
3. Try uploading via + button instead
4. Check PDF.js worker configuration

### Issue 2: Context Not Persisting

**Symptoms:**

- Context clears after sending message
- Tags disappear

**Solutions:**

1. Don't clear `selectedClasses` and `selectedFiles` after sending
2. Keep context active in state
3. Only clear when user explicitly removes tags

### Issue 3: Mixed File Types

**Symptoms:**

- Images not showing properly
- Text extraction failing

**Solutions:**

1. Check MIME type and file extension
2. Use appropriate extraction method
3. Fallback to alternative display

## 🎓 Examples

### Example 1: Study Session with Class Materials

```javascript
// User selects from context (🏷️)
Context: [Lecture_Notes.pdf, Textbook_Ch5.pdf];

// Then asks multiple questions
Q1: "What's the main concept?";
Q2: "Can you explain the examples?";
Q3: "How does this relate to the previous chapter?";

// Context persists for all questions
```

### Example 2: Quick Document Analysis

```javascript
// User uploads a file (➕)
Upload: [assignment_draft.pdf];

// Asks for review
Q: "Review this draft and suggest improvements";

// File is analyzed, then cleared
```

### Example 3: Combined Approach

```javascript
// User combines both
Context: [Course_Syllabus.pdf (Course Info)]
Upload: [my_essay_draft.pdf]

// Asks comparison question
Q: "Does my essay meet the syllabus requirements?"

// AI has both:
// - Syllabus (persistent context)
// - Essay draft (temporary upload)
```

## 🔮 Future Enhancements

### Potential Improvements

1. **Unified File Manager:**

   - Show all files (tagged + uploaded) in one view
   - Allow converting uploaded files to class files
   - Drag-and-drop reordering

2. **Smart Context Suggestions:**

   - AI suggests relevant files based on question
   - Auto-tag related materials
   - Context recommendations

3. **File Preprocessing:**

   - OCR for image-based PDFs
   - Better text extraction
   - Support for more file types

4. **Advanced Features:**
   - File versioning
   - Collaborative annotations
   - AI-generated summaries per file

## 📝 Summary

**Current System:**

- ✅ Clear separation between tagged and uploaded files
- ✅ Visual distinction in UI
- ✅ Different use cases well-supported
- ✅ Performance optimized for each type
- ✅ Context persistence where needed

**Key Principle:**

> "Tagged files are for persistent study materials. Uploaded files are for quick, one-time analysis."

This dual approach gives users flexibility while maintaining system performance and clarity.
