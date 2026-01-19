# Frontend File Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the 3660-line `knowcodeextra.jsx` into 7 manageable files using ES modules.

**Architecture:** Extract components in dependency order, creating new files with proper imports/exports. Each file is self-contained with its dependencies imported. The build script entry point changes to `index.jsx` which assembles everything.

**Tech Stack:** React, esbuild bundler, ES modules

---

## Task 1: Create shared.jsx

**Files:**
- Create: `frontend/shared.jsx`
- Reference: `frontend/knowcodeextra.jsx:1-102`

**Step 1: Create shared.jsx with utilities**

Create `frontend/shared.jsx`:

```javascript
import React from "react";

// Morse code for decorative elements
export const morsePatterns = {
  BT: "−··· −",
  CQ: "−·−· −−·−",
  DE: "−·· ·",
  K: "−·−",
  AR: "·−·−·",
  SK: "···−·−",
};

export const getSegmentColor = (name) => {
  const colors = {
    intro: "bg-amber-600",
    outro: "bg-amber-600",
    practice: "bg-amber-500",
    copy: "bg-amber-500",
    instructions: "bg-amber-400",
    notes: "bg-amber-400",
    test: "bg-green-600",
  };
  return colors[name.toLowerCase()] || "bg-gray-500";
};

export const VintagePattern = () => (
  <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
    <pattern id="telegraph" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="currentColor" />
    </pattern>
    <rect width="100%" height="100%" fill="url(#telegraph)" />
  </svg>
);

export const TelegraphKey = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 100 50" fill="currentColor">
    <rect x="10" y="35" width="80" height="10" rx="2" />
    <rect x="40" y="20" width="20" height="20" rx="2" />
    <circle cx="50" cy="15" r="8" />
  </svg>
);

export const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  confirmStyle = "danger",
}) => {
  if (!isOpen) return null;

  const confirmButtonStyles = {
    danger: "bg-red-700 hover:bg-red-600 text-white",
    success: "bg-green-700 hover:bg-green-600 text-white",
    warning: "bg-amber-600 hover:bg-amber-500 text-white",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-amber-50 border-4 border-amber-800 p-6 max-w-md mx-4">
        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-amber-900" />
        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-amber-900" />
        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-amber-900" />
        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-amber-900" />

        <h3 className="font-serif text-xl text-amber-900 mb-4">{title}</h3>
        <p className="font-mono text-sm text-amber-800 mb-6">{message}</p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 font-mono text-sm border-2 border-amber-300 text-amber-800 hover:border-amber-500 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 font-mono text-sm transition-colors ${confirmButtonStyles[confirmStyle]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export const API_BASE = "";
```

**Step 2: Verify syntax**

Run: `cd frontend && npx esbuild shared.jsx --bundle --outfile=/dev/null --external:react 2>&1 | head -5`
Expected: No errors (may show warnings about unused exports, that's fine)

**Step 3: Commit**

```bash
git add frontend/shared.jsx
git commit -m "refactor: extract shared utilities to shared.jsx"
```

---

## Task 2: Create admin-auth.jsx

**Files:**
- Create: `frontend/admin-auth.jsx`
- Reference: `frontend/knowcodeextra.jsx:1364-1529`

**Step 1: Create admin-auth.jsx**

Create `frontend/admin-auth.jsx` with AdminAuthContext, AdminAuthProvider, useAdminAuth, and AdminLogin. Copy lines 1364-1529 from knowcodeextra.jsx, adding:

```javascript
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE } from "./shared.jsx";

export const AdminAuthContext = React.createContext(null);

export function AdminAuthProvider({ children }) {
  // ... copy existing implementation from lines 1366-1430
}

export function useAdminAuth() {
  // ... copy existing implementation from lines 1432-1439
}

export function AdminLogin() {
  // ... copy existing implementation from lines 1441-1529
}
```

**Step 2: Verify syntax**

Run: `cd frontend && npx esbuild admin-auth.jsx --bundle --outfile=/dev/null --external:react 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/admin-auth.jsx
git commit -m "refactor: extract admin auth to admin-auth.jsx"
```

---

## Task 3: Create admin-layout.jsx

**Files:**
- Create: `frontend/admin-layout.jsx`
- Reference: `frontend/knowcodeextra.jsx:1531-1643`

**Step 1: Create admin-layout.jsx**

Create `frontend/admin-layout.jsx` with Toast and AdminLayout. Copy lines 1531-1643:

```javascript
import React, { useState, useEffect } from "react";
import { VintagePattern, TelegraphKey } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";

export function Toast({ message, type = "success", onClose }) {
  // ... copy existing implementation from lines 1531-1547
}

export function AdminLayout({ children, currentPage, pendingCount = 0 }) {
  // ... copy existing implementation from lines 1549-1643
}
```

**Step 2: Verify syntax**

Run: `cd frontend && npx esbuild admin-layout.jsx --bundle --outfile=/dev/null --external:react 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/admin-layout.jsx
git commit -m "refactor: extract admin layout to admin-layout.jsx"
```

---

## Task 4: Create admin-settings.jsx

**Files:**
- Create: `frontend/admin-settings.jsx`
- Reference: `frontend/knowcodeextra.jsx:2352-2671`

**Step 1: Create admin-settings.jsx**

Create `frontend/admin-settings.jsx` with AdminSearch and AdminSettings. Copy lines 2352-2671:

```javascript
import React, { useState, useEffect } from "react";
import { API_BASE, ConfirmModal } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";

export function AdminSearch() {
  // ... copy existing implementation from lines 2352-2583
}

export function AdminSettings() {
  // ... copy existing implementation from lines 2585-2671
}
```

**Step 2: Verify syntax**

Run: `cd frontend && npx esbuild admin-settings.jsx --bundle --outfile=/dev/null --external:react 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/admin-settings.jsx
git commit -m "refactor: extract admin settings to admin-settings.jsx"
```

---

## Task 5: Create admin-queue.jsx

**Files:**
- Create: `frontend/admin-queue.jsx`
- Reference: `frontend/knowcodeextra.jsx:1645-2351`

**Step 1: Create admin-queue.jsx**

Create `frontend/admin-queue.jsx` with AdminDashboard, AdminQueue, AdminApproved. Copy lines 1645-2351:

```javascript
import React, { useState, useEffect } from "react";
import { API_BASE, ConfirmModal } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";

export function AdminDashboard({ onNavigate }) {
  // ... copy existing implementation from lines 1645-1782
}

export function AdminQueue({ onPendingCountChange }) {
  // ... copy existing implementation from lines 1784-2069
}

export function AdminApproved() {
  // ... copy existing implementation from lines 2071-2351
}
```

**Step 2: Verify syntax**

Run: `cd frontend && npx esbuild admin-queue.jsx --bundle --outfile=/dev/null --external:react 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/admin-queue.jsx
git commit -m "refactor: extract admin queue to admin-queue.jsx"
```

---

## Task 6: Create admin-tests.jsx

**Files:**
- Create: `frontend/admin-tests.jsx`
- Reference: `frontend/knowcodeextra.jsx:2672-3579`

**Step 1: Create admin-tests.jsx**

Create `frontend/admin-tests.jsx` with all test/question management components. Copy lines 2672-3579:

```javascript
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, ConfirmModal, getSegmentColor } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";

const parseTimeToSeconds = (value) => {
  // ... copy from lines 2818-2830
};

const formatSecondsToTime = (seconds) => {
  // ... copy from lines 2832-2838
};

export function QuestionForm({ question, onSave, onCancel }) {
  // ... copy from lines 2672-2816
}

export function SegmentForm({ segment, onSave, onCancel }) {
  // ... copy from lines 2840-2965
}

export function SegmentEditor({ testId, segments: initialSegments, onClose, onSave }) {
  // ... copy from lines 2967-3204
}

export function TestManager() {
  // ... copy from lines 3206-3369
}

export function QuestionEditor({ testId, onClose }) {
  // ... copy from lines 3371-3579
}
```

**Step 2: Verify syntax**

Run: `cd frontend && npx esbuild admin-tests.jsx --bundle --outfile=/dev/null --external:react 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/admin-tests.jsx
git commit -m "refactor: extract admin tests to admin-tests.jsx"
```

---

## Task 7: Create app.jsx

**Files:**
- Create: `frontend/app.jsx`
- Reference: `frontend/knowcodeextra.jsx:106-1362`

**Step 1: Create app.jsx**

Create `frontend/app.jsx` with the public test-taking App component. Copy lines 106-1362:

```javascript
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { API_BASE, morsePatterns, getSegmentColor, VintagePattern, TelegraphKey } from "./shared.jsx";

export function App() {
  // ... copy existing KnowCodeExtra implementation from lines 106-1362
  // Rename from KnowCodeExtra to App
}
```

Note: The original function is named `KnowCodeExtra` - rename it to `App` for clarity.

**Step 2: Verify syntax**

Run: `cd frontend && npx esbuild app.jsx --bundle --outfile=/dev/null --external:react 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/app.jsx
git commit -m "refactor: extract public app to app.jsx"
```

---

## Task 8: Create index.jsx and update build

**Files:**
- Create: `frontend/index.jsx`
- Modify: `frontend/build.sh`

**Step 1: Create index.jsx**

Create `frontend/index.jsx`:

```javascript
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

import { App } from "./app.jsx";
import { AdminAuthProvider } from "./admin-auth.jsx";
import { AdminLogin } from "./admin-auth.jsx";
import { useAdminAuth } from "./admin-auth.jsx";
import { AdminLayout } from "./admin-layout.jsx";
import { AdminDashboard, AdminQueue, AdminApproved } from "./admin-queue.jsx";
import { AdminSearch, AdminSettings } from "./admin-settings.jsx";
import { TestManager, QuestionEditor } from "./admin-tests.jsx";

function AdminApp() {
  const { isAuthenticated } = useAdminAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (["dashboard", "queue", "approved", "search", "settings", "tests"].includes(hash)) {
        setCurrentPage(hash);
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  let content;
  switch (currentPage) {
    case "queue":
      content = <AdminQueue onPendingCountChange={setPendingCount} />;
      break;
    case "approved":
      content = <AdminApproved />;
      break;
    case "search":
      content = <AdminSearch />;
      break;
    case "settings":
      content = <AdminSettings />;
      break;
    case "tests":
      content = <TestManager />;
      break;
    default:
      content = <AdminDashboard onNavigate={setCurrentPage} />;
  }

  return (
    <AdminLayout currentPage={currentPage} pendingCount={pendingCount}>
      {content}
    </AdminLayout>
  );
}

function MainApp() {
  const isAdminRoute = window.location.pathname === "/admin";

  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <AdminApp />
      </AdminAuthProvider>
    );
  }

  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<MainApp />);
```

**Step 2: Update build.sh**

Modify `frontend/build.sh` to use index.jsx as entry point:

```bash
#!/bin/bash
set -e

echo "Building frontend..."

npx esbuild index.jsx \
  --bundle \
  --outfile=../static/app.js \
  --format=iife \
  --external:react \
  --external:react-dom \
  --loader:.jsx=jsx

echo "Building CSS..."
npx tailwindcss -i ./styles.css -o ../static/styles.css

echo "Frontend built to ../static/"
```

**Step 3: Test the build**

Run: `cd frontend && ./build.sh`
Expected: Build succeeds, outputs `app.js`

**Step 4: Commit**

```bash
git add frontend/index.jsx frontend/build.sh
git commit -m "refactor: add index.jsx entry point and update build"
```

---

## Task 9: Delete old file and final verification

**Files:**
- Delete: `frontend/knowcodeextra.jsx`

**Step 1: Verify everything works**

Run: `cd frontend && ./build.sh`
Expected: Build succeeds

**Step 2: Delete the old file**

```bash
rm frontend/knowcodeextra.jsx
```

**Step 3: Final build test**

Run: `cd frontend && ./build.sh`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: complete frontend file split, remove old file"
```

---

## Summary

This implementation:
1. Extracts shared utilities to `shared.jsx`
2. Extracts admin auth to `admin-auth.jsx`
3. Extracts admin layout to `admin-layout.jsx`
4. Extracts admin settings/search to `admin-settings.jsx`
5. Extracts admin queue components to `admin-queue.jsx`
6. Extracts test management to `admin-tests.jsx`
7. Extracts public app to `app.jsx`
8. Creates `index.jsx` entry point with AdminApp routing
9. Updates build script and removes old monolithic file

Final structure: 8 focused files instead of 1 large file.
