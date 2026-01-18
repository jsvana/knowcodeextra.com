# Outreach Tracking with QRZ Integration

## Overview

Add outreach tracking for approved attempts, with automatic email lookup from QRZ API on approval.

## Database Changes

Add columns to `attempts` table:

| Column | Type | Description |
|--------|------|-------------|
| `reached_out` | BOOLEAN | Whether admin has contacted this person. Default false. |
| `email` | TEXT | Email fetched from QRZ API on approval. |

## QRZ API Integration

**Configuration:**
- `QRZ_USERNAME` environment variable
- `QRZ_PASSWORD` environment variable
- If not set, skip email lookup (graceful degradation)

**API flow on approval:**
1. Call QRZ XML API with session key auth
2. Lookup callsign → extract email from response
3. Store email in `attempts.email` column
4. If lookup fails → log warning, continue with approval (don't block)

**QRZ API details:**
- Login: `https://xmldata.qrz.com/xml/current/?username=X&password=Y`
- Lookup: `https://xmldata.qrz.com/xml/current/?s=SESSION_KEY&callsign=CALLSIGN`
- Parse XML response for `<email>` field

**Session caching:**
- Cache session key in memory (expires after ~24 hours per QRZ docs)
- Re-authenticate if session expires

## Admin UI Changes

**New "Approved" section at `/admin/approved`:**
- Shows approved attempts with outreach status
- Checkbox on each row for selection
- "Mark as Reached Out" button for bulk action

**Table columns:**
| ☐ | Callsign | Email | Cert # | Approved | Reached Out |
|---|----------|-------|--------|----------|-------------|
| ☐ | W6JSV | jay@... | #1 | 2026-01-17 | No |

**Features:**
- Select all checkbox in header
- Rows with `reached_out = true` shown muted/greyed
- Email shown directly (or "Not found" if lookup failed)
- Clicking callsign expands history

## New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/approved` | HTML page showing approved attempts |
| `POST` | `/admin/approved/mark-reached-out` | Bulk mark selected as reached out |

**Bulk mark request:**
```
POST /admin/approved/mark-reached-out
Content-Type: application/x-www-form-urlencoded

ids=uuid1&ids=uuid2&ids=uuid3
```

Response: Redirect to `/admin/approved`
