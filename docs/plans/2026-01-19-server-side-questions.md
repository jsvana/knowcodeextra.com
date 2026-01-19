# Server-Side Questions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move questions/answers from frontend to database with server-side validation and admin question editor.

**Architecture:** New `tests` and `questions` tables. Public API serves questions without answers. Submit endpoint validates server-side and only returns correct answers on pass. Admin API for CRUD operations on tests and questions.

**Tech Stack:** Rust/Axum backend, SQLite, React frontend

---

## Task 1: Database Schema - Tests Table

**Files:**
- Modify: `src/main.rs:235-311` (setup_database function)

**Step 1: Add tests table creation**

In `setup_database`, after the attempts table creation, add:

```rust
// Create tests table
sqlx::query(
    r#"
    CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        speed_wpm INTEGER NOT NULL,
        year TEXT NOT NULL,
        audio_url TEXT NOT NULL,
        passing_score INTEGER NOT NULL DEFAULT 7,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )
    "#,
)
.execute(pool)
.await?;
```

**Step 2: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: add tests table schema"
```

---

## Task 2: Database Schema - Questions Table

**Files:**
- Modify: `src/main.rs:235-311` (setup_database function)

**Step 1: Add questions table creation**

After tests table, add:

```rust
// Create questions table
sqlx::query(
    r#"
    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        test_id TEXT NOT NULL,
        question_number INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_option TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (test_id) REFERENCES tests(id),
        UNIQUE(test_id, question_number)
    )
    "#,
)
.execute(pool)
.await?;

// Add test_id to attempts table (nullable for backwards compat)
sqlx::query("ALTER TABLE attempts ADD COLUMN test_id TEXT")
    .execute(pool)
    .await
    .ok();

// Index for question lookups
sqlx::query("CREATE INDEX IF NOT EXISTS idx_questions_test_id ON questions(test_id)")
    .execute(pool)
    .await?;
```

**Step 2: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: add questions table schema"
```

---

## Task 3: Seed Initial Test Data

**Files:**
- Modify: `src/main.rs` (setup_database function)

**Step 1: Add seed function**

After schema setup, add seed logic:

```rust
// Seed default test if none exists
let test_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tests")
    .fetch_one(pool)
    .await?;

if test_count.0 == 0 {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO tests (id, title, speed_wpm, year, audio_url, passing_score, active, created_at)
        VALUES ('20wpm-extra-1991', 'Extra Class', 20, '1991', '/audio/20wpm/test.mp3', 7, 1, ?)
        "#,
    )
    .bind(&now)
    .execute(pool)
    .await?;

    tracing::info!("Seeded default test: 20wpm-extra-1991");
}
```

**Step 2: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: seed default test on startup"
```

---

## Task 4: Data Types for Tests API

**Files:**
- Modify: `src/main.rs` (Data Types section around line 130)

**Step 1: Add test and question structs**

After existing data types, add:

```rust
// Test data types (for public API - no correct answers)
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Test {
    pub id: String,
    pub title: String,
    pub speed_wpm: i32,
    pub year: String,
    pub audio_url: String,
    pub passing_score: i32,
    pub active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PublicQuestion {
    pub id: String,
    pub test_id: String,
    pub question_number: i32,
    pub question_text: String,
    pub option_a: String,
    pub option_b: String,
    pub option_c: String,
    pub option_d: String,
    // NOTE: correct_option intentionally excluded
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct QuestionWithAnswer {
    pub id: String,
    pub question_number: i32,
    pub question_text: String,
    pub option_a: String,
    pub option_b: String,
    pub option_c: String,
    pub option_d: String,
    pub correct_option: String,
}

#[derive(Debug, Deserialize)]
pub struct TestSubmission {
    pub callsign: String,
    pub answers: std::collections::HashMap<String, String>, // question_id -> "A"/"B"/"C"/"D"
    pub copy_text: Option<String>,
    pub audio_progress: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct TestSubmissionResponse {
    pub passed: bool,
    pub score: i32,
    pub passing_score: i32,
    pub correct_answers: Option<std::collections::HashMap<String, String>>, // Only on pass
    pub certificate_id: Option<String>,
}
```

**Step 2: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: add data types for tests API"
```

---

## Task 5: Public API - List Tests

**Files:**
- Modify: `src/main.rs` (Handlers section)

**Step 1: Add list_tests handler**

```rust
/// GET /api/tests - List active tests
async fn list_tests(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let tests: Vec<Test> = sqlx::query_as(
        "SELECT id, title, speed_wpm, year, audio_url, passing_score, active, created_at
         FROM tests WHERE active = 1 ORDER BY speed_wpm"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(tests))
}
```

**Step 2: Add route in router**

In the Router::new() section, add after `/api/stats`:

```rust
.route("/api/tests", get(list_tests))
```

**Step 3: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: add GET /api/tests endpoint"
```

---

## Task 6: Public API - Get Test Questions

**Files:**
- Modify: `src/main.rs` (Handlers section)

**Step 1: Add get_test_questions handler**

```rust
/// GET /api/tests/:test_id/questions - Get questions without correct answers
async fn get_test_questions(
    State(state): State<Arc<AppState>>,
    Path(test_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Verify test exists and is active
    let test: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM tests WHERE id = ? AND active = 1"
    )
    .bind(&test_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if test.is_none() {
        return Err((StatusCode::NOT_FOUND, "Test not found".to_string()));
    }

    let questions: Vec<PublicQuestion> = sqlx::query_as(
        "SELECT id, test_id, question_number, question_text, option_a, option_b, option_c, option_d
         FROM questions WHERE test_id = ? ORDER BY question_number"
    )
    .bind(&test_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(questions))
}
```

**Step 2: Add route in router**

```rust
.route("/api/tests/:test_id/questions", get(get_test_questions))
```

**Step 3: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: add GET /api/tests/:id/questions endpoint"
```

---

## Task 7: Public API - Submit Test

**Files:**
- Modify: `src/main.rs` (Handlers section)

**Step 1: Add submit_test handler**

```rust
/// POST /api/tests/:test_id/submit - Submit and validate test answers
async fn submit_test(
    State(state): State<Arc<AppState>>,
    Path(test_id): Path<String>,
    Json(submission): Json<TestSubmission>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let callsign = submission.callsign.trim().to_uppercase();
    if callsign.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Callsign is required".to_string()));
    }

    // Get test info
    let test: Option<Test> = sqlx::query_as(
        "SELECT id, title, speed_wpm, year, audio_url, passing_score, active, created_at
         FROM tests WHERE id = ? AND active = 1"
    )
    .bind(&test_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let test = test.ok_or((StatusCode::NOT_FOUND, "Test not found".to_string()))?;

    // Rate limit: once per day
    let today_attempt: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM attempts WHERE callsign = ? AND date(created_at) = date('now') LIMIT 1",
    )
    .bind(&callsign)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if today_attempt.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            "You can only attempt the test once per day. Try again tomorrow!".to_string(),
        ));
    }

    // Check for existing pending/approved attempt
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM attempts WHERE callsign = ? AND validation_status IN ('pending', 'approved') LIMIT 1"
    )
    .bind(&callsign)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if existing.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            "You already have a passed attempt awaiting validation.".to_string(),
        ));
    }

    // Get questions with correct answers for validation
    let questions: Vec<QuestionWithAnswer> = sqlx::query_as(
        "SELECT id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option
         FROM questions WHERE test_id = ? ORDER BY question_number"
    )
    .bind(&test_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Calculate score
    let mut correct_count = 0;
    let mut correct_answers: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for q in &questions {
        correct_answers.insert(q.id.clone(), q.correct_option.clone());
        if let Some(user_answer) = submission.answers.get(&q.id) {
            if user_answer.to_uppercase() == q.correct_option {
                correct_count += 1;
            }
        }
    }

    let copy_chars = submission.copy_text.as_ref().map(|t| t.len() as i32).unwrap_or(0);
    let passed = correct_count >= test.passing_score || copy_chars >= 100;

    // Record attempt
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO attempts (id, callsign, test_speed, questions_correct, copy_chars, passed, created_at, validation_status, audio_progress, test_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&callsign)
    .bind(test.speed_wpm)
    .bind(correct_count)
    .bind(copy_chars)
    .bind(passed)
    .bind(now.to_rfc3339())
    .bind(if passed { Some("pending") } else { None::<&str> })
    .bind(submission.audio_progress)
    .bind(&test_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response = TestSubmissionResponse {
        passed,
        score: correct_count,
        passing_score: test.passing_score,
        correct_answers: if passed { Some(correct_answers) } else { None },
        certificate_id: if passed { Some(id) } else { None },
    };

    Ok(Json(response))
}
```

**Step 2: Add route in router**

```rust
.route("/api/tests/:test_id/submit", post(submit_test))
```

**Step 3: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: add POST /api/tests/:id/submit endpoint"
```

---

## Task 8: Admin API - Test CRUD

**Files:**
- Modify: `src/admin.rs`

**Step 1: Add data types for admin test management**

At top of admin.rs, add:

```rust
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateTestRequest {
    pub id: String,
    pub title: String,
    pub speed_wpm: i32,
    pub year: String,
    pub audio_url: String,
    #[serde(default = "default_passing_score")]
    pub passing_score: i32,
}

fn default_passing_score() -> i32 { 7 }

#[derive(Debug, Deserialize)]
pub struct UpdateTestRequest {
    pub title: Option<String>,
    pub speed_wpm: Option<i32>,
    pub year: Option<String>,
    pub audio_url: Option<String>,
    pub passing_score: Option<i32>,
    pub active: Option<bool>,
}

#[derive(Debug, Serialize, FromRow)]
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
}
```

**Step 2: Add list tests handler for admin**

```rust
/// GET /api/admin/tests - List all tests (including inactive)
pub async fn list_tests_admin(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let tests: Vec<AdminTest> = sqlx::query_as(
        r#"
        SELECT t.id, t.title, t.speed_wpm, t.year, t.audio_url, t.passing_score, t.active, t.created_at,
               (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
        FROM tests t
        ORDER BY t.speed_wpm, t.title
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(tests))
}
```

**Step 3: Add create test handler**

```rust
/// POST /api/admin/tests - Create new test
pub async fn create_test(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<CreateTestRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO tests (id, title, speed_wpm, year, audio_url, passing_score, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
    )
    .bind(&req.id)
    .bind(&req.title)
    .bind(req.speed_wpm)
    .bind(&req.year)
    .bind(&req.audio_url)
    .bind(req.passing_score)
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true, "id": req.id })))
}
```

**Step 4: Add update test handler**

```rust
/// PUT /api/admin/tests/:id - Update test
pub async fn update_test(
    State(state): State<Arc<crate::AppState>>,
    Path(test_id): Path<String>,
    Json(req): Json<UpdateTestRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut updates = Vec::new();
    let mut bindings: Vec<String> = Vec::new();

    if let Some(ref title) = req.title {
        updates.push("title = ?");
        bindings.push(title.clone());
    }
    if let Some(speed) = req.speed_wpm {
        updates.push("speed_wpm = ?");
        bindings.push(speed.to_string());
    }
    if let Some(ref year) = req.year {
        updates.push("year = ?");
        bindings.push(year.clone());
    }
    if let Some(ref url) = req.audio_url {
        updates.push("audio_url = ?");
        bindings.push(url.clone());
    }
    if let Some(score) = req.passing_score {
        updates.push("passing_score = ?");
        bindings.push(score.to_string());
    }
    if let Some(active) = req.active {
        updates.push("active = ?");
        bindings.push(if active { "1".to_string() } else { "0".to_string() });
    }

    if updates.is_empty() {
        return Ok(Json(serde_json::json!({ "success": true, "updated": false })));
    }

    let query = format!("UPDATE tests SET {} WHERE id = ?", updates.join(", "));
    let mut q = sqlx::query(&query);
    for b in &bindings {
        q = q.bind(b);
    }
    q = q.bind(&test_id);

    let result = q.execute(&state.db).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Test not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}
```

**Step 5: Add delete (deactivate) test handler**

```rust
/// DELETE /api/admin/tests/:id - Deactivate test
pub async fn delete_test(
    State(state): State<Arc<crate::AppState>>,
    Path(test_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let result = sqlx::query("UPDATE tests SET active = 0 WHERE id = ?")
        .bind(&test_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Test not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}
```

**Step 6: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 7: Commit**

```bash
git add src/admin.rs
git commit -m "feat: add admin test CRUD handlers"
```

---

## Task 9: Admin API - Question CRUD

**Files:**
- Modify: `src/admin.rs`

**Step 1: Add question data types**

```rust
#[derive(Debug, Deserialize)]
pub struct CreateQuestionRequest {
    pub question_number: i32,
    pub question_text: String,
    pub option_a: String,
    pub option_b: String,
    pub option_c: String,
    pub option_d: String,
    pub correct_option: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateQuestionRequest {
    pub question_number: Option<i32>,
    pub question_text: Option<String>,
    pub option_a: Option<String>,
    pub option_b: Option<String>,
    pub option_c: Option<String>,
    pub option_d: Option<String>,
    pub correct_option: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AdminQuestion {
    pub id: String,
    pub test_id: String,
    pub question_number: i32,
    pub question_text: String,
    pub option_a: String,
    pub option_b: String,
    pub option_c: String,
    pub option_d: String,
    pub correct_option: String,
    pub created_at: DateTime<Utc>,
}
```

**Step 2: Add list questions handler**

```rust
/// GET /api/admin/tests/:test_id/questions - List all questions for a test
pub async fn list_questions_admin(
    State(state): State<Arc<crate::AppState>>,
    Path(test_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let questions: Vec<AdminQuestion> = sqlx::query_as(
        "SELECT id, test_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, created_at
         FROM questions WHERE test_id = ? ORDER BY question_number"
    )
    .bind(&test_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(questions))
}
```

**Step 3: Add create question handler**

```rust
/// POST /api/admin/tests/:test_id/questions - Create new question
pub async fn create_question(
    State(state): State<Arc<crate::AppState>>,
    Path(test_id): Path<String>,
    Json(req): Json<CreateQuestionRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate correct_option
    if !["A", "B", "C", "D"].contains(&req.correct_option.to_uppercase().as_str()) {
        return Err((StatusCode::BAD_REQUEST, "correct_option must be A, B, C, or D".to_string()));
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO questions (id, test_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&test_id)
    .bind(req.question_number)
    .bind(&req.question_text)
    .bind(&req.option_a)
    .bind(&req.option_b)
    .bind(&req.option_c)
    .bind(&req.option_d)
    .bind(req.correct_option.to_uppercase())
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true, "id": id })))
}
```

**Step 4: Add update question handler**

```rust
/// PUT /api/admin/questions/:id - Update question
pub async fn update_question(
    State(state): State<Arc<crate::AppState>>,
    Path(question_id): Path<String>,
    Json(req): Json<UpdateQuestionRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if let Some(ref opt) = req.correct_option {
        if !["A", "B", "C", "D"].contains(&opt.to_uppercase().as_str()) {
            return Err((StatusCode::BAD_REQUEST, "correct_option must be A, B, C, or D".to_string()));
        }
    }

    let mut updates = Vec::new();
    let mut bindings: Vec<String> = Vec::new();

    if let Some(num) = req.question_number {
        updates.push("question_number = ?");
        bindings.push(num.to_string());
    }
    if let Some(ref text) = req.question_text {
        updates.push("question_text = ?");
        bindings.push(text.clone());
    }
    if let Some(ref a) = req.option_a {
        updates.push("option_a = ?");
        bindings.push(a.clone());
    }
    if let Some(ref b) = req.option_b {
        updates.push("option_b = ?");
        bindings.push(b.clone());
    }
    if let Some(ref c) = req.option_c {
        updates.push("option_c = ?");
        bindings.push(c.clone());
    }
    if let Some(ref d) = req.option_d {
        updates.push("option_d = ?");
        bindings.push(d.clone());
    }
    if let Some(ref opt) = req.correct_option {
        updates.push("correct_option = ?");
        bindings.push(opt.to_uppercase());
    }

    if updates.is_empty() {
        return Ok(Json(serde_json::json!({ "success": true, "updated": false })));
    }

    let query = format!("UPDATE questions SET {} WHERE id = ?", updates.join(", "));
    let mut q = sqlx::query(&query);
    for b in &bindings {
        q = q.bind(b);
    }
    q = q.bind(&question_id);

    let result = q.execute(&state.db).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Question not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}
```

**Step 5: Add delete question handler**

```rust
/// DELETE /api/admin/questions/:id - Delete question
pub async fn delete_question(
    State(state): State<Arc<crate::AppState>>,
    Path(question_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let result = sqlx::query("DELETE FROM questions WHERE id = ?")
        .bind(&question_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Question not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}
```

**Step 6: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 7: Commit**

```bash
git add src/admin.rs
git commit -m "feat: add admin question CRUD handlers"
```

---

## Task 10: Wire Up Admin Routes

**Files:**
- Modify: `src/main.rs` (Router section around line 676)

**Step 1: Add admin routes**

In the `admin_api` Router, add after existing routes:

```rust
.route("/tests", get(admin::list_tests_admin))
.route("/tests", post(admin::create_test))
.route("/tests/:id", axum::routing::put(admin::update_test))
.route("/tests/:id", axum::routing::delete(admin::delete_test))
.route("/tests/:test_id/questions", get(admin::list_questions_admin))
.route("/tests/:test_id/questions", post(admin::create_question))
.route("/questions/:id", axum::routing::put(admin::update_question))
.route("/questions/:id", axum::routing::delete(admin::delete_question))
```

**Step 2: Run to verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: wire up admin test/question routes"
```

---

## Task 11: Frontend - Remove Hardcoded Questions

**Files:**
- Modify: `frontend/knowcodeextra.jsx`

**Step 1: Remove testData constant**

Delete lines 12-72 (the entire `testData` constant).

**Step 2: Add state for fetched data**

After existing useState declarations (around line 168), add:

```javascript
const [tests, setTests] = useState([]);
const [currentTest, setCurrentTest] = useState(null);
const [questions, setQuestions] = useState([]);
const [correctAnswers, setCorrectAnswers] = useState(null);
const [loadingTest, setLoadingTest] = useState(false);
```

**Step 3: Add fetch tests effect**

After existing useEffect hooks, add:

```javascript
// Fetch available tests on mount
useEffect(() => {
  fetch(`${API_BASE}/api/tests`)
    .then(res => res.json())
    .then(data => setTests(data))
    .catch(err => console.error('Failed to fetch tests:', err));
}, []);
```

**Step 4: Run frontend build to check syntax**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors (may have runtime issues until we complete remaining tasks)

**Step 5: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "refactor: remove hardcoded testData, add API state"
```

---

## Task 12: Frontend - Fetch Questions on Test Select

**Files:**
- Modify: `frontend/knowcodeextra.jsx`

**Step 1: Update test selection logic**

Find the `startTest` function or where `setSelectedTest` is called. Replace with:

```javascript
const startTest = async (testId) => {
  setLoadingTest(true);
  try {
    const test = tests.find(t => t.id === testId);
    setCurrentTest(test);

    const res = await fetch(`${API_BASE}/api/tests/${testId}/questions`);
    const qs = await res.json();
    setQuestions(qs);
    setSelectedTest(testId);
    setAnswers({});
    setCorrectAnswers(null);
    setView('test');
  } catch (err) {
    console.error('Failed to fetch questions:', err);
    alert('Failed to load test questions');
  } finally {
    setLoadingTest(false);
  }
};
```

**Step 2: Update test selection UI**

Replace `Object.entries(testData).map(...)` with:

```javascript
{tests.map((test) => (
  <button
    key={test.id}
    onClick={() => startTest(test.id)}
    disabled={loadingTest}
    className="..."
  >
    {test.speed_wpm} WPM {test.title} ({test.year})
  </button>
))}
```

**Step 3: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: fetch questions from API on test select"
```

---

## Task 13: Frontend - Server-Side Submission

**Files:**
- Modify: `frontend/knowcodeextra.jsx`

**Step 1: Update submit logic**

Replace the existing `handleSubmit` function with:

```javascript
const handleSubmit = async () => {
  if (!userCall.trim()) {
    alert('Please enter your callsign');
    return;
  }

  setIsSubmitting(true);
  try {
    const res = await fetch(`${API_BASE}/api/tests/${selectedTest}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callsign: userCall.trim().toUpperCase(),
        answers: answers, // { questionId: "A", ... }
        copy_text: copyText || null,
        audio_progress: audioProgress,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      if (res.status === 400) {
        setBlockedMessage(error);
        return;
      }
      throw new Error(error);
    }

    const result = await res.json();
    setScore(result.score);
    setPassed(result.passed);
    setTestComplete(true);

    if (result.passed && result.correct_answers) {
      setCorrectAnswers(result.correct_answers);
      setCertificateNumber(result.certificate_id);
    }

    setView('results');
  } catch (err) {
    console.error('Submit failed:', err);
    alert('Failed to submit test: ' + err.message);
  } finally {
    setIsSubmitting(false);
  }
};
```

**Step 2: Update answer tracking**

Update how answers are stored. Instead of `setAnswers({...answers, [questionIndex]: optionIndex})`, use:

```javascript
const handleAnswer = (questionId, option) => {
  setAnswers({...answers, [questionId]: option}); // option is "A", "B", "C", or "D"
};
```

**Step 3: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: submit answers to server for validation"
```

---

## Task 14: Frontend - Update Question Display

**Files:**
- Modify: `frontend/knowcodeextra.jsx`

**Step 1: Update question rendering**

Update the question display section to use the new data format:

```javascript
{questions.map((q) => (
  <div key={q.id} className="mb-6 p-4 border border-amber-300 bg-amber-50/50">
    <p className="font-serif text-amber-900 mb-3">
      {q.question_number}. {q.question_text}
    </p>
    <div className="grid grid-cols-2 gap-2">
      {['A', 'B', 'C', 'D'].map((opt) => {
        const optionText = q[`option_${opt.toLowerCase()}`];
        const isSelected = answers[q.id] === opt;
        const isCorrect = correctAnswers && correctAnswers[q.id] === opt;
        const showCorrect = testComplete && passed && correctAnswers;

        return (
          <button
            key={opt}
            onClick={() => !testComplete && handleAnswer(q.id, opt)}
            disabled={testComplete}
            className={`p-2 text-left border transition-colors ${
              isSelected
                ? 'border-amber-600 bg-amber-200'
                : 'border-amber-300 hover:border-amber-400'
            } ${showCorrect && isCorrect ? 'ring-2 ring-green-500' : ''}`}
          >
            <span className="font-mono mr-2">{opt}.</span>
            {optionText}
          </button>
        );
      })}
    </div>
  </div>
))}
```

**Step 2: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: update question display for API data format"
```

---

## Task 15: Admin Frontend - Question Editor Component

**Files:**
- Modify: `frontend/knowcodeextra.jsx`

**Step 1: Add QuestionEditor component**

Add after the existing admin components:

```javascript
const QuestionEditor = ({ testId, onClose }) => {
  const [questions, setQuestions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchQuestions = async () => {
    setLoading(true);
    const token = localStorage.getItem('adminToken');
    const res = await fetch(`${API_BASE}/api/admin/tests/${testId}/questions`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    setQuestions(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuestions();
  }, [testId]);

  const saveQuestion = async (q) => {
    const token = localStorage.getItem('adminToken');
    const isNew = !q.id;
    const url = isNew
      ? `${API_BASE}/api/admin/tests/${testId}/questions`
      : `${API_BASE}/api/admin/questions/${q.id}`;

    await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(q),
    });

    setEditing(null);
    fetchQuestions();
  };

  const deleteQuestion = async (id) => {
    if (!confirm('Delete this question?')) return;
    const token = localStorage.getItem('adminToken');
    await fetch(`${API_BASE}/api/admin/questions/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    fetchQuestions();
  };

  const newQuestion = () => {
    setEditing({
      question_number: questions.length + 1,
      question_text: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct_option: 'A',
    });
  };

  if (loading) return <div>Loading questions...</div>;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-amber-50 border-4 border-amber-800 max-w-4xl w-full max-h-[90vh] overflow-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-serif text-2xl text-amber-900">Edit Questions</h2>
          <button onClick={onClose} className="text-amber-800 hover:text-amber-600">Close</button>
        </div>

        {editing ? (
          <QuestionForm
            question={editing}
            onSave={saveQuestion}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <button
              onClick={newQuestion}
              className="mb-4 px-4 py-2 bg-amber-700 text-amber-50 hover:bg-amber-600"
            >
              Add Question
            </button>

            <div className="space-y-2">
              {questions.map((q) => (
                <div key={q.id} className="flex items-center justify-between p-3 border border-amber-300 bg-white">
                  <span className="font-mono text-sm">
                    Q{q.question_number}: {q.question_text.substring(0, 50)}...
                  </span>
                  <div className="space-x-2">
                    <button
                      onClick={() => setEditing(q)}
                      className="px-2 py-1 text-sm border border-amber-500 text-amber-700 hover:bg-amber-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteQuestion(q.id)}
                      className="px-2 py-1 text-sm border border-red-500 text-red-700 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
```

**Step 2: Add QuestionForm component**

```javascript
const QuestionForm = ({ question, onSave, onCancel }) => {
  const [form, setForm] = useState(question);

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-mono text-amber-800 mb-1">Question Number</label>
        <input
          type="number"
          value={form.question_number}
          onChange={(e) => handleChange('question_number', parseInt(e.target.value))}
          className="w-20 p-2 border border-amber-300"
        />
      </div>

      <div>
        <label className="block text-sm font-mono text-amber-800 mb-1">Question Text</label>
        <textarea
          value={form.question_text}
          onChange={(e) => handleChange('question_text', e.target.value)}
          className="w-full p-2 border border-amber-300 h-20"
        />
      </div>

      {['A', 'B', 'C', 'D'].map((opt) => (
        <div key={opt}>
          <label className="block text-sm font-mono text-amber-800 mb-1">Option {opt}</label>
          <input
            value={form[`option_${opt.toLowerCase()}`]}
            onChange={(e) => handleChange(`option_${opt.toLowerCase()}`, e.target.value)}
            className="w-full p-2 border border-amber-300"
          />
        </div>
      ))}

      <div>
        <label className="block text-sm font-mono text-amber-800 mb-1">Correct Answer</label>
        <select
          value={form.correct_option}
          onChange={(e) => handleChange('correct_option', e.target.value)}
          className="p-2 border border-amber-300"
        >
          {['A', 'B', 'C', 'D'].map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          className="px-4 py-2 bg-amber-700 text-amber-50 hover:bg-amber-600"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-amber-500 text-amber-700 hover:bg-amber-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
```

**Step 3: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin question editor component"
```

---

## Task 16: Admin Frontend - Test Management UI

**Files:**
- Modify: `frontend/knowcodeextra.jsx`

**Step 1: Add TestManager component**

Find the admin section of the app and add a new tab/view for test management:

```javascript
const TestManager = () => {
  const [tests, setTests] = useState([]);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchTests = async () => {
    setLoading(true);
    const token = localStorage.getItem('adminToken');
    const res = await fetch(`${API_BASE}/api/admin/tests`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    setTests(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const toggleActive = async (test) => {
    const token = localStorage.getItem('adminToken');
    await fetch(`${API_BASE}/api/admin/tests/${test.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ active: !test.active }),
    });
    fetchTests();
  };

  if (loading) return <div>Loading tests...</div>;

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl text-amber-900 mb-4">Test Management</h2>

      <div className="space-y-2">
        {tests.map((test) => (
          <div
            key={test.id}
            className={`p-4 border ${test.active ? 'border-amber-500 bg-white' : 'border-gray-300 bg-gray-100'}`}
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="font-mono font-bold">{test.id}</span>
                <span className="ml-2 text-amber-800">
                  {test.speed_wpm} WPM - {test.title} ({test.year})
                </span>
                <span className="ml-2 text-sm text-amber-600">
                  {test.question_count} questions
                </span>
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => setEditingQuestions(test.id)}
                  className="px-3 py-1 border border-amber-500 text-amber-700 hover:bg-amber-100"
                >
                  Questions
                </button>
                <button
                  onClick={() => toggleActive(test)}
                  className={`px-3 py-1 border ${
                    test.active
                      ? 'border-red-500 text-red-700 hover:bg-red-100'
                      : 'border-green-500 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {test.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingQuestions && (
        <QuestionEditor
          testId={editingQuestions}
          onClose={() => {
            setEditingQuestions(null);
            fetchTests();
          }}
        />
      )}
    </div>
  );
};
```

**Step 2: Add "Tests" tab to admin navigation**

Find the admin navigation and add a tab for "Tests" that renders `<TestManager />`.

**Step 3: Run frontend build**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin test management UI"
```

---

## Task 17: Build and Test

**Step 1: Build backend**

Run: `cargo build`
Expected: Compiles without errors

**Step 2: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Start server and test**

Run: `cargo run`

Test endpoints:
- `curl http://localhost:3000/api/tests` - should return empty array or seeded test
- `curl http://localhost:3000/health` - should return OK

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete server-side questions implementation"
```

---

## Summary

This implementation:
1. Creates `tests` and `questions` tables with proper schema
2. Seeds the default 20wpm-extra-1991 test (without questions - add via admin)
3. Public API serves questions without answers
4. Submit endpoint validates server-side, returns correct answers only on pass
5. Admin API for full CRUD on tests and questions
6. Frontend fetches tests/questions from API
7. Admin UI for managing questions
