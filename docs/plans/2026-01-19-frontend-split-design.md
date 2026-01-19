# Frontend File Split Design

## Overview

Split the 3660-line `knowcodeextra.jsx` into 7 manageable files for better navigation, code reuse, and team collaboration.

## File Structure

```
frontend/
├── shared.jsx          (~120 lines) - Utilities, icons, ConfirmModal
├── app.jsx             (~1300 lines) - Public test-taking App component
├── admin-auth.jsx      (~180 lines) - Auth context, provider, login form
├── admin-layout.jsx    (~250 lines) - AdminLayout, Toast, navigation
├── admin-queue.jsx     (~600 lines) - AdminDashboard, AdminQueue, AdminApproved
├── admin-tests.jsx     (~700 lines) - TestManager, QuestionEditor, SegmentEditor, forms
├── admin-settings.jsx  (~350 lines) - AdminSettings, AdminSearch
├── index.jsx           (~50 lines) - AdminApp, entry point, ReactDOM.createRoot
└── build.sh            (updated entry point)
```

## Component Assignment

### shared.jsx
- `API_BASE`
- `morsePatterns`
- `getSegmentColor`
- `VintagePattern`
- `TelegraphKey`
- `ConfirmModal`

### app.jsx
- `App` (public test-taking UI)

### admin-auth.jsx
- `AdminAuthContext`
- `AdminAuthProvider`
- `useAdminAuth`
- `AdminLogin`

### admin-layout.jsx
- `Toast`
- `AdminLayout`

### admin-queue.jsx
- `AdminDashboard`
- `AdminQueue`
- `AdminApproved`

### admin-tests.jsx
- `parseTimeToSeconds`
- `formatSecondsToTime`
- `QuestionForm`
- `SegmentForm`
- `SegmentEditor`
- `TestManager`
- `QuestionEditor`

### admin-settings.jsx
- `AdminSearch`
- `AdminSettings`

### index.jsx
- `AdminApp` (routing between admin pages)
- `ReactDOM.createRoot` entry point

## Import/Export Pattern

ES modules with esbuild bundling:

```javascript
// shared.jsx
export const API_BASE = "";
export const ConfirmModal = ({...}) => (...);

// admin-auth.jsx
import { API_BASE } from './shared.jsx';
export function useAdminAuth() {...}

// index.jsx
import { App } from './app.jsx';
import { AdminAuthProvider } from './admin-auth.jsx';
// ... assembles everything
```

## Build Changes

Update `build.sh` entry point from `knowcodeextra.jsx` to `index.jsx`:

```bash
npx esbuild index.jsx --bundle --outfile=../static/app.js ...
```

Output remains single `app.js` file - no HTML changes needed.

## Migration Order

Extract in dependency order, verify build after each:

1. `shared.jsx` - No dependencies
2. `admin-auth.jsx` - Depends on shared
3. `admin-layout.jsx` - Depends on shared, auth
4. `admin-settings.jsx` - Depends on shared, auth
5. `admin-queue.jsx` - Depends on shared, auth, layout
6. `admin-tests.jsx` - Depends on shared, auth
7. `app.jsx` - Depends on shared
8. `index.jsx` - Final assembly
9. Delete `knowcodeextra.jsx`
