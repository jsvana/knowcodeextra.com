# Validation Queue for Passed Attempts

## Overview

Add a validation queue requiring admin approval before passed test attempts receive official certificates with sequential numbers.

## Database Changes

Add columns to `attempts` table:

| Column | Type | Description |
|--------|------|-------------|
| `validation_status` | TEXT | `"pending"`, `"approved"`, or `"rejected"`. NULL for failed attempts |
| `certificate_number` | INTEGER | Sequential number assigned on approval. NULL until approved |
| `validated_at` | TEXT | Timestamp of approval/rejection |
| `admin_note` | TEXT | Optional note from admin (e.g., rejection reason) |

**Certificate number assignment:**
- Query `SELECT MAX(certificate_number) FROM attempts` + 1 at approval time
- Wrapped in transaction to prevent race conditions
- Format: `#1`, `#2`, `#3`, etc.

## Attempt Submission Changes

Before recording a new attempt, check if the callsign already has a pending or approved attempt:

```
POST /api/attempts:
1. Query: SELECT 1 FROM attempts WHERE callsign = ? AND validation_status IN ('pending', 'approved')
2. If exists → 400 error with message:
   "You already have a passed attempt awaiting validation.
    Practice more at morsestorytime.com and keyersjourney.com"
3. If not exists → proceed with recording attempt
4. If passed = true → set validation_status = 'pending'
5. If passed = false → leave validation_status = NULL
```

## Admin Endpoints

Protected by HTTP Basic Auth. Credentials configured in `config.toml`:

```toml
admin_username = "admin"
admin_password = "changeme"
```

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/queue` | HTML page showing pending attempts |
| `POST` | `/admin/queue/:id/approve` | Approve attempt, assign certificate number |
| `POST` | `/admin/queue/:id/reject` | Reject attempt with optional note |

**Approve response:**
```json
{ "certificate_number": 42 }
```

**Reject request/response:**
```json
// Request body (optional)
{ "note": "Suspicious timing pattern" }

// Response
{ "status": "rejected" }
```

## Modified Existing Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/leaderboard` | Only include attempts with `validation_status = 'approved'` |
| `GET /api/certificate/:id` | Return 404 if attempt not approved |
| `GET /api/stats` | Only count approved attempts in `total_passes` |

## Admin HTML Interface

Server-rendered page at `/admin/queue` with:

**Queue table columns:**
- Callsign
- Score (questions correct / copy chars)
- Submitted timestamp
- Action buttons: Approve | Reject

**Callsign history:**
- Expandable via query param: `/admin/queue?expand=W1ABC`
- Shows all previous attempts by that callsign (dates, scores, pass/fail)

**Reject form:**
- Text field for optional admin note
- Confirm button

**Characteristics:**
- Minimal inline CSS, no external dependencies
- No JavaScript required (form POSTs with redirects)
- Empty state: "No pending attempts to review"

## Frontend Changes

**After passing a test:**
- Current: Shows certificate immediately with UUID-based number
- New: Shows "Congratulations! Your result has been submitted for verification."
- No certificate displayed until approved

**Certificate display:**
- Only accessible after approval
- Shows sequential number in `#123` format

**Blocked submission:**
- When 400 returned for existing pending/approved attempt
- Display friendly message with links to morsestorytime.com and keyersjourney.com

## Notes

- All tests are 20 WPM only (no speed column in admin queue)
- Rejected attempts remain in database but marked as rejected
- Failed attempts (passed = false) bypass validation entirely
