# Member Features Design

Date: 2026-01-20

## Overview

Three improvements to the Know Code Extra application:
1. Fix Ham2K PoLo member list MIME type for unicode emoji
2. Add welcome email generator to admin panel
3. Add public roster page

---

## 1. Ham2K PoLo Member List Fix

### Problem
The `members.txt` file contains unicode emoji but is served without `charset=utf-8`, causing display issues in Ham2K PoLo.

### Changes

**Backend (`src/admin.rs`):**
- Change emoji from `🎉` to `📜` in `regenerate_polo_notes()`

**Backend (`src/main.rs`):**
- Add handler `get_members_txt()` that reads `{static_dir}/members.txt` and returns with `Content-Type: text/plain; charset=utf-8`
- Register route `GET /members.txt` before the static file fallback

### Result
```
W6JSV 📜 Know Code Extra #1
```

---

## 2. Welcome Email Generator

### Database
New table for settings:
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
```

### Backend (`src/admin.rs`)

New endpoints:
- `GET /api/admin/settings/email-template` - Returns current template
- `PUT /api/admin/settings/email-template` - Saves template
- `POST /api/admin/email/generate` - Generates email for a member

Generate request body:
```json
{ "member_id": "uuid-here" }
```

Generate response:
```json
{ "email": "Generated email text...", "recipient_email": "user@example.com" }
```

### Supported Placeholders
- `{callsign}` - Member's callsign
- `{member_number}` - Certificate number
- `{nickname}` - First name from QRZ (falls back to callsign)

### Frontend

**Admin Settings (`frontend/admin-settings.jsx`):**
- Add "Email Template" section with:
  - Text area to edit template
  - Save button
  - Placeholder reference list

**Approved List (`frontend/admin-queue.jsx` or similar):**
- Add "Generate Email" button per approved member row
- Modal displays:
  - Generated email text
  - Recipient email address (if available)
  - "Copy to Clipboard" button

---

## 3. Public Roster Page

### Backend (`src/main.rs`)

New endpoint:
- `GET /api/roster` - Returns approved members

Response:
```json
[
  {
    "callsign": "W6JSV",
    "certificate_number": 1,
    "validated_at": "2026-01-15T12:00:00Z"
  }
]
```

Ordered by `certificate_number ASC`.

### Frontend (`frontend/app.jsx`)

New view `roster`:
- Vintage styling consistent with other pages
- Table columns: #, Callsign, Certificate Number, Date Certified
- Pagination if needed

Navigation:
- Add "VIEW ROSTER" link on home page (near "VIEW LEADERBOARD")
- Cross-links between leaderboard and roster pages

### Difference from Leaderboard
| Leaderboard | Roster |
|-------------|--------|
| Ranked by highest speed passed | Ordered by certificate number |
| Shows attempts/passes metrics | Shows certification date |
| Performance focus | Membership focus |

---

## Implementation Order

1. Member list MIME fix (backend only, quick win)
2. Roster page (new API endpoint + frontend view)
3. Email generator (database + backend + frontend)
