# Admin.jsx CSS Refactoring Guide

## Summary

This document outlines all inline styles that need to be removed from Admin.jsx and replaced with CSS classes.

## Changes Required

### 1. HEADER SECTION (Lines 260-342)

**Before:**

```jsx
<motion.div
  className="admin-header"
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "30px 20px",
    marginBottom: 20,
    borderRadius: "16px",
    border: "1.5px solid var(--text-primary-color)",
    boxShadow: "0px 4px 0 var(--text-primary-color)",
    backgroundColor: "var(--background-secondary-color)",
    background: "linear-gradient(...)"
  }}
>
  <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
    <div style={{ width: 50, height: 50, borderRadius: "12px", ... }}>👑</div>
    <div>
      <h1 style={{ fontWeight: "600", margin: 0, fontSize: 28 }}>Admin Dashboard</h1>
      <p style={{ margin: "4px 0 0 0", fontSize: 14, ... }}>Manage users...</p>
    </div>
  </div>
</motion.div>
```

**After:**

```jsx
<motion.div
  className="admin-header"
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
>
  <div className="admin-header-left">
    <div className="admin-header-icon">👑</div>
    <div>
      <h1>Admin Dashboard</h1>
      <p className="admin-header-subtitle">Manage users and system resources</p>
    </div>
  </div>
  <div className="admin-controls">...</div>
</motion.div>
```

### 2. MAIN LAYOUT (Lines 344-353)

**Before:**

```jsx
<div className="admin-main-layout" style={{
  display: "grid",
  gridTemplateColumns: isAdmin === true && users.length > 0 && !loading ? "480px 1fr" : "1fr",
  gap: 20,
  alignItems: "start",
}}>
```

**After:**

```jsx
<div className={`admin-main-layout ${!(isAdmin === true && users.length > 0 && !loading) ? 'single-column' : ''}`}>
```

Add to CSS:

```css
.admin-main-layout {
  display: grid;
  grid-template-columns: 480px 1fr;
  gap: 20px;
  align-items: start;
}
.admin-main-layout.single-column {
  grid-template-columns: 1fr;
}
```

### 3. LEFT COLUMN - Search & Filter Card (Lines 364-658)

**Before:**

```jsx
<div style={{
  padding: "14px",
  borderRadius: "14px",
  border: "1.5px solid var(--text-primary-color)",
  ...
}}>
  <h2 style={{ fontSize: 14, fontWeight: "600", ... }}>
    <span style={{ display: "inline-block", transform: "translateY(-1px)" }}>🔍</span>
    Search & Filter
  </h2>
  ...
</div>
```

**After:**

```jsx
<div className="admin-search-filter-card">
  <h2>
    <span className="emoji-icon">🔍</span>
    Search & Filter
  </h2>
  ...
</div>
```

### 4. Search Input (Lines 394-443)

**Before:**

```jsx
<div style={{ position: "relative", marginBottom: 10 }}>
  <input
    className="admin-search-input"
    style={{ width: "100%", padding: "10px 40px 10px 12px", ... }}
    ...
  />
  <motion.div style={{ position: "absolute", right: 12, top: "50%", ... }}>
    <svg>...</svg>
  </motion.div>
</div>
```

**After:**

```jsx
<div className="admin-search-wrapper">
  <input className="admin-search-input" ... />
  <motion.div className="admin-search-icon" ...>
    <svg>...</svg>
  </motion.div>
</div>
```

### 5. Filter Buttons (Lines 447-536)

**Before:**

```jsx
<div style={{ marginBottom: 10 }}>
  <label className="admin-filter-label" style={{ display: "flex", alignItems: "center", ... }}>
    <span>🌍</span> Region
  </label>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
    <motion.button
      style={{
        padding: "6px 12px",
        border: `2px solid ${regionFilter === "all" ? "var(--text-primary-color)" : "var(--text-secondary-color)"}`,
        ...
      }}
    >All</motion.button>
  </div>
</div>
```

**After:**

```jsx
<div className="admin-filter-group">
  <label className="admin-filter-label">
    <span>🌍</span> Region
  </label>
  <div className="admin-filter-buttons">
    <motion.button
      className={`admin-filter-btn ${regionFilter === "all" ? "active" : ""}`}
      onClick={() => setRegionFilter("all")}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      All
    </motion.button>
  </div>
</div>
```

### 6. Filter Results Badge (Lines 608-658)

**Before:**

```jsx
<motion.div style={{
  marginTop: 10,
  padding: "8px 12px",
  ...
}}>
  <span style={{ fontSize: 12, fontWeight: "500", ... }}>
    ✨ {filteredUsers.length} of {users.length}
  </span>
  <motion.button className="clear-filters-btn" style={{ padding: "5px 10px", ... }}>
    Clear
  </motion.button>
</motion.div>
```

**After:**

```jsx
<motion.div
  className="admin-filter-results"
  initial={{ opacity: 0, y: -10 }}
  animate={{ opacity: 1, y: 0 }}
>
  <span className="admin-filter-results-text">
    ✨ {filteredUsers.length} of {users.length}
  </span>
  <motion.button
    className="clear-filters-btn"
    onClick={() => {
      setSearchQuery("");
      setRegionFilter("all");
      setDateFilter("all");
    }}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
    Clear
  </motion.button>
</motion.div>
```

### 7. Overview Section (Lines 660-960)

**Before:**

```jsx
<h2 style={{ fontSize: 16, fontWeight: "600", marginBottom: 10, ... }}>
  📊 Overview
</h2>
<div className="admin-summary-grid" style={{
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 10,
  ...
}}>
  <motion.div className="summary-card" style={{
    padding: "24px",
    borderRadius: "16px",
    ...
  }}>
    <div style={{ position: "absolute", top: -20, right: -20, fontSize: 80, opacity: 0.1 }}>👥</div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <div style={{ width: 40, height: 40, ... }}>👥</div>
      <div className="summary-card-label" style={{ fontSize: 14, ... }}>Total Users</div>
    </div>
    <div className="summary-card-value" style={{ fontSize: 36, fontWeight: "700", lineHeight: 1 }}>
      {users.length}
    </div>
  </motion.div>
</div>
```

**After:**

```jsx
<h2 className="admin-overview-title">📊 Overview</h2>
<div className="admin-summary-grid">
  <motion.div className="summary-card" whileHover={{ y: -5, transition: { type: "spring", stiffness: 300 } }}>
    <div className="summary-card-watermark">👥</div>
    <div className="summary-card-header">
      <div className="summary-card-icon">👥</div>
      <div className="summary-card-label">Total Users</div>
    </div>
    <div className="summary-card-value">{users.length}</div>
  </motion.div>
  {/* Repeat for Storage, Classes, Files cards */}
</div>
```

### 8. User Cards (Lines 1016-1225)

**Before:**

```jsx
<motion.div className="user-card" variants={item} style={{
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "22px",
  ...
}}>
  <div style={{ position: "absolute", top: 10, left: 10, ... }}>#{index + 1}</div>
  <div className="user-card-left" style={{ display: "flex", alignItems: "center", flex: 1 }}>
    <motion.div className="user-avatar" style={{ width: 64, height: 64, ... }}>
      {u.full_name ? u.full_name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
    </motion.div>
    <div style={{ marginLeft: 18 }} className="user-info">
      <div className="user-name-email" style={{ display: "flex", gap: 10, ... }}>
        <strong style={{ fontSize: 19, fontWeight: "600" }}>...</strong>
        <span className="user-email" style={{ color: "...", fontSize: 14, ... }}>...</span>
      </div>
      <div className="user-stats" style={{ ... }}>
        <span style={{ display: "inline-flex", ... }}>📚 {u.classesCount} classes</span>
      </div>
    </div>
  </div>
  <motion.button className="user-delete-btn" style={{ ... }}>Delete</motion.button>
</motion.div>
```

**After:**

```jsx
<motion.div
  key={u.id}
  className="user-card"
  variants={item}
  whileHover={{
    y: -4,
    boxShadow: "0px 5px 0 var(--text-primary-color)",
    transition: { type: "spring", stiffness: 300 },
  }}
>
  <div className="user-card-rank">#{index + 1}</div>
  <div className="user-card-left">
    <motion.div
      className="user-avatar"
      whileHover={{ scale: 1.1, rotate: 5 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      {u.full_name
        ? u.full_name.charAt(0).toUpperCase()
        : u.email.charAt(0).toUpperCase()}
    </motion.div>
    <div className="user-info">
      <div className="user-name-email">
        <strong className="user-name">
          {u.full_name || u.email.split("@")[0]}
        </strong>
        <span className="user-email">{u.email}</span>
      </div>
      <div className="user-stats">
        <span className="user-stat-badge">📚 {u.classesCount} classes</span>
        <span className="user-stat-badge">📄 {u.filesCount} files</span>
        <span className="user-stat-badge">
          💾 {formatBytes(u.totalStorage)}
        </span>
      </div>
      <div className="user-meta">
        <span className="user-meta-item">📍 {u.region}</span>
        <span className="user-meta-divider">•</span>
        <span className="user-meta-item">
          📅 Joined {formatDate(u.created_at)}
        </span>
      </div>
    </div>
  </div>
  <motion.button
    className="user-delete-btn"
    onClick={() =>
      setDeleteConfirm({
        userId: u.id,
        userName: u.full_name || u.email.split("@")[0],
        userEmail: u.email,
      })
    }
    whileHover={{
      scale: 1.08,
      y: -3,
      boxShadow: "0px 5px 0 #EF4444",
      backgroundColor: "#FEE",
      transition: { type: "spring", stiffness: 400, damping: 15 },
    }}
    whileTap={{ scale: 0.95, y: 0 }}
  >
    <svg>...</svg>
    Delete
  </motion.button>
</motion.div>
```

### 9. Empty States

**Before:**

```jsx
<div className="auth-error" style={{
  fontSize: "x-large",
  fontWeight: "400",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "70vh",
  cursor: "pointer",
}}>Not Authorised</div>

<div style={{
  textAlign: "center",
  padding: "40px",
  color: "var(--text-secondary-color)",
}}>No users match your search.</div>
```

**After:**

```jsx
<div className="admin-not-authorized">Not Authorised</div>

<div className="admin-empty-state">No users match your search.</div>
```

## Files Modified

1. `/src/pages/Admin.css` - New organized CSS (COMPLETED)
2. `/src/pages/Admin.jsx` - Need to remove all inline styles and use CSS classes

## Next Steps

The CSS file has been created with all necessary classes. Now Admin.jsx needs to be updated to use these classes instead of inline styles.
