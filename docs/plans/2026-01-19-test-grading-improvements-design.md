# Test Grading Improvements Design

**Date:** 2026-01-19
**Status:** Approved

## Overview

Enhance the Know Code Extra test grading system with:
1. Proper copy text grading (100 consecutive correct characters)
2. Prosign support with alternate character mappings
3. All attempts visibility in admin interface
4. Conditional approve/reject buttons (only for passing attempts)

## Requirements

### Passing Criteria
- 7 or more correct out of 10 questions, **OR**
- 100 consecutive correctly copied characters

### Copy Text Grading
- Admin enters expected copy text per test
- Grader finds longest consecutive correct character sequence using sliding window
- Prosigns entered as `<BT>`, `<AR>`, etc.
- Some prosigns have alternate characters (e.g., `<BT>` = `=`)

### Admin Features
- Show all attempts (not just passing) in new tab
- Show recent attempts on dashboard
- Only show approve/reject for passing attempts
- Manage prosign mappings

---

## Database Schema Changes

### New columns on `tests` table
```sql
expected_copy_text TEXT  -- The correct copy text for grading
```

### New `prosign_mappings` table
```sql
CREATE TABLE prosign_mappings (
    id TEXT PRIMARY KEY,
    prosign TEXT NOT NULL UNIQUE,  -- e.g., "<BT>"
    alternate TEXT NOT NULL,       -- e.g., "="
    created_at TEXT NOT NULL
)
```

**Default mappings to seed:**
| Prosign | Alternate |
|---------|-----------|
| `<BT>`  | `=`       |
| `<AR>`  | `+`       |

### New columns on `attempts` table
```sql
copy_text TEXT,              -- Store the user's actual copy submission
consecutive_correct INTEGER  -- Longest consecutive correct char count
```

---

## Grading Algorithm

### Text Normalization
Applied to both expected and user text:
1. Convert to uppercase
2. Collapse multiple whitespace to single space
3. Trim leading/trailing whitespace

### Prosign Handling
Before comparison, prosigns in expected text can match either:
- The prosign itself (e.g., `<BT>`)
- The mapped alternate (e.g., `=`)

### Sliding Window Algorithm
```
1. Normalize expected text → E
2. Normalize user text → U
3. For each starting position i in E:
     For each starting position j in U:
       count = 0
       while E[i+count] matches U[j+count]:
         count++
       max_consecutive = max(max_consecutive, count)
4. Return max_consecutive
```

**Matching logic at each position:**
- If expected char is start of a prosign, accept prosign or mapped alternate
- Otherwise, require exact character match
- Normalized whitespace matches normalized whitespace

---

## API Changes

### Modified: `POST /api/tests/:test_id/submit`

Enhanced response:
```json
{
  "passed": true,
  "score": 8,
  "passing_score": 7,
  "consecutive_correct": 127,
  "passing_copy_chars": 100,
  "pass_reason": "questions" | "copy" | "both",
  "correct_answers": {...},
  "certificate_id": "..."
}
```

### New: `GET /api/admin/attempts`

List all attempts with filters:
- Query params: `page`, `per_page`, `passed` (bool), `callsign`, `date_from`, `date_to`
- Returns all attempts including `copy_text` and `consecutive_correct`

### New: `GET /api/admin/prosigns`

List all prosign mappings.

### New: `POST /api/admin/prosigns`

Create mapping:
```json
{ "prosign": "<BT>", "alternate": "=" }
```

### New: `DELETE /api/admin/prosigns/:id`

Remove a prosign mapping.

### Modified: `PUT /api/admin/tests/:id`

Add `expected_copy_text` field.

### Modified: `GET /api/admin/stats`

Add `recent_attempts` array (last 10 attempts, both pass and fail).

---

## Frontend Changes

### Test Page (`app.jsx`)
- Add prosign instruction note in copy section:
  > "Prosigns should be entered in angle brackets, e.g., `<BT>` for break. Some prosigns can also be entered as their equivalent character (e.g., `=` for `<BT>`)."
- Results page: Show `consecutive_correct` count alongside character count
- Results page: Indicate which criterion passed (questions, copy, or both)

### Admin Queue (`admin-queue.jsx`)
- Only show Approve/Reject buttons if attempt is passing (7+ questions OR 100+ consecutive correct)
- Display `consecutive_correct` value in queue items
- Show user's submitted `copy_text` in expandable history

### New: Admin All Attempts (`admin-attempts.jsx`)
- Paginated table: Callsign, Date, Questions, Consecutive Correct, Passed, Status
- Filters: passed/failed, date range, callsign search
- Expandable row to view full `copy_text`

### Admin Dashboard
- Add "Recent Attempts" section showing last 10 attempts (pass and fail)
- Each row: callsign, questions score, consecutive correct, passed (yes/no), time ago

### Admin Tests (`admin-tests.jsx`)
- Add `expected_copy_text` textarea when editing a test
- Add "Prosign Mappings" section to manage the mapping table

### Navigation (`admin-layout.jsx`, `index.jsx`)
- Add "All Attempts" tab in admin navigation

---

## File Changes

### Backend (Rust)

| File | Changes |
|------|---------|
| `src/main.rs` | Schema migrations, new data types, call grading module |
| `src/admin.rs` | All attempts endpoint, prosign CRUD, stats with recent_attempts |
| `src/grading.rs` (new) | Grading module |

### New Grading Module (`src/grading.rs`)

```rust
// Grade question answers
pub fn grade_questions(
    answers: &HashMap<String, String>,
    correct_answers: &HashMap<String, String>
) -> (i32, Vec<QuestionResult>)

// Normalize text for comparison
pub fn normalize_text(text: &str) -> String

// Find longest consecutive correct sequence
pub fn find_consecutive_correct(
    user_text: &str,
    expected_text: &str,
    prosign_mappings: &[(String, String)]
) -> i32

// Determine overall pass/fail
pub fn is_passing(
    question_score: i32,
    consecutive_correct: i32,
    passing_questions: i32,
    passing_copy_chars: i32
) -> (bool, PassReason)
```

### Frontend (React)

| File | Changes |
|------|---------|
| `frontend/app.jsx` | Prosign instructions, enhanced results |
| `frontend/admin-queue.jsx` | Conditional buttons, consecutive_correct display |
| `frontend/admin-tests.jsx` | expected_copy_text field, prosign mappings UI |
| `frontend/admin-layout.jsx` | Add All Attempts nav item |
| `frontend/index.jsx` | All Attempts tab routing |
| `frontend/admin-attempts.jsx` (new) | All attempts view |

---

## Migration Safety

- All new columns are nullable or have defaults
- Existing attempts without `copy_text` show "—" in admin
- Existing tests without `expected_copy_text` skip copy grading (questions-only pass)
- Prosign mappings table seeded with common defaults on first run
