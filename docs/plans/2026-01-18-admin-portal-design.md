# Admin Portal UI Design

## Overview

Transform the admin portal from server-rendered static pages to a proper React-based SPA integrated with the main application. Provides faster workflow, better visibility, more features, and unified experience.

## Decisions

- **Integration**: Part of main React app (`knowcodeextra.jsx`)
- **Authentication**: JWT tokens (stateless, Bearer header)
- **Pages**: Full admin suite (Dashboard, Queue, Approved, Search, Settings)
- **Styling**: Match existing amber/monospace aesthetic
- **Updates**: Optimistic UI updates for instant feedback

---

## Authentication

### Login Page (`/admin/login`)

- Username/password form matching app styling
- POST to `/api/admin/login` with credentials
- Backend validates against configured `admin_username`/`admin_password`
- Returns JWT token (signed with secret from config, 8h expiry)
- Token stored in React state (memory, not localStorage)

### Route Protection

- `AdminLayout` wrapper checks for valid token
- No token or expired → redirect to `/admin/login`
- All admin API calls include `Authorization: Bearer <token>`
- Backend middleware validates JWT on `/api/admin/*` routes
- 401 response → clear token, redirect to login

### Backend Changes

- `POST /api/admin/login` - validate credentials, return JWT
- New config: `admin_jwt_secret`
- JWT validation middleware replaces Basic Auth

---

## Page Structure

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/admin/login` | `AdminLogin` | Login page (public) |
| `/admin` | redirect | Redirects to `/admin/dashboard` |
| `/admin/dashboard` | `AdminDashboard` | Stats overview |
| `/admin/queue` | `AdminQueue` | Pending validation queue |
| `/admin/approved` | `AdminApproved` | Approved certificates list |
| `/admin/search` | `AdminSearch` | Search attempts by callsign |
| `/admin/settings` | `AdminSettings` | View current config |

### Layout

- `AdminLayout` wraps all authenticated pages
- Sidebar navigation (left) with links to each section
- Header bar: "Admin Portal" title + logout button
- Main content area (right)
- Mobile: sidebar collapses to hamburger menu
- Badge on "Queue" link showing pending count

### Component Hierarchy

```
AdminLogin        - standalone, no layout
AdminLayout       - sidebar + header + content outlet
  AdminDashboard
  AdminQueue
  AdminApproved
  AdminSearch
  AdminSettings
```

---

## Dashboard Page

### Stats Cards

| Card | Description |
|------|-------------|
| Pending | Count awaiting review (amber bg if > 0) |
| Approved Today | Certificates issued today |
| Total Certificates | All-time approved count |
| Rejection Rate | Percentage rejected |

### Recent Activity

- Last 10 actions (approvals, rejections)
- Shows: timestamp, callsign, action
- Each row links to relevant attempt
- Auto-refetches on tab focus

### Quick Actions

- "Review Queue" button if pending > 0

### Backend

- `GET /api/admin/stats`
- Returns: `pending_count`, `approved_today`, `total_certificates`, `rejected_count`, `recent_activity[]`

---

## Queue Page

### Table Columns

- Callsign (click to expand history)
- Score (X/10)
- Copy chars
- Submitted (relative time)
- Actions (Approve/Reject)

### Inline History

- Click callsign toggles history panel below row
- Shows all past attempts for that callsign
- Columns: date, score, copy, passed, status

### Approve Flow

1. Click "Approve"
2. Button shows spinner, row highlights green
3. Row removed immediately (optimistic)
4. Toast: "Approved - Certificate #123 issued"
5. On error: row reappears, error toast

### Reject Flow

1. Click "Reject" opens modal
2. Optional note field
3. Submit: row removed, toast "Rejected"
4. On error: row reappears, error toast

### Empty State

- "No pending attempts - you're all caught up!"

---

## Approved List Page

### Table Columns

- Checkbox (bulk selection)
- Callsign
- Email (from QRZ, or "Not found")
- Certificate # (links to certificate)
- Approved date
- Reached Out (Yes/No badge)

### Filtering

- Toggle: "Show all" / "Not reached out only"
- Default: not-reached-out first, then reached-out (dimmed)

### Bulk Actions

- Select via checkboxes
- "Select All" in header
- "Mark as Reached Out" button
- Optimistic update: rows dim immediately

### Row Actions

- Click certificate # → opens certificate in new tab
- Copy email button (clipboard icon)

### Pagination

- 25 per page
- Prev/next navigation
- "Showing 1-25 of 142"

### Backend

- `GET /api/admin/approved?page=1&per_page=25&reached_out=all`

---

## Search Page

### Search Form

- Single callsign input
- Case-insensitive, partial match support
- Search button + Enter key

### Results

- All attempts matching query
- Grouped by callsign if multiple
- Each shows: date, score, copy, passed, status, certificate #

### Actions

- Pending: Approve/Reject buttons inline
- Approved: Link to certificate
- Rejected: Show admin note

### Empty State

- "No attempts found for [query]"
- Suggestion to try partial callsign

### Backend

- `GET /api/admin/search?q=<callsign>`
- Returns all statuses

---

## Settings Page

### Displayed Info (read-only)

- Database path
- QRZ Integration status (enabled/disabled)
- Listen address
- Log level

### System Health

- Database connection status
- QRZ API status (last lookup time)
- Disk space for DB file

### Quick Stats

- Total attempts
- Database file size

### Note

- "Settings configured via config.toml or environment variables"
- No runtime editing

### Backend

- `GET /api/admin/settings`
- Excludes passwords, API keys, secrets

---

## Shared Components

| Component | Purpose |
|-----------|---------|
| `Toast` | Success/error notifications (3s auto-dismiss) |
| `Modal` | Dialogs (reuse existing pattern) |
| `Table` | Styled tables with hover states |
| `Button` | Primary (amber), secondary (outline), danger (red) |
| `Badge` | Status indicators (pending=yellow, approved=green, rejected=red) |
| `Card` | Dashboard stat cards |
| `Spinner` | Loading indicator |

---

## Technical Details

### Auth Context

```jsx
AdminAuthContext = {
  token,
  login(username, password),
  logout(),
  isAuthenticated
}
```

- Token in state (lost on refresh - secure)
- `login()` calls API, stores token
- `logout()` clears token, redirects

### API Helper

```jsx
adminFetch(url, options)
```

- Adds `Authorization: Bearer <token>` header
- Handles 401 → logout + redirect

### State Management

- Local component state
- Auth context for token
- No external state library needed

### Error Handling

- All API calls in try/catch
- Errors shown via toast
- Network errors: "Connection failed"

---

## New Backend Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/login` | Validate credentials, return JWT |
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/approved` | Paginated approved list |
| GET | `/api/admin/search` | Search attempts by callsign |
| GET | `/api/admin/settings` | Safe config values |

Existing endpoints to modify:
- Add JWT validation middleware to all `/api/admin/*` and `/admin/*` routes
- Remove Basic Auth from existing admin handlers
