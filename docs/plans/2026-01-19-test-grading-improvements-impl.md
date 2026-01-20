# Test Grading Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add proper copy text grading with prosign support, show all attempts in admin, and conditionally show approve/reject buttons.

**Architecture:** New `grading` module handles all scoring logic. Database stores expected copy text per test and prosign mappings. Admin gets new "All Attempts" view and dashboard shows recent attempts.

**Tech Stack:** Rust/Axum backend, SQLite, React frontend with esbuild bundling.

---

## Task 1: Database Schema Migrations

**Files:**
- Modify: `src/main.rs:336-489` (setup_database function)

**Step 1: Add prosign_mappings table migration**

In `setup_database()`, after the questions table creation, add:

```rust
// Create prosign_mappings table
sqlx::query(
    r#"
    CREATE TABLE IF NOT EXISTS prosign_mappings (
        id TEXT PRIMARY KEY,
        prosign TEXT NOT NULL UNIQUE,
        alternate TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    "#,
)
.execute(pool)
.await?;
```

**Step 2: Add expected_copy_text column to tests**

Add after existing ALTER TABLE statements:

```rust
sqlx::query("ALTER TABLE tests ADD COLUMN expected_copy_text TEXT")
    .execute(pool)
    .await
    .ok();
```

**Step 3: Add copy_text and consecutive_correct columns to attempts**

Add after existing ALTER TABLE statements:

```rust
sqlx::query("ALTER TABLE attempts ADD COLUMN copy_text TEXT")
    .execute(pool)
    .await
    .ok();

sqlx::query("ALTER TABLE attempts ADD COLUMN consecutive_correct INTEGER")
    .execute(pool)
    .await
    .ok();
```

**Step 4: Seed default prosign mappings**

Add after test seeding:

```rust
// Seed default prosign mappings if none exist
let mapping_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM prosign_mappings")
    .fetch_one(pool)
    .await?;

if mapping_count.0 == 0 {
    let now = Utc::now().to_rfc3339();
    for (prosign, alternate) in [("<BT>", "="), ("<AR>", "+")] {
        sqlx::query(
            "INSERT INTO prosign_mappings (id, prosign, alternate, created_at) VALUES (?, ?, ?, ?)"
        )
        .bind(Uuid::new_v4().to_string())
        .bind(prosign)
        .bind(alternate)
        .bind(&now)
        .execute(pool)
        .await?;
    }
    tracing::info!("Seeded default prosign mappings");
}
```

**Step 5: Run and verify migrations**

Run: `cargo run`
Expected: Server starts, logs show "Database setup complete"

**Step 6: Commit**

```bash
git add src/main.rs
git commit -m "feat: add database schema for copy grading and prosigns"
```

---

## Task 2: Create Grading Module

**Files:**
- Create: `src/grading.rs`
- Modify: `src/main.rs:21` (add mod declaration)

**Step 1: Create grading module file with normalize function**

Create `src/grading.rs`:

```rust
//! Grading logic for test submissions
//!
//! Handles both question grading and copy text grading with prosign support.

use std::collections::HashMap;

/// Normalize text for comparison: uppercase, collapse whitespace, trim
pub fn normalize_text(text: &str) -> String {
    text.to_uppercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_text() {
        assert_eq!(normalize_text("hello world"), "HELLO WORLD");
        assert_eq!(normalize_text("  hello   world  "), "HELLO WORLD");
        assert_eq!(normalize_text("CQ CQ de W6JSV"), "CQ CQ DE W6JSV");
    }
}
```

**Step 2: Add mod declaration to main.rs**

In `src/main.rs`, after line 24 (`mod qrz;`), add:

```rust
mod grading;
```

**Step 3: Run tests**

Run: `cargo test grading`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/grading.rs src/main.rs
git commit -m "feat: add grading module with text normalization"
```

---

## Task 3: Add Question Grading to Module

**Files:**
- Modify: `src/grading.rs`

**Step 1: Add question grading types and function**

Add to `src/grading.rs` after normalize_text:

```rust
/// Result of grading a single question
#[derive(Debug, Clone)]
pub struct QuestionResult {
    pub question_id: String,
    pub correct: bool,
    pub user_answer: Option<String>,
    pub correct_answer: String,
}

/// Grade question answers against correct answers
pub fn grade_questions(
    answers: &HashMap<String, String>,
    correct_answers: &HashMap<String, String>,
) -> (i32, Vec<QuestionResult>) {
    let mut score = 0;
    let mut results = Vec::new();

    for (question_id, correct_answer) in correct_answers {
        let user_answer = answers.get(question_id).cloned();
        let is_correct = user_answer
            .as_ref()
            .map(|a| a.to_uppercase() == correct_answer.to_uppercase())
            .unwrap_or(false);

        if is_correct {
            score += 1;
        }

        results.push(QuestionResult {
            question_id: question_id.clone(),
            correct: is_correct,
            user_answer,
            correct_answer: correct_answer.clone(),
        });
    }

    (score, results)
}
```

**Step 2: Add tests for question grading**

Add to the tests module:

```rust
#[test]
fn test_grade_questions_all_correct() {
    let answers: HashMap<String, String> = [
        ("q1".to_string(), "A".to_string()),
        ("q2".to_string(), "B".to_string()),
    ].into_iter().collect();

    let correct: HashMap<String, String> = [
        ("q1".to_string(), "A".to_string()),
        ("q2".to_string(), "B".to_string()),
    ].into_iter().collect();

    let (score, _) = grade_questions(&answers, &correct);
    assert_eq!(score, 2);
}

#[test]
fn test_grade_questions_case_insensitive() {
    let answers: HashMap<String, String> = [
        ("q1".to_string(), "a".to_string()),
    ].into_iter().collect();

    let correct: HashMap<String, String> = [
        ("q1".to_string(), "A".to_string()),
    ].into_iter().collect();

    let (score, _) = grade_questions(&answers, &correct);
    assert_eq!(score, 1);
}

#[test]
fn test_grade_questions_missing_answer() {
    let answers: HashMap<String, String> = HashMap::new();

    let correct: HashMap<String, String> = [
        ("q1".to_string(), "A".to_string()),
    ].into_iter().collect();

    let (score, results) = grade_questions(&answers, &correct);
    assert_eq!(score, 0);
    assert!(!results[0].correct);
}
```

**Step 3: Run tests**

Run: `cargo test grading`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/grading.rs
git commit -m "feat: add question grading to grading module"
```

---

## Task 4: Add Copy Text Grading with Prosign Support

**Files:**
- Modify: `src/grading.rs`

**Step 1: Add prosign expansion helper**

Add after grade_questions:

```rust
/// Expand prosigns in expected text to their alternates for matching
/// Returns a list of (position, prosign_length, alternates) for each prosign found
fn find_prosigns(text: &str, mappings: &[(String, String)]) -> Vec<(usize, usize, Vec<String>)> {
    let mut prosigns = Vec::new();
    let text_upper = text.to_uppercase();

    for (prosign, alternate) in mappings {
        let prosign_upper = prosign.to_uppercase();
        let mut start = 0;
        while let Some(pos) = text_upper[start..].find(&prosign_upper) {
            let actual_pos = start + pos;
            prosigns.push((
                actual_pos,
                prosign.len(),
                vec![prosign_upper.clone(), alternate.to_uppercase()],
            ));
            start = actual_pos + 1;
        }
    }

    // Sort by position
    prosigns.sort_by_key(|(pos, _, _)| *pos);
    prosigns
}
```

**Step 2: Add consecutive correct matching function**

Add after find_prosigns:

```rust
/// Find the longest consecutive correct character sequence
/// Uses sliding window algorithm to find best match anywhere in user text
pub fn find_consecutive_correct(
    user_text: &str,
    expected_text: &str,
    prosign_mappings: &[(String, String)],
) -> i32 {
    let user_norm = normalize_text(user_text);
    let expected_norm = normalize_text(expected_text);

    if user_norm.is_empty() || expected_norm.is_empty() {
        return 0;
    }

    let user_chars: Vec<char> = user_norm.chars().collect();
    let expected_chars: Vec<char> = expected_norm.chars().collect();

    // Find prosigns in normalized expected text
    let prosigns = find_prosigns(&expected_norm, prosign_mappings);

    let mut max_consecutive = 0;

    // Try starting from each position in expected text
    for exp_start in 0..expected_chars.len() {
        // Try matching against each position in user text
        for user_start in 0..user_chars.len() {
            let consecutive = count_consecutive_matches(
                &user_chars,
                user_start,
                &expected_chars,
                exp_start,
                &prosigns,
            );
            max_consecutive = max_consecutive.max(consecutive);
        }
    }

    max_consecutive as i32
}

/// Count consecutive matching characters starting from given positions
fn count_consecutive_matches(
    user_chars: &[char],
    user_start: usize,
    expected_chars: &[char],
    exp_start: usize,
    prosigns: &[(usize, usize, Vec<String>)],
) -> usize {
    let mut count = 0;
    let mut user_pos = user_start;
    let mut exp_pos = exp_start;

    while user_pos < user_chars.len() && exp_pos < expected_chars.len() {
        // Check if we're at a prosign position
        if let Some((_, prosign_len, alternates)) = prosigns
            .iter()
            .find(|(pos, _, _)| *pos == exp_pos)
        {
            // Try to match any of the alternates
            let mut matched = false;
            for alt in alternates {
                let alt_chars: Vec<char> = alt.chars().collect();
                if user_pos + alt_chars.len() <= user_chars.len() {
                    let user_slice: String = user_chars[user_pos..user_pos + alt_chars.len()]
                        .iter()
                        .collect();
                    if user_slice == *alt {
                        count += alt_chars.len();
                        user_pos += alt_chars.len();
                        exp_pos += prosign_len;
                        matched = true;
                        break;
                    }
                }
            }
            if !matched {
                break;
            }
        } else {
            // Regular character comparison
            if user_chars[user_pos] == expected_chars[exp_pos] {
                count += 1;
                user_pos += 1;
                exp_pos += 1;
            } else {
                break;
            }
        }
    }

    count
}
```

**Step 3: Add tests for copy text grading**

Add to tests module:

```rust
#[test]
fn test_find_consecutive_correct_exact_match() {
    let result = find_consecutive_correct(
        "CQ CQ DE W6JSV",
        "CQ CQ DE W6JSV",
        &[],
    );
    assert_eq!(result, 14); // "CQ CQ DE W6JSV" normalized
}

#[test]
fn test_find_consecutive_correct_partial_match() {
    let result = find_consecutive_correct(
        "GARBAGE CQ CQ DE W6JSV MORE GARBAGE",
        "CQ CQ DE W6JSV",
        &[],
    );
    assert_eq!(result, 14);
}

#[test]
fn test_find_consecutive_correct_with_prosign() {
    let mappings = vec![("<BT>".to_string(), "=".to_string())];
    let result = find_consecutive_correct(
        "TEST = TEST",
        "TEST <BT> TEST",
        &mappings,
    );
    // "TEST = TEST" matches "TEST <BT> TEST" when = is alternate for <BT>
    assert!(result >= 11); // At least "TEST = TEST" length
}

#[test]
fn test_find_consecutive_correct_prosign_as_prosign() {
    let mappings = vec![("<BT>".to_string(), "=".to_string())];
    let result = find_consecutive_correct(
        "TEST <BT> TEST",
        "TEST <BT> TEST",
        &mappings,
    );
    assert!(result >= 14);
}

#[test]
fn test_find_consecutive_correct_case_insensitive() {
    let result = find_consecutive_correct(
        "cq cq de w6jsv",
        "CQ CQ DE W6JSV",
        &[],
    );
    assert_eq!(result, 14);
}

#[test]
fn test_find_consecutive_correct_empty() {
    assert_eq!(find_consecutive_correct("", "TEST", &[]), 0);
    assert_eq!(find_consecutive_correct("TEST", "", &[]), 0);
}
```

**Step 4: Run tests**

Run: `cargo test grading`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/grading.rs
git commit -m "feat: add copy text grading with prosign support"
```

---

## Task 5: Add Pass/Fail Determination

**Files:**
- Modify: `src/grading.rs`

**Step 1: Add PassReason enum and is_passing function**

Add after find_consecutive_correct:

```rust
/// Reason for passing the test
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PassReason {
    Questions,
    Copy,
    Both,
}

/// Determine if the test is passing and why
pub fn is_passing(
    question_score: i32,
    consecutive_correct: i32,
    passing_questions: i32,
    passing_copy_chars: i32,
) -> (bool, Option<PassReason>) {
    let questions_pass = question_score >= passing_questions;
    let copy_pass = consecutive_correct >= passing_copy_chars;

    match (questions_pass, copy_pass) {
        (true, true) => (true, Some(PassReason::Both)),
        (true, false) => (true, Some(PassReason::Questions)),
        (false, true) => (true, Some(PassReason::Copy)),
        (false, false) => (false, None),
    }
}
```

**Step 2: Add tests**

Add to tests module:

```rust
#[test]
fn test_is_passing_by_questions() {
    let (passed, reason) = is_passing(7, 50, 7, 100);
    assert!(passed);
    assert_eq!(reason, Some(PassReason::Questions));
}

#[test]
fn test_is_passing_by_copy() {
    let (passed, reason) = is_passing(5, 100, 7, 100);
    assert!(passed);
    assert_eq!(reason, Some(PassReason::Copy));
}

#[test]
fn test_is_passing_by_both() {
    let (passed, reason) = is_passing(8, 120, 7, 100);
    assert!(passed);
    assert_eq!(reason, Some(PassReason::Both));
}

#[test]
fn test_is_passing_fail() {
    let (passed, reason) = is_passing(5, 50, 7, 100);
    assert!(!passed);
    assert_eq!(reason, None);
}
```

**Step 3: Run tests**

Run: `cargo test grading`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/grading.rs
git commit -m "feat: add pass/fail determination to grading module"
```

---

## Task 6: Update Test Submission Handler

**Files:**
- Modify: `src/main.rs:217-316` (data types)
- Modify: `src/main.rs:824-937` (submit_test handler)

**Step 1: Update TestSubmissionResponse struct**

Replace the TestSubmissionResponse struct (around line 309):

```rust
#[derive(Debug, Serialize)]
pub struct TestSubmissionResponse {
    pub passed: bool,
    pub score: i32,
    pub passing_score: i32,
    pub consecutive_correct: i32,
    pub passing_copy_chars: i32,
    pub pass_reason: Option<grading::PassReason>,
    pub correct_answers: Option<std::collections::HashMap<String, String>>,
    pub certificate_id: Option<String>,
}
```

**Step 2: Update Test and TestRow to include expected_copy_text**

In the Test struct (around line 228), add:

```rust
pub expected_copy_text: Option<String>,
```

In the TestRow struct (around line 241), add:

```rust
pub expected_copy_text: Option<String>,
```

In the From<TestRow> for Test impl (around line 254), add to the Test construction:

```rust
expected_copy_text: row.expected_copy_text,
```

**Step 3: Update test queries to include expected_copy_text**

In `list_tests` (line 780), update query:
```rust
"SELECT id, title, speed_wpm, year, audio_url, passing_score, active, created_at, segments, expected_copy_text
 FROM tests WHERE active = 1 ORDER BY speed_wpm"
```

In `submit_test` (line 835), update query:
```rust
"SELECT id, title, speed_wpm, year, audio_url, passing_score, active, created_at, segments, expected_copy_text
 FROM tests WHERE id = ? AND active = 1"
```

**Step 4: Update submit_test handler to use grading module**

Replace the scoring logic in submit_test (starting around line 888):

```rust
// Get prosign mappings for copy grading
let prosign_mappings: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
    "SELECT prosign, alternate FROM prosign_mappings"
)
.fetch_all(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

// Grade questions
let mut correct_answers: std::collections::HashMap<String, String> = std::collections::HashMap::new();
for q in &questions {
    correct_answers.insert(q.id.clone(), q.correct_option.clone());
}

let (question_score, _) = grading::grade_questions(&submission.answers, &correct_answers);

// Grade copy text
let copy_text = submission.copy_text.as_deref().unwrap_or("");
let consecutive_correct = if let Some(expected) = &test.expected_copy_text {
    grading::find_consecutive_correct(copy_text, expected, &prosign_mappings)
} else {
    // No expected text configured, fall back to character count
    grading::normalize_text(copy_text).len() as i32
};

// Determine pass/fail
let passing_copy_chars = 100;
let (passed, pass_reason) = grading::is_passing(
    question_score,
    consecutive_correct,
    test.passing_score,
    passing_copy_chars,
);
```

**Step 5: Update the INSERT statement to store copy_text and consecutive_correct**

Update the INSERT query (around line 908):

```rust
sqlx::query(
    r#"
    INSERT INTO attempts (id, callsign, test_speed, questions_correct, copy_chars, passed, created_at, validation_status, audio_progress, test_id, copy_text, consecutive_correct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    "#,
)
.bind(&id)
.bind(&callsign)
.bind(test.speed_wpm)
.bind(question_score)
.bind(copy_text.len() as i32)
.bind(passed)
.bind(now.to_rfc3339())
.bind(if passed { Some("pending") } else { None::<&str> })
.bind(submission.audio_progress)
.bind(&test_id)
.bind(if copy_text.is_empty() { None } else { Some(copy_text) })
.bind(consecutive_correct)
.execute(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

**Step 6: Update the response**

Update the response construction:

```rust
let response = TestSubmissionResponse {
    passed,
    score: question_score,
    passing_score: test.passing_score,
    consecutive_correct,
    passing_copy_chars,
    pass_reason,
    correct_answers: if passed { Some(correct_answers) } else { None },
    certificate_id: if passed { Some(id) } else { None },
};
```

**Step 7: Build and verify**

Run: `cargo build`
Expected: Compiles without errors

**Step 8: Commit**

```bash
git add src/main.rs
git commit -m "feat: use grading module in test submission handler"
```

---

## Task 7: Add Prosign Admin Endpoints

**Files:**
- Modify: `src/admin.rs`
- Modify: `src/main.rs` (routes)

**Step 1: Add prosign types to admin.rs**

Add at the top of admin.rs after existing types:

```rust
#[derive(Debug, Serialize, FromRow)]
pub struct ProsignMapping {
    pub id: String,
    pub prosign: String,
    pub alternate: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProsignRequest {
    pub prosign: String,
    pub alternate: String,
}
```

**Step 2: Add prosign CRUD endpoints**

Add after delete_question:

```rust
// ============================================================================
// PROSIGN MAPPING ENDPOINTS
// ============================================================================

/// GET /api/admin/prosigns - List all prosign mappings
pub async fn list_prosigns(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mappings: Vec<ProsignMapping> = sqlx::query_as(
        "SELECT id, prosign, alternate, created_at FROM prosign_mappings ORDER BY prosign"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(mappings))
}

/// POST /api/admin/prosigns - Create prosign mapping
pub async fn create_prosign(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<CreateProsignRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO prosign_mappings (id, prosign, alternate, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.prosign.to_uppercase())
    .bind(&req.alternate.to_uppercase())
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true, "id": id })))
}

/// DELETE /api/admin/prosigns/:id - Delete prosign mapping
pub async fn delete_prosign(
    State(state): State<Arc<crate::AppState>>,
    Path(prosign_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let result = sqlx::query("DELETE FROM prosign_mappings WHERE id = ?")
        .bind(&prosign_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Prosign mapping not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}
```

**Step 3: Add routes in main.rs**

In the admin_api Router (around line 1017), add:

```rust
.route("/prosigns", get(admin::list_prosigns))
.route("/prosigns", post(admin::create_prosign))
.route("/prosigns/:id", axum::routing::delete(admin::delete_prosign))
```

**Step 4: Build and verify**

Run: `cargo build`
Expected: Compiles without errors

**Step 5: Commit**

```bash
git add src/admin.rs src/main.rs
git commit -m "feat: add prosign mapping admin endpoints"
```

---

## Task 8: Add All Attempts Admin Endpoint

**Files:**
- Modify: `src/admin.rs`
- Modify: `src/main.rs` (routes)

**Step 1: Add types for all attempts**

Add to admin.rs:

```rust
#[derive(Debug, Deserialize)]
pub struct AllAttemptsQuery {
    #[serde(default = "default_page")]
    pub page: i32,
    #[serde(default = "default_per_page")]
    pub per_page: i32,
    pub passed: Option<bool>,
    pub callsign: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AttemptListItem {
    pub id: String,
    pub callsign: String,
    pub test_speed: i32,
    pub questions_correct: i32,
    pub copy_chars: i32,
    pub consecutive_correct: Option<i32>,
    pub passed: bool,
    pub validation_status: Option<String>,
    pub created_at: DateTime<Utc>,
    pub copy_text: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AllAttemptsResponse {
    pub items: Vec<AttemptListItem>,
    pub total: i64,
    pub page: i32,
    pub per_page: i32,
}
```

**Step 2: Add all attempts endpoint**

Add to admin.rs:

```rust
/// GET /api/admin/attempts - List all attempts with filters
pub async fn list_all_attempts(
    State(state): State<Arc<crate::AppState>>,
    Query(query): Query<AllAttemptsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let offset = (query.page - 1) * query.per_page;

    // Build dynamic query
    let mut conditions = Vec::new();
    let mut count_conditions = Vec::new();

    if let Some(passed) = query.passed {
        let cond = if passed { "passed = 1" } else { "passed = 0" };
        conditions.push(cond.to_string());
        count_conditions.push(cond.to_string());
    }

    if let Some(ref callsign) = query.callsign {
        let cond = format!("callsign LIKE '%{}%'", callsign.to_uppercase().replace('\'', "''"));
        conditions.push(cond.clone());
        count_conditions.push(cond);
    }

    if let Some(ref date_from) = query.date_from {
        let cond = format!("date(created_at) >= '{}'", date_from.replace('\'', "''"));
        conditions.push(cond.clone());
        count_conditions.push(cond);
    }

    if let Some(ref date_to) = query.date_to {
        let cond = format!("date(created_at) <= '{}'", date_to.replace('\'', "''"));
        conditions.push(cond.clone());
        count_conditions.push(cond);
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let count_where = if count_conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", count_conditions.join(" AND "))
    };

    // Get total count
    let count_query = format!("SELECT COUNT(*) FROM attempts {}", count_where);
    let total: (i64,) = sqlx::query_as(&count_query)
        .fetch_one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get items
    let items_query = format!(
        "SELECT id, callsign, test_speed, questions_correct, copy_chars, consecutive_correct, passed, validation_status, created_at, copy_text
         FROM attempts {}
         ORDER BY created_at DESC
         LIMIT {} OFFSET {}",
        where_clause, query.per_page, offset
    );

    let items: Vec<AttemptListItem> = sqlx::query_as(&items_query)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AllAttemptsResponse {
        items,
        total: total.0,
        page: query.page,
        per_page: query.per_page,
    }))
}
```

**Step 3: Add route in main.rs**

In the admin_api Router, add:

```rust
.route("/attempts", get(admin::list_all_attempts))
```

**Step 4: Build and verify**

Run: `cargo build`
Expected: Compiles without errors

**Step 5: Commit**

```bash
git add src/admin.rs src/main.rs
git commit -m "feat: add all attempts admin endpoint with filters"
```

---

## Task 9: Update Admin Stats with Recent Attempts

**Files:**
- Modify: `src/admin.rs`

**Step 1: Add recent_attempts to AdminStatsResponse**

Update AdminStatsResponse:

```rust
#[derive(Debug, Serialize)]
pub struct AdminStatsResponse {
    pub pending_count: i64,
    pub approved_today: i64,
    pub total_certificates: i64,
    pub rejected_count: i64,
    pub recent_activity: Vec<RecentActivity>,
    pub recent_attempts: Vec<RecentAttempt>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct RecentAttempt {
    pub id: String,
    pub callsign: String,
    pub questions_correct: i32,
    pub consecutive_correct: Option<i32>,
    pub passed: bool,
    pub created_at: DateTime<Utc>,
}
```

**Step 2: Update get_admin_stats to fetch recent attempts**

Add before the final Ok(Json(...)) in get_admin_stats:

```rust
// Recent attempts (last 10, both pass and fail)
let recent_attempts: Vec<RecentAttempt> = sqlx::query_as(
    r#"
    SELECT id, callsign, questions_correct, consecutive_correct, passed, created_at
    FROM attempts
    ORDER BY created_at DESC
    LIMIT 10
    "#,
)
.fetch_all(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

Update the response to include recent_attempts:

```rust
Ok(Json(AdminStatsResponse {
    pending_count: pending.0,
    approved_today: approved_today.0,
    total_certificates: total_certs.0,
    rejected_count: rejected.0,
    recent_activity: recent,
    recent_attempts,
}))
```

**Step 3: Build and verify**

Run: `cargo build`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/admin.rs
git commit -m "feat: add recent attempts to admin stats"
```

---

## Task 10: Update Admin Tests Endpoint for expected_copy_text

**Files:**
- Modify: `src/admin.rs`

**Step 1: Update AdminTest and AdminTestRow**

Add to AdminTest struct:

```rust
pub expected_copy_text: Option<String>,
```

Add to AdminTestRow struct:

```rust
pub expected_copy_text: Option<String>,
```

**Step 2: Update list_tests_admin query**

Update the query to include expected_copy_text:

```rust
let rows: Vec<AdminTestRow> = sqlx::query_as(
    r#"
    SELECT t.id, t.title, t.speed_wpm, t.year, t.audio_url, t.passing_score, t.active, t.created_at, t.segments, t.expected_copy_text,
           (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
    FROM tests t
    ORDER BY t.speed_wpm, t.title
    "#,
)
```

Update the AdminTest construction to include expected_copy_text:

```rust
expected_copy_text: row.expected_copy_text,
```

**Step 3: Update UpdateTestRequest**

Add to UpdateTestRequest struct:

```rust
pub expected_copy_text: Option<String>,
```

**Step 4: Update update_test handler**

Add handling for expected_copy_text in update_test:

```rust
if let Some(ref text) = req.expected_copy_text {
    updates.push("expected_copy_text = ?");
    bindings.push(text.clone());
}
```

**Step 5: Build and verify**

Run: `cargo build`
Expected: Compiles without errors

**Step 6: Commit**

```bash
git add src/admin.rs
git commit -m "feat: add expected_copy_text to admin test management"
```

---

## Task 11: Frontend - Update Test Page with Prosign Instructions

**Files:**
- Modify: `frontend/app.jsx`

**Step 1: Add prosign instructions to copy section**

In the copy area section (around line 771), update the instructional text:

```jsx
{/* Copy Area */}
{(showCopySection || examComplete) && (
  <div className="bg-white border-2 border-amber-300 p-6 mb-8 shadow-md">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-mono text-sm tracking-widest text-amber-900 font-bold">
        YOUR COPY
      </h3>
      <span className="font-mono text-sm text-amber-700 font-medium">
        {copyText.replace(/\s/g, "").length} characters
      </span>
    </div>
    <textarea
      value={copyText}
      onChange={(e) => setCopyText(e.target.value)}
      className="w-full h-40 border-2 border-amber-300 bg-amber-50 p-4 font-mono text-lg
              focus:border-amber-500 focus:outline-none resize-none"
      placeholder="Copy the transmission here..."
    />
    <div className="mt-2 space-y-1">
      <p className="font-serif text-xs text-amber-700 italic">
        Copy 100 consecutive correct characters to pass, OR answer 7 of 10 questions correctly.
      </p>
      <p className="font-serif text-xs text-amber-600">
        <strong>Prosigns:</strong> Enter prosigns in angle brackets, e.g., &lt;BT&gt; for break.
        Some prosigns can also be entered as their equivalent character (e.g., = for &lt;BT&gt;).
      </p>
    </div>
  </div>
)}
```

**Step 2: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Build completes without errors

**Step 3: Commit**

```bash
git add frontend/app.jsx
git commit -m "feat: add prosign instructions to test page"
```

---

## Task 12: Frontend - Update Results Page

**Files:**
- Modify: `frontend/app.jsx`

**Step 1: Add state for new response fields**

Add to state declarations (around line 74):

```jsx
const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
const [passReason, setPassReason] = useState(null);
```

**Step 2: Update handleSubmit to capture new fields**

In handleSubmit, after parsing the result (around line 252):

```jsx
const result = await res.json();
setScore({
  correct: result.score,
  total: questions.length,
  copyChars: copyText.replace(/\s/g, "").length,
  consecutiveCorrect: result.consecutive_correct,
});
setConsecutiveCorrect(result.consecutive_correct);
setPassReason(result.pass_reason);
setPassed(result.passed);
```

**Step 3: Update results page display**

In the results view (around line 920), update the copy stats box:

```jsx
<div className="bg-white p-6 border-2 border-amber-300 shadow-sm">
  <p className="font-mono text-xs text-amber-600 mb-1 font-medium">
    COPY
  </p>
  <p className="font-serif text-3xl font-bold text-amber-900">
    {consecutiveCorrect} correct
  </p>
  <p className="font-mono text-xs text-amber-600 mt-1 font-medium">
    {consecutiveCorrect >= 100 ? "\u2713 PASSED" : "\u2717 Need 100+"}
  </p>
</div>
```

**Step 4: Add pass reason indicator**

After the score boxes, add:

```jsx
{passed && passReason && (
  <div className="mt-4 text-center">
    <span className="inline-block bg-green-100 border border-green-300 px-4 py-2 font-mono text-sm text-green-800">
      Passed by: {passReason === 'both' ? 'Questions & Copy' : passReason === 'questions' ? 'Questions' : 'Copy'}
    </span>
  </div>
)}
```

**Step 5: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Build completes without errors

**Step 6: Commit**

```bash
git add frontend/app.jsx
git commit -m "feat: show consecutive correct and pass reason on results"
```

---

## Task 13: Frontend - Update Admin Queue with Conditional Buttons

**Files:**
- Modify: `frontend/admin-queue.jsx`

**Step 1: Update QueueItem to include consecutive_correct**

The backend already returns consecutive_correct in queue items. Update the display (around line 317):

```jsx
<div className="flex gap-4 mt-1 font-mono text-sm text-amber-600">
  <span>{item.questions_correct}/10</span>
  <span>{item.consecutive_correct ?? item.copy_chars} consecutive</span>
  <span>{formatRelativeTime(item.created_at)}</span>
</div>
```

**Step 2: Add isPassing helper function**

Add at the top of the AdminQueue component:

```jsx
const isPassing = (item) => {
  return item.questions_correct >= 7 || (item.consecutive_correct ?? 0) >= 100;
};
```

**Step 3: Conditionally show approve/reject buttons**

Update the buttons section (around line 323):

```jsx
<div className="flex gap-2">
  {isPassing(item) ? (
    <>
      <button
        onClick={() => handleApprove(item.id)}
        className="bg-green-600 text-white px-4 py-2 font-mono text-sm hover:bg-green-700"
      >
        Approve
      </button>
      <button
        onClick={() =>
          setRejectModal({ isOpen: true, attemptId: item.id })
        }
        className="bg-red-600 text-white px-4 py-2 font-mono text-sm hover:bg-red-700"
      >
        Reject
      </button>
    </>
  ) : (
    <span className="font-mono text-sm text-amber-500 italic">
      Not passing
    </span>
  )}
</div>
```

**Step 4: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Build completes without errors

**Step 5: Commit**

```bash
git add frontend/admin-queue.jsx
git commit -m "feat: conditionally show approve/reject for passing attempts"
```

---

## Task 14: Frontend - Add Admin All Attempts Tab

**Files:**
- Create: `frontend/admin-attempts.jsx`
- Modify: `frontend/index.jsx`
- Modify: `frontend/admin-layout.jsx`

**Step 1: Create admin-attempts.jsx**

Create `frontend/admin-attempts.jsx`:

```jsx
import React, { useState, useEffect } from "react";
import { API_BASE } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";
import { Toast } from "./admin-layout.jsx";

export function AdminAllAttempts() {
  const { adminFetch } = useAdminAuth();
  const [data, setData] = useState({ items: [], total: 0, page: 1, per_page: 25 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({
    passed: null,
    callsign: "",
    dateFrom: "",
    dateTo: "",
  });
  const [expandedId, setExpandedId] = useState(null);

  const fetchAttempts = async (page = 1) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/admin/attempts?page=${page}&per_page=25`;
      if (filters.passed !== null) url += `&passed=${filters.passed}`;
      if (filters.callsign) url += `&callsign=${encodeURIComponent(filters.callsign)}`;
      if (filters.dateFrom) url += `&date_from=${filters.dateFrom}`;
      if (filters.dateTo) url += `&date_to=${filters.dateTo}`;

      const response = await adminFetch(url);
      if (!response.ok) throw new Error("Failed to fetch attempts");
      const result = await response.json();
      setData(result);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts(1);
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const totalPages = Math.ceil(data.total / data.per_page);

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Filters */}
      <div className="bg-white border-2 border-amber-300 p-4 mb-4 grid grid-cols-4 gap-4">
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">STATUS</label>
          <select
            value={filters.passed === null ? "all" : filters.passed.toString()}
            onChange={(e) => handleFilterChange("passed", e.target.value === "all" ? null : e.target.value === "true")}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          >
            <option value="all">All</option>
            <option value="true">Passed</option>
            <option value="false">Failed</option>
          </select>
        </div>
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">CALLSIGN</label>
          <input
            type="text"
            value={filters.callsign}
            onChange={(e) => handleFilterChange("callsign", e.target.value.toUpperCase())}
            placeholder="Search..."
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">FROM DATE</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">TO DATE</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border-2 border-amber-300 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-amber-900 text-amber-50">
            <tr>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CALLSIGN</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">DATE</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">QUESTIONS</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CONSECUTIVE</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">PASSED</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center font-mono text-amber-600">
                  Loading...
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center font-serif italic text-amber-600">
                  No attempts found
                </td>
              </tr>
            ) : (
              data.items.map((item) => (
                <React.Fragment key={item.id}>
                  <tr
                    className={`cursor-pointer hover:bg-amber-50 ${!item.passed ? "opacity-60" : ""}`}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-amber-900">
                      {item.callsign}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {item.questions_correct}/10
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {item.consecutive_correct ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 font-mono ${item.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {item.passed ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 font-mono ${
                        item.validation_status === "approved" ? "bg-green-100 text-green-800" :
                        item.validation_status === "rejected" ? "bg-red-100 text-red-800" :
                        item.validation_status === "pending" ? "bg-amber-100 text-amber-800" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {item.validation_status || "—"}
                      </span>
                    </td>
                  </tr>
                  {expandedId === item.id && item.copy_text && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 bg-amber-50 border-t border-amber-200">
                        <h4 className="font-mono text-xs text-amber-700 mb-2">COPY TEXT</h4>
                        <pre className="font-mono text-sm text-amber-800 whitespace-pre-wrap bg-white p-3 border border-amber-200">
                          {item.copy_text}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-amber-200 flex items-center justify-between">
            <span className="font-mono text-sm text-amber-600">
              Showing {(data.page - 1) * data.per_page + 1}-{Math.min(data.page * data.per_page, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchAttempts(data.page - 1)}
                disabled={data.page <= 1}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => fetchAttempts(data.page + 1)}
                disabled={data.page >= totalPages}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Update admin-layout.jsx navigation**

In `frontend/admin-layout.jsx`, find the nav items array and add:

```jsx
{ id: "attempts", label: "All Attempts" },
```

**Step 3: Update index.jsx routing**

In `frontend/index.jsx`, add import:

```jsx
import { AdminAllAttempts } from "./admin-attempts.jsx";
```

And add the case in the admin view switch:

```jsx
case "attempts":
  return <AdminAllAttempts />;
```

**Step 4: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Build completes without errors

**Step 5: Commit**

```bash
git add frontend/admin-attempts.jsx frontend/admin-layout.jsx frontend/index.jsx
git commit -m "feat: add All Attempts admin tab"
```

---

## Task 15: Frontend - Add Recent Attempts to Dashboard

**Files:**
- Modify: `frontend/admin-queue.jsx`

**Step 1: Update AdminDashboard to display recent_attempts**

In AdminDashboard, after the recent_activity section, add:

```jsx
{/* Recent Attempts */}
<div className="bg-white border-2 border-amber-300 shadow-sm">
  <div className="bg-amber-900 text-amber-50 px-6 py-3">
    <h3 className="font-mono text-sm tracking-widest">RECENT ATTEMPTS</h3>
  </div>
  <div className="divide-y divide-amber-200">
    {!stats.recent_attempts || stats.recent_attempts.length === 0 ? (
      <p className="px-6 py-8 text-center text-amber-600 font-serif italic">
        No recent attempts
      </p>
    ) : (
      stats.recent_attempts.map((item) => (
        <div
          key={item.id}
          className={`px-6 py-4 flex items-center justify-between ${!item.passed ? "opacity-60" : ""}`}
        >
          <div>
            <span className="font-mono text-amber-900 font-bold">
              {item.callsign}
            </span>
            <span className="ml-2 font-mono text-sm text-amber-600">
              {item.questions_correct}/10
            </span>
            <span className="ml-2 font-mono text-sm text-amber-600">
              {item.consecutive_correct ?? "—"} consecutive
            </span>
            <span
              className={`ml-2 text-xs px-2 py-0.5 font-mono ${
                item.passed
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {item.passed ? "passed" : "failed"}
            </span>
          </div>
          <span className="font-mono text-xs text-amber-600">
            {new Date(item.created_at).toLocaleDateString()}
          </span>
        </div>
      ))
    )}
  </div>
</div>
```

**Step 2: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Build completes without errors

**Step 3: Commit**

```bash
git add frontend/admin-queue.jsx
git commit -m "feat: add recent attempts to admin dashboard"
```

---

## Task 16: Frontend - Add Prosign Mappings to Admin Tests

**Files:**
- Modify: `frontend/admin-tests.jsx`

**Step 1: Add prosign mappings state and UI**

Add to AdminTests component state:

```jsx
const [prosigns, setProsigns] = useState([]);
const [newProsign, setNewProsign] = useState({ prosign: "", alternate: "" });
const [loadingProsigns, setLoadingProsigns] = useState(false);
```

Add fetch function:

```jsx
const fetchProsigns = async () => {
  setLoadingProsigns(true);
  try {
    const response = await adminFetch(`${API_BASE}/api/admin/prosigns`);
    if (!response.ok) throw new Error("Failed to fetch prosigns");
    const data = await response.json();
    setProsigns(data);
  } catch (err) {
    setToast({ message: err.message, type: "error" });
  } finally {
    setLoadingProsigns(false);
  }
};

const handleAddProsign = async () => {
  if (!newProsign.prosign || !newProsign.alternate) return;
  try {
    const response = await adminFetch(`${API_BASE}/api/admin/prosigns`, {
      method: "POST",
      body: JSON.stringify(newProsign),
    });
    if (!response.ok) throw new Error("Failed to add prosign");
    setNewProsign({ prosign: "", alternate: "" });
    fetchProsigns();
    setToast({ message: "Prosign added", type: "success" });
  } catch (err) {
    setToast({ message: err.message, type: "error" });
  }
};

const handleDeleteProsign = async (id) => {
  try {
    const response = await adminFetch(`${API_BASE}/api/admin/prosigns/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete prosign");
    fetchProsigns();
    setToast({ message: "Prosign deleted", type: "success" });
  } catch (err) {
    setToast({ message: err.message, type: "error" });
  }
};
```

Call fetchProsigns in useEffect:

```jsx
useEffect(() => {
  fetchTests();
  fetchProsigns();
}, []);
```

Add prosign mappings UI section (after test list):

```jsx
{/* Prosign Mappings */}
<div className="bg-white border-2 border-amber-300 shadow-sm mt-6">
  <div className="bg-amber-900 text-amber-50 px-6 py-3 flex items-center justify-between">
    <h3 className="font-mono text-sm tracking-widest">PROSIGN MAPPINGS</h3>
  </div>
  <div className="p-4">
    <div className="flex gap-2 mb-4">
      <input
        type="text"
        value={newProsign.prosign}
        onChange={(e) => setNewProsign(p => ({ ...p, prosign: e.target.value.toUpperCase() }))}
        placeholder="<BT>"
        className="border-2 border-amber-300 px-3 py-2 font-mono text-sm w-24"
      />
      <span className="font-mono text-amber-600 self-center">=</span>
      <input
        type="text"
        value={newProsign.alternate}
        onChange={(e) => setNewProsign(p => ({ ...p, alternate: e.target.value.toUpperCase() }))}
        placeholder="="
        className="border-2 border-amber-300 px-3 py-2 font-mono text-sm w-16"
      />
      <button
        onClick={handleAddProsign}
        className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800"
      >
        Add
      </button>
    </div>
    <div className="space-y-2">
      {prosigns.map((p) => (
        <div key={p.id} className="flex items-center justify-between bg-amber-50 px-3 py-2">
          <span className="font-mono text-amber-800">
            {p.prosign} = {p.alternate}
          </span>
          <button
            onClick={() => handleDeleteProsign(p.id)}
            className="text-red-600 hover:text-red-800 font-mono text-sm"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  </div>
</div>
```

**Step 2: Add expected_copy_text to test edit form**

In the test edit modal, add a textarea for expected_copy_text:

```jsx
<div className="mb-4">
  <label className="font-mono text-xs text-amber-700 block mb-1">
    EXPECTED COPY TEXT (for grading)
  </label>
  <textarea
    value={editTest.expected_copy_text || ""}
    onChange={(e) => setEditTest({ ...editTest, expected_copy_text: e.target.value })}
    className="w-full border-2 border-amber-300 bg-white p-3 font-mono text-sm h-32 focus:border-amber-500 focus:outline-none"
    placeholder="Enter the expected copy text for this test..."
  />
</div>
```

**Step 3: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Build completes without errors

**Step 4: Commit**

```bash
git add frontend/admin-tests.jsx
git commit -m "feat: add prosign mappings and expected copy text to admin tests"
```

---

## Task 17: Final Integration Test

**Step 1: Start the server**

Run: `cargo run`
Expected: Server starts on port 3000

**Step 2: Test copy grading manually**

1. Open browser to http://localhost:3000
2. Enter callsign and start a test
3. Copy some text in the copy area
4. Submit and verify consecutive_correct is shown in results

**Step 3: Test admin features**

1. Go to http://localhost:3000/admin
2. Login with admin credentials
3. Verify "All Attempts" tab shows all attempts with filters
4. Verify dashboard shows recent attempts
5. Verify queue only shows approve/reject for passing attempts
6. Verify Tests page has expected_copy_text field
7. Verify prosign mappings can be added/deleted

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final integration verification"
```

---

## Summary

This plan implements:
1. **Database schema** - prosign_mappings table, expected_copy_text on tests, copy_text/consecutive_correct on attempts
2. **Grading module** - text normalization, question grading, copy text grading with prosign support
3. **Backend endpoints** - prosign CRUD, all attempts list, updated stats
4. **Frontend** - prosign instructions, results with pass reason, conditional approve/reject, All Attempts tab, prosign mappings management

Total tasks: 17
Estimated commits: 17
