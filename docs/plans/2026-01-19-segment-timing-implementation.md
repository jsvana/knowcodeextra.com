# Segment Timing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to configure audio segment timing per test, controlling when copy input and question forms appear during playback.

**Architecture:** Add `segments` JSON column to tests table. Admin UI gets SegmentEditor modal. Frontend dynamically shows/hides copy and question sections based on current playback time and segment configuration.

**Tech Stack:** Rust/Axum backend, SQLite, React frontend

---

## Task 1: Database Migration - Add segments column

**Files:**
- Modify: `src/main.rs:307-323` (setup_database function, after tests table creation)

**Step 1: Add ALTER TABLE for segments column**

After the existing tests table creation (around line 323), add:

```rust
// Add segments column to tests table (nullable JSON)
sqlx::query("ALTER TABLE tests ADD COLUMN segments TEXT")
    .execute(pool)
    .await
    .ok(); // Ignore error if column exists
```

**Step 2: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: add segments column to tests table"
```

---

## Task 2: Update Test struct to include segments

**Files:**
- Modify: `src/main.rs:218-228` (Test struct)

**Step 1: Add Segment type and update Test struct**

Before the Test struct, add the Segment type:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub name: String,
    pub start_time: i32,
    pub end_time: Option<i32>, // None means until audio ends
    pub enables_copy: bool,
    pub enables_questions: bool,
}
```

Update the Test struct to NOT derive FromRow (we'll manually map):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Test {
    pub id: String,
    pub title: String,
    pub speed_wpm: i32,
    pub year: String,
    pub audio_url: String,
    pub passing_score: i32,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub segments: Option<Vec<Segment>>,
}
```

**Step 2: Add a row type for database queries**

```rust
#[derive(Debug, Clone, FromRow)]
struct TestRow {
    pub id: String,
    pub title: String,
    pub speed_wpm: i32,
    pub year: String,
    pub audio_url: String,
    pub passing_score: i32,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub segments: Option<String>, // JSON string from DB
}

impl From<TestRow> for Test {
    fn from(row: TestRow) -> Self {
        Test {
            id: row.id,
            title: row.title,
            speed_wpm: row.speed_wpm,
            year: row.year,
            audio_url: row.audio_url,
            passing_score: row.passing_score,
            active: row.active,
            created_at: row.created_at,
            segments: row.segments.and_then(|s| serde_json::from_str(&s).ok()),
        }
    }
}
```

**Step 3: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: add Segment type and segments field to Test"
```

---

## Task 3: Update list_tests handler to include segments

**Files:**
- Modify: `src/main.rs` (list_tests handler, around line 725-737)

**Step 1: Update the query and mapping**

Find the `list_tests` handler and update it:

```rust
/// GET /api/tests - List active tests
async fn list_tests(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let rows: Vec<TestRow> = sqlx::query_as(
        "SELECT id, title, speed_wpm, year, audio_url, passing_score, active, created_at, segments
         FROM tests WHERE active = 1 ORDER BY speed_wpm"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let tests: Vec<Test> = rows.into_iter().map(Test::from).collect();
    Ok(Json(tests))
}
```

**Step 2: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: include segments in list_tests response"
```

---

## Task 4: Update admin list_tests_admin handler

**Files:**
- Modify: `src/admin.rs` (list_tests_admin handler)

**Step 1: Update AdminTest struct to include segments**

Find the AdminTest struct and add segments:

```rust
#[derive(Debug, Serialize)]
pub struct AdminTest {
    pub id: String,
    pub title: String,
    pub speed_wpm: i32,
    pub year: String,
    pub audio_url: String,
    pub passing_score: i32,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub question_count: i64,
    pub segments: Option<Vec<crate::Segment>>,
}
```

Add a row type:

```rust
#[derive(Debug, FromRow)]
struct AdminTestRow {
    pub id: String,
    pub title: String,
    pub speed_wpm: i32,
    pub year: String,
    pub audio_url: String,
    pub passing_score: i32,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub question_count: i64,
    pub segments: Option<String>,
}
```

**Step 2: Update list_tests_admin handler**

```rust
pub async fn list_tests_admin(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let rows: Vec<AdminTestRow> = sqlx::query_as(
        r#"
        SELECT t.id, t.title, t.speed_wpm, t.year, t.audio_url, t.passing_score, t.active, t.created_at, t.segments,
               (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
        FROM tests t
        ORDER BY t.speed_wpm, t.title
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let tests: Vec<AdminTest> = rows.into_iter().map(|row| AdminTest {
        id: row.id,
        title: row.title,
        speed_wpm: row.speed_wpm,
        year: row.year,
        audio_url: row.audio_url,
        passing_score: row.passing_score,
        active: row.active,
        created_at: row.created_at,
        question_count: row.question_count,
        segments: row.segments.and_then(|s| serde_json::from_str(&s).ok()),
    }).collect();

    Ok(Json(tests))
}
```

**Step 3: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/admin.rs
git commit -m "feat: include segments in admin test list"
```

---

## Task 5: Update admin update_test handler to accept segments

**Files:**
- Modify: `src/admin.rs` (UpdateTestRequest struct and update_test handler)

**Step 1: Add segments to UpdateTestRequest**

Find UpdateTestRequest and add:

```rust
#[derive(Debug, Deserialize)]
pub struct UpdateTestRequest {
    pub title: Option<String>,
    pub speed_wpm: Option<i32>,
    pub year: Option<String>,
    pub audio_url: Option<String>,
    pub passing_score: Option<i32>,
    pub active: Option<bool>,
    pub segments: Option<Vec<crate::Segment>>,
}
```

**Step 2: Update update_test handler to handle segments**

In the update_test handler, add handling for segments after the other fields:

```rust
if let Some(ref segments) = req.segments {
    let segments_json = serde_json::to_string(segments)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    updates.push("segments = ?");
    bindings.push(segments_json);
}
```

**Step 3: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/admin.rs
git commit -m "feat: allow updating test segments via admin API"
```

---

## Task 6: Frontend - Add SegmentEditor component

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after QuestionEditor component)

**Step 1: Add color mapping helper**

Near the top of the file (after imports), add:

```javascript
const getSegmentColor = (name) => {
  const colors = {
    'intro': 'bg-amber-600', 'outro': 'bg-amber-600',
    'practice': 'bg-amber-500', 'copy': 'bg-amber-500',
    'instructions': 'bg-amber-400', 'notes': 'bg-amber-400',
    'test': 'bg-green-600',
  };
  return colors[name.toLowerCase()] || 'bg-gray-500';
};
```

**Step 2: Add SegmentForm component**

```javascript
const SegmentForm = ({ segment, onSave, onCancel }) => {
  const [formData, setFormData] = useState(segment || {
    name: '',
    start_time: 0,
    end_time: null,
    enables_copy: false,
    enables_questions: false,
  });
  const [saving, setSaving] = useState(false);

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTime = (str) => {
    if (!str || str.trim() === '') return null;
    const parts = str.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(str) || 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...formData,
        start_time: parseTime(formData.start_time_str) || formData.start_time || 0,
        end_time: parseTime(formData.end_time_str),
      });
    } finally {
      setSaving(false);
    }
  };

  const suggestions = ['Intro', 'Practice', 'Instructions', 'Copy', 'Test', 'Notes', 'Outro'];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-mono text-amber-700 mb-1">Segment Name</label>
        <input
          type="text"
          list="segment-suggestions"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          className="w-full p-2 border-2 border-amber-300 bg-white text-amber-900 focus:border-amber-500 focus:outline-none"
          required
        />
        <datalist id="segment-suggestions">
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-mono text-amber-700 mb-1">Start Time (mm:ss or seconds)</label>
          <input
            type="text"
            value={formData.start_time_str ?? formatTime(formData.start_time)}
            onChange={(e) => setFormData({...formData, start_time_str: e.target.value})}
            placeholder="0:00"
            className="w-full p-2 border-2 border-amber-300 bg-white text-amber-900 focus:border-amber-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-mono text-amber-700 mb-1">End Time (blank = until end)</label>
          <input
            type="text"
            value={formData.end_time_str ?? (formData.end_time !== null ? formatTime(formData.end_time) : '')}
            onChange={(e) => setFormData({...formData, end_time_str: e.target.value})}
            placeholder="Leave blank for end"
            className="w-full p-2 border-2 border-amber-300 bg-white text-amber-900 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enables_copy}
            onChange={(e) => setFormData({...formData, enables_copy: e.target.checked})}
            className="w-4 h-4"
          />
          <span className="font-mono text-sm text-amber-800">Enables Copy Input</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enables_questions}
            onChange={(e) => setFormData({...formData, enables_questions: e.target.checked})}
            className="w-4 h-4"
          />
          <span className="font-mono text-sm text-amber-800">Enables Questions</span>
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 font-mono text-sm border-2 border-amber-300 text-amber-800 hover:border-amber-500 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 font-mono text-sm bg-amber-700 text-amber-50 hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Segment'}
        </button>
      </div>
    </form>
  );
};
```

**Step 3: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add SegmentForm component"
```

---

## Task 7: Frontend - Add SegmentEditor component

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after SegmentForm)

**Step 1: Add SegmentEditor component**

```javascript
const SegmentEditor = ({ testId, segments: initialSegments, onClose, onSave }) => {
  const { adminFetch } = useAdminAuth();
  const [segments, setSegments] = useState(initialSegments || []);
  const [editing, setEditing] = useState(null); // index or 'new'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '∞';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveSegment = async (segment) => {
    let newSegments;
    if (editing === 'new') {
      newSegments = [...segments, segment];
    } else {
      newSegments = segments.map((s, i) => i === editing ? segment : s);
    }
    // Sort by start_time
    newSegments.sort((a, b) => a.start_time - b.start_time);
    setSegments(newSegments);
    setEditing(null);
  };

  const handleDelete = (index) => {
    if (!confirm('Delete this segment?')) return;
    setSegments(segments.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/tests/${testId}`, {
        method: 'PUT',
        body: JSON.stringify({ segments }),
      });
      if (!response.ok) throw new Error('Failed to save segments');
      onSave(segments);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Calculate total duration for preview bar
  const maxTime = Math.max(...segments.map(s => s.end_time || 600), 300);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-amber-50 border-4 border-amber-800 max-w-3xl w-full max-h-[90vh] overflow-auto p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-serif text-2xl text-amber-900">Edit Segments</h2>
          <button onClick={onClose} className="text-amber-800 hover:text-amber-600 text-xl">&times;</button>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-300 p-3 mb-4 text-red-800 font-mono text-sm">
            {error}
          </div>
        )}

        {/* Preview bar */}
        <div className="mb-6">
          <p className="font-mono text-xs text-amber-600 mb-2">TIMELINE PREVIEW</p>
          <div className="flex h-8 rounded overflow-hidden border-2 border-amber-300">
            {segments.map((seg, i) => {
              const start = seg.start_time || 0;
              const end = seg.end_time || maxTime;
              const width = ((end - start) / maxTime) * 100;
              const left = (start / maxTime) * 100;
              return (
                <div
                  key={i}
                  className={`${getSegmentColor(seg.name)} flex items-center justify-center text-xs text-white font-mono truncate`}
                  style={{ width: `${width}%` }}
                  title={`${seg.name}: ${formatTime(seg.start_time)} - ${formatTime(seg.end_time)}`}
                >
                  {seg.name}
                </div>
              );
            })}
            {segments.length === 0 && (
              <div className="flex-1 bg-gray-300 flex items-center justify-center text-gray-600 font-mono text-xs">
                No segments defined
              </div>
            )}
          </div>
        </div>

        {editing !== null ? (
          <SegmentForm
            segment={editing === 'new' ? null : segments[editing]}
            onSave={handleSaveSegment}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center justify-between p-3 border-2 border-amber-300 bg-white">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded ${getSegmentColor(seg.name)}`} />
                    <span className="font-mono font-bold">{seg.name}</span>
                    <span className="font-mono text-sm text-amber-600">
                      {formatTime(seg.start_time)} → {formatTime(seg.end_time)}
                    </span>
                    {seg.enables_copy && (
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-mono rounded">COPY</span>
                    )}
                    {seg.enables_questions && (
                      <span className="px-2 py-0.5 bg-green-200 text-green-800 text-xs font-mono rounded">QUESTIONS</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(i)}
                      className="px-2 py-1 text-sm font-mono border border-amber-500 text-amber-700 hover:bg-amber-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(i)}
                      className="px-2 py-1 text-sm font-mono border border-red-500 text-red-700 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditing('new')}
                className="px-4 py-2 font-mono text-sm border-2 border-amber-500 text-amber-700 hover:bg-amber-100"
              >
                + Add Segment
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="px-4 py-2 font-mono text-sm bg-amber-700 text-amber-50 hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save All Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
```

**Step 2: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add SegmentEditor component"
```

---

## Task 8: Frontend - Add Segments button to TestManager

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (TestManager component, around line 2776)

**Step 1: Add state for segment editing**

In the TestManager component, add state:

```javascript
const [editingSegments, setEditingSegments] = useState(null); // test object
```

**Step 2: Add Segments button next to Questions button**

Find the Questions button in TestManager and add a Segments button before it:

```javascript
<button
  onClick={() => setEditingSegments(test)}
  className="px-3 py-1 font-mono text-xs border-2 border-blue-300 text-blue-700 hover:border-blue-500 hover:bg-blue-100 transition-all"
>
  Segments
</button>
```

**Step 3: Add SegmentEditor modal rendering**

At the end of TestManager's return, before the closing fragment or div, add:

```javascript
{editingSegments && (
  <SegmentEditor
    testId={editingSegments.id}
    segments={editingSegments.segments}
    onClose={() => setEditingSegments(null)}
    onSave={(newSegments) => {
      setTests(tests.map(t =>
        t.id === editingSegments.id ? {...t, segments: newSegments} : t
      ));
      setEditingSegments(null);
    }}
  />
)}
```

**Step 4: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 5: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add Segments button to TestManager"
```

---

## Task 9: Frontend - Remove hardcoded audioSegments

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (lines 3-10)

**Step 1: Remove the hardcoded audioSegments constant**

Delete lines 3-10:

```javascript
// DELETE THIS:
// Audio segment definitions (times in seconds)
const audioSegments = [
  { name: "Intro", start: 0, end: 62, color: "bg-amber-600" },
  { name: "Practice", start: 62, end: 126, color: "bg-amber-500" },
  { name: "Instructions", start: 126, end: 221, color: "bg-amber-400" },
  { name: "Test", start: 221, end: 531, color: "bg-green-600" },
  { name: "Outro", start: 531, end: Infinity, color: "bg-amber-600" },
];
```

**Step 2: Add getSegmentColor function if not already present**

Ensure near the top of the file (after imports):

```javascript
const getSegmentColor = (name) => {
  const colors = {
    'intro': 'bg-amber-600', 'outro': 'bg-amber-600',
    'practice': 'bg-amber-500', 'copy': 'bg-amber-500',
    'instructions': 'bg-amber-400', 'notes': 'bg-amber-400',
    'test': 'bg-green-600',
  };
  return colors[name.toLowerCase()] || 'bg-gray-500';
};
```

**Step 3: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Build will fail with errors about undefined audioSegments - this is expected

**Step 4: Commit partial progress**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "refactor: remove hardcoded audioSegments constant"
```

---

## Task 10: Frontend - Update test playback to use dynamic segments

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (App component, audio playback section)

**Step 1: Create dynamic segments from currentTest**

In the App component, find where audio playback happens and add a computed segments variable:

```javascript
// Get segments for current test, with fallback
const activeSegments = React.useMemo(() => {
  if (currentTest?.segments?.length > 0) {
    return currentTest.segments.map(seg => ({
      name: seg.name,
      start: seg.start_time,
      end: seg.end_time ?? Infinity,
      color: getSegmentColor(seg.name),
      enablesCopy: seg.enables_copy,
      enablesQuestions: seg.enables_questions,
    }));
  }
  // Fallback: single segment covering entire audio
  return [{
    name: 'Test',
    start: 0,
    end: Infinity,
    color: 'bg-green-600',
    enablesCopy: true,
    enablesQuestions: true,
  }];
}, [currentTest]);
```

**Step 2: Update getCurrentSegment function**

Replace references to `audioSegments` with `activeSegments`:

```javascript
const getCurrentSegment = (currentTime) => {
  return activeSegments.find(
    (seg) => currentTime >= seg.start && currentTime < seg.end
  ) || activeSegments[0];
};
```

**Step 3: Update timeline rendering**

Replace all occurrences of `audioSegments.map(...)` with `activeSegments.map(...)` in the timeline section.

**Step 4: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 5: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: use dynamic segments from test data"
```

---

## Task 11: Frontend - Conditional copy/questions display

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (test view section)

**Step 1: Add computed values for current segment capabilities**

```javascript
const currentSegment = getCurrentSegment(audioCurrentTime);
const showCopySection = currentSegment?.enablesCopy || false;
const showQuestionsSection = currentSegment?.enablesQuestions || false;
const examComplete = audioPlayed; // After audio finishes, show everything
```

**Step 2: Add user guidance notice**

Before the audio player, add:

```javascript
{!audioPlayed && !isPlaying && (
  <div className="mb-4 p-3 border-2 border-amber-300 bg-amber-50 text-amber-800 font-mono text-sm">
    Sections will appear as the recording progresses. Copy practice appears during practice segments.
    Questions appear during the test segment. You'll see everything together at the end.
  </div>
)}
```

**Step 3: Wrap copy section with conditional**

Find the copy text input section and wrap it:

```javascript
{(showCopySection || examComplete) && (
  <div className="copy-section">
    {/* existing copy text input */}
  </div>
)}
```

**Step 4: Wrap questions section with conditional**

Find the questions section and wrap it:

```javascript
{(showQuestionsSection || examComplete) && (
  <div className="questions-section">
    {/* existing questions display */}
  </div>
)}
```

**Step 5: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 6: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: conditionally show copy/questions based on segment"
```

---

## Task 12: Build and Test

**Step 1: Build backend**

Run: `cargo build`
Expected: Compiles without errors

**Step 2: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Manual testing**

Start server: `cargo run`

Test:
1. Go to admin panel → Tests → click "Segments" on a test
2. Add segments with different timings and copy/questions flags
3. Save and verify segments persist
4. Go to public test view
5. Start audio playback and verify sections appear/disappear
6. Verify all sections visible after audio completes

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete segment timing configuration"
```

---

## Summary

This implementation:
1. Adds `segments` JSON column to tests table
2. Updates Rust types and API handlers to include segments
3. Adds SegmentForm and SegmentEditor admin components
4. Removes hardcoded segment timing from frontend
5. Dynamically shows/hides copy and question sections during playback
6. Shows all content at end of exam for review
