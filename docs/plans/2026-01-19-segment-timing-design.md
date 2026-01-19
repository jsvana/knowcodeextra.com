# Segment Timing Configuration Design

## Overview

Allow admins to configure audio segment timing per test. Segments control the timeline visualization and determine when copy input and question forms are available during playback.

## Data Model

Each test stores an array of segments as JSON. A segment has:

| Field | Type | Description |
|-------|------|-------------|
| name | string | Segment name (e.g., "Intro", "Practice", "Test") |
| start_time | integer | Start time in seconds |
| end_time | integer | End time in seconds (null = until audio ends) |
| enables_copy | boolean | Shows copy text input when true |
| enables_questions | boolean | Shows answer form when true |

**Color mapping:** Derived automatically from segment name:
- "Intro" / "Outro" → amber-600
- "Practice" / "Copy" → amber-500
- "Instructions" / "Notes" → amber-400
- "Test" → green-600
- Unknown → gray-500

**Storage:** JSON array in `segments` TEXT column on `tests` table.

Example:
```json
[
  {"name": "Intro", "start_time": 0, "end_time": 62, "enables_copy": false, "enables_questions": false},
  {"name": "Practice", "start_time": 62, "end_time": 126, "enables_copy": true, "enables_questions": false},
  {"name": "Instructions", "start_time": 126, "end_time": 221, "enables_copy": false, "enables_questions": false},
  {"name": "Test", "start_time": 221, "end_time": 531, "enables_copy": false, "enables_questions": true},
  {"name": "Outro", "start_time": 531, "end_time": null, "enables_copy": false, "enables_questions": false}
]
```

## Admin UI

### SegmentEditor Modal

Accessed via "Segments" button in TestManager (next to "Questions" button).

**Features:**
- List of segments sorted by start_time
- Each row: name, start → end time, copy/questions toggles
- "Add Segment" button
- Edit/delete per segment
- Visual preview bar showing segment layout

### SegmentForm Fields

- **Name:** Text input with suggestions dropdown (Intro, Practice, Instructions, Copy, Test, Notes, Outro)
- **Start time:** Number input (seconds) with mm:ss display helper
- **End time:** Number input (optional - blank means until next segment or end)
- **Enables copy:** Checkbox
- **Enables questions:** Checkbox

### Validation

- Segments cannot overlap
- Start time must be < end time
- Warn (but allow) gaps between segments

## Frontend Behavior

### Dynamic Segments

Replace hardcoded `audioSegments` constant with segments from current test data. Fallback to single "Full Test" segment if test has no segments defined.

### Conditional UI

Based on current playback time and active segment:
- **Copy-enabled segment active:** Show copy text input
- **Questions-enabled segment active:** Show answer form
- **Neither active:** Show "Listen to the transmission" message

Sections appear/disappear instantly (no fade animation).

### State Preservation

- Copy text and answer selections preserved when sections hide
- Hidden sections cannot be modified
- All content visible at end for review before submission

### User Guidance

Show notice at test start:

> "Sections will appear as the recording progresses. Copy practice will be available during practice segments. Questions will appear during the test segment. You'll see everything together at the end."

### End of Exam View

After audio completes or on submit:
- Show copy text section with entered text
- Show all questions with selected answers
- Allow review before final submission

## API Changes

### Public Endpoints

`GET /api/tests` - Include `segments` array in test objects.

No new endpoints needed.

### Admin Endpoints

`PUT /api/admin/tests/:id` - Accept `segments` JSON array in request body (already handles arbitrary fields).

## Database Migration

Add column to tests table:

```sql
ALTER TABLE tests ADD COLUMN segments TEXT;
```

Default NULL - frontend falls back to single segment spanning full audio.

## Summary

| Component | Change |
|-----------|--------|
| Database | Add `segments` TEXT column |
| Backend | Include segments in responses, accept in updates |
| Admin UI | SegmentEditor modal with CRUD |
| Frontend | Dynamic segments, conditional copy/questions display, instant show/hide, full review at end |
