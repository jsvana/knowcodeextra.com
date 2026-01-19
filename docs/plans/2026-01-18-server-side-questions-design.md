# Server-Side Questions and Answer Validation

## Overview

Move questions and answers from hardcoded frontend to database with server-side validation. Correct answers are only revealed to clients after passing the test.

## Database Schema

```sql
-- Tests (e.g., "20 WPM Extra Class 1991")
CREATE TABLE IF NOT EXISTS tests (
    id TEXT PRIMARY KEY,           -- e.g., "20wpm-extra-1991"
    title TEXT NOT NULL,           -- "Extra Class"
    speed_wpm INTEGER NOT NULL,    -- 20
    year TEXT NOT NULL,            -- "1991"
    audio_url TEXT NOT NULL,       -- "/audio/20wpm/test.mp3"
    passing_score INTEGER NOT NULL, -- 7 (out of 10)
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

-- Questions (10 per test)
CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL REFERENCES tests(id),
    question_number INTEGER NOT NULL,  -- 1-10, display order
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL,  -- 'A', 'B', 'C', or 'D'
    created_at TEXT NOT NULL,
    UNIQUE(test_id, question_number)
);

-- Add test_id to existing attempts table
ALTER TABLE attempts ADD COLUMN test_id TEXT REFERENCES tests(id);
```

## API Endpoints

### Public Endpoints

```
GET  /api/tests
     → Returns list of active tests
     → [{id, title, speed_wpm, year, audio_url, passing_score}]

GET  /api/tests/:test_id/questions
     → Returns questions WITHOUT correct_option
     → [{id, question_number, question_text, option_a, option_b, option_c, option_d}]

POST /api/tests/:test_id/submit
     → Body: {callsign, answers: {"q1_id": "A", "q2_id": "C", ...}, copy_text, audio_progress}
     → Server validates answers against correct_option
     → If passed: {passed: true, score: 8, correct_answers: {"q1_id": "A", ...}, certificate_id}
     → If failed: {passed: false, score: 5, correct_answers: null}
```

### Admin Endpoints (requires auth)

```
POST   /api/admin/tests                    → Create new test
PUT    /api/admin/tests/:id                → Update test metadata
DELETE /api/admin/tests/:id                → Deactivate test

POST   /api/admin/tests/:test_id/questions → Add question
PUT    /api/admin/questions/:id            → Update question
DELETE /api/admin/questions/:id            → Remove question
```

## Frontend Changes

### Remove
- Hardcoded `testData` object with questions/answers
- Client-side answer validation logic

### New Data Flow
1. Test select screen: `GET /api/tests` → populate test list
2. Test start: `GET /api/tests/:id/questions` → store questions (no answers)
3. User completes test → `POST /api/tests/:id/submit`
4. Pass: display results with correct answers from response
5. Fail: display score only, no correct answers

### State Changes
- `testData` fetched from API, not hardcoded
- `answers` state tracks user selections: `{questionId: "A", ...}`
- New `correctAnswers` state populated only after passing

## Migration & Seeding

On startup:
1. Create `tests` table if not exists
2. Create `questions` table if not exists
3. Add `test_id` column to `attempts` if not exists (nullable for backwards compat)
4. Seed initial test data if `tests` table is empty

Existing attempts without `test_id` assumed to be for `20wpm-extra-1991`.

## Security

- `correct_option` column never sent to client until test is passed
- All answer validation happens server-side
- Failed attempts receive score only (no indication which questions wrong)
