# Validation Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add admin approval workflow for passed test attempts with sequential certificate numbers.

**Architecture:** Add validation columns to existing `attempts` table, create Basic auth middleware for admin routes, server-render HTML admin queue page, modify frontend to show pending state.

**Tech Stack:** Rust/Axum, SQLite, server-rendered HTML, React (frontend changes)

---

## Task 1: Add Database Columns

**Files:**
- Modify: `src/main.rs:185-220` (setup_database function)

**Step 1: Add migration for new columns**

In `setup_database()`, add after the CREATE TABLE statement:

```rust
// Add validation columns (idempotent - ignores if already exists)
sqlx::query("ALTER TABLE attempts ADD COLUMN validation_status TEXT")
    .execute(pool)
    .await
    .ok(); // Ignore error if column exists

sqlx::query("ALTER TABLE attempts ADD COLUMN certificate_number INTEGER")
    .execute(pool)
    .await
    .ok();

sqlx::query("ALTER TABLE attempts ADD COLUMN validated_at TEXT")
    .execute(pool)
    .await
    .ok();

sqlx::query("ALTER TABLE attempts ADD COLUMN admin_note TEXT")
    .execute(pool)
    .await
    .ok();

// Index for validation queue queries
sqlx::query("CREATE INDEX IF NOT EXISTS idx_validation_status ON attempts(validation_status)")
    .execute(pool)
    .await?;
```

**Step 2: Update Attempt struct**

Add to `Attempt` struct around line 113:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Attempt {
    pub id: String,
    pub callsign: String,
    pub test_speed: i32,
    pub questions_correct: i32,
    pub copy_chars: i32,
    pub passed: bool,
    pub created_at: DateTime<Utc>,
    pub validation_status: Option<String>,
    pub certificate_number: Option<i32>,
    pub validated_at: Option<DateTime<Utc>>,
    pub admin_note: Option<String>,
}
```

**Step 3: Run to verify compiles**

Run: `cargo check`
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: add validation columns to attempts table"
```

---

## Task 2: Add Config for Admin Credentials

**Files:**
- Modify: `src/main.rs:23-97` (Config struct)

**Step 1: Add admin fields to Config**

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    // ... existing fields ...

    #[serde(default = "Config::default_admin_username")]
    pub admin_username: String,

    #[serde(default = "Config::default_admin_password")]
    pub admin_password: String,
}

impl Config {
    // ... existing methods ...

    fn default_admin_username() -> String {
        "admin".to_string()
    }

    fn default_admin_password() -> String {
        "changeme".to_string()
    }
}
```

**Step 2: Add defaults in Config::load()**

```rust
.set_default("admin_username", Self::default_admin_username())?
.set_default("admin_password", Self::default_admin_password())?
```

**Step 3: Add config to AppState**

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub admin_username: String,
    pub admin_password: String,
}
```

Update state creation in main():

```rust
let state = Arc::new(AppState {
    db: pool,
    admin_username: config.admin_username.clone(),
    admin_password: config.admin_password.clone(),
});
```

**Step 4: Run to verify compiles**

Run: `cargo check`
Expected: Compiles successfully

**Step 5: Commit**

```bash
git add src/main.rs
git commit -m "feat: add admin credentials to config"
```

---

## Task 3: Block Duplicate Passed Attempts

**Files:**
- Modify: `src/main.rs:227-287` (create_attempt handler)

**Step 1: Add check for existing pending/approved attempt**

At the start of `create_attempt`, after callsign validation:

```rust
// Check if callsign already has a pending or approved attempt
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
        "You already have a passed attempt awaiting validation. Practice more at morsestorytime.com and keyersjourney.com".to_string(),
    ));
}
```

**Step 2: Set validation_status when passed**

Update the INSERT query to include validation_status:

```rust
sqlx::query(
    r#"
    INSERT INTO attempts (id, callsign, test_speed, questions_correct, copy_chars, passed, created_at, validation_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    "#,
)
.bind(&id)
.bind(&callsign)
.bind(req.test_speed)
.bind(req.questions_correct)
.bind(req.copy_chars)
.bind(req.passed)
.bind(now.to_rfc3339())
.bind(if req.passed { Some("pending") } else { None::<&str> })
.execute(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

**Step 3: Remove certificate_number from response (now assigned on approval)**

Update the response to not include certificate_number for pending attempts:

```rust
let response = AttemptResponse {
    id,
    callsign,
    test_speed: req.test_speed,
    questions_correct: req.questions_correct,
    copy_chars: req.copy_chars,
    passed: req.passed,
    created_at: now,
    certificate_number: None, // Only assigned on admin approval
};
```

**Step 4: Run to verify compiles**

Run: `cargo check`
Expected: Compiles successfully

**Step 5: Commit**

```bash
git add src/main.rs
git commit -m "feat: block duplicate passed attempts, set pending status"
```

---

## Task 4: Update Leaderboard to Show Only Approved

**Files:**
- Modify: `src/main.rs:408-435` (get_leaderboard handler)

**Step 1: Update leaderboard query**

Change the WHERE clause to only include approved attempts:

```rust
let entries: Vec<LeaderboardEntry> = sqlx::query_as(
    r#"
    SELECT
        callsign,
        MAX(CASE WHEN passed = true AND validation_status = 'approved' THEN test_speed ELSE 0 END) as highest_speed_passed,
        COUNT(*) as total_attempts,
        SUM(CASE WHEN passed = true AND validation_status = 'approved' THEN 1 ELSE 0 END) as total_passes,
        MIN(CASE WHEN passed = true AND validation_status = 'approved' THEN created_at ELSE NULL END) as first_passed_at
    FROM attempts
    GROUP BY callsign
    HAVING highest_speed_passed > 0
    ORDER BY highest_speed_passed DESC, first_passed_at ASC
    LIMIT ?
    "#,
)
.bind(limit)
.fetch_all(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

**Step 2: Run to verify compiles**

Run: `cargo check`
Expected: Compiles successfully

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: filter leaderboard to approved attempts only"
```

---

## Task 5: Update Stats to Show Only Approved Passes

**Files:**
- Modify: `src/main.rs:438-480` (get_stats handler)

**Step 1: Update total_passes query**

```rust
let total_passes: (i64,) = sqlx::query_as(
    "SELECT COUNT(*) FROM attempts WHERE passed = true AND validation_status = 'approved'"
)
.fetch_one(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

**Step 2: Update attempts_by_speed query**

```rust
let attempts_by_speed: Vec<SpeedStats> = sqlx::query_as(
    r#"
    SELECT
        test_speed,
        COUNT(*) as attempts,
        SUM(CASE WHEN passed = true AND validation_status = 'approved' THEN 1 ELSE 0 END) as passes
    FROM attempts
    GROUP BY test_speed
    ORDER BY test_speed
    "#,
)
.fetch_all(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

**Step 3: Run to verify compiles**

Run: `cargo check`
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: filter stats to approved passes only"
```

---

## Task 6: Update Certificate Endpoint to Require Approval

**Files:**
- Modify: `src/certificate.rs:169-207` (get_certificate_svg handler)

**Step 1: Update query to require approved status**

```rust
let attempt: Option<crate::Attempt> = sqlx::query_as(
    "SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at,
            validation_status, certificate_number, validated_at, admin_note
     FROM attempts WHERE id = ? AND passed = true AND validation_status = 'approved'"
)
.bind(&attempt_id)
.fetch_optional(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

let attempt = attempt.ok_or((
    StatusCode::NOT_FOUND,
    "Certificate not available. Attempt may be pending approval or not passed.".to_string()
))?;
```

**Step 2: Use actual certificate_number from database**

```rust
let cert_no = match attempt.certificate_number {
    Some(num) => format!("#{}", num),
    None => return Err((
        StatusCode::NOT_FOUND,
        "Certificate number not yet assigned".to_string()
    )),
};
```

**Step 3: Run to verify compiles**

Run: `cargo check`
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add src/certificate.rs
git commit -m "feat: require approval for certificate access"
```

---

## Task 7: Create Admin Module with Basic Auth

**Files:**
- Create: `src/admin.rs`

**Step 1: Create admin module**

```rust
// src/admin.rs
use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Redirect},
    Form,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::FromRow;
use std::sync::Arc;

/// Check Basic Auth header
fn check_auth(auth_header: Option<&str>, username: &str, password: &str) -> bool {
    let Some(auth) = auth_header else {
        return false;
    };

    if !auth.starts_with("Basic ") {
        return false;
    }

    let encoded = &auth[6..];
    let Ok(decoded) = STANDARD.decode(encoded) else {
        return false;
    };

    let Ok(credentials) = String::from_utf8(decoded) else {
        return false;
    };

    let Some((user, pass)) = credentials.split_once(':') else {
        return false;
    };

    user == username && pass == password
}

/// Pending attempt for queue display
#[derive(Debug, FromRow)]
struct PendingAttempt {
    id: String,
    callsign: String,
    questions_correct: i32,
    copy_chars: i32,
    created_at: DateTime<Utc>,
}

/// History attempt for callsign display
#[derive(Debug, FromRow)]
struct HistoryAttempt {
    id: String,
    questions_correct: i32,
    copy_chars: i32,
    passed: bool,
    validation_status: Option<String>,
    created_at: DateTime<Utc>,
}

/// Form data for rejection
#[derive(Deserialize)]
pub struct RejectForm {
    note: Option<String>,
}

/// Admin queue page
pub async fn admin_queue(
    State(state): State<Arc<crate::AppState>>,
    headers: axum::http::HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    let auth = headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok());

    if !check_auth(auth, &state.admin_username, &state.admin_password) {
        return Err((
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, "Basic realm=\"Admin\"")],
            "Unauthorized",
        ));
    }

    // Get pending attempts
    let pending: Vec<PendingAttempt> = sqlx::query_as(
        "SELECT id, callsign, questions_correct, copy_chars, created_at
         FROM attempts
         WHERE validation_status = 'pending'
         ORDER BY created_at ASC"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Check if we should expand history for a callsign
    let expand_callsign = params.get("expand");

    let history_html = if let Some(callsign) = expand_callsign {
        let history: Vec<HistoryAttempt> = sqlx::query_as(
            "SELECT id, questions_correct, copy_chars, passed, validation_status, created_at
             FROM attempts
             WHERE callsign = ?
             ORDER BY created_at DESC"
        )
        .bind(callsign)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let rows: String = history.iter().map(|h| {
            let status = match (h.passed, h.validation_status.as_deref()) {
                (false, _) => "Failed",
                (true, Some("approved")) => "Approved",
                (true, Some("rejected")) => "Rejected",
                (true, Some("pending")) => "Pending",
                (true, _) => "Unknown",
            };
            format!(
                "<tr><td>{}</td><td>{}/10</td><td>{} chars</td><td>{}</td><td>{}</td></tr>",
                h.created_at.format("%Y-%m-%d %H:%M"),
                h.questions_correct,
                h.copy_chars,
                if h.passed { "Yes" } else { "No" },
                status
            )
        }).collect();

        format!(r#"
            <div style="background:#fff3cd;padding:1rem;margin-bottom:1rem;border:1px solid #ffc107;">
                <h3>History for {}</h3>
                <table style="width:100%;border-collapse:collapse;">
                    <tr style="background:#ffc107;"><th>Date</th><th>Score</th><th>Copy</th><th>Passed</th><th>Status</th></tr>
                    {}
                </table>
                <a href="/admin/queue">Close history</a>
            </div>
        "#, callsign, rows)
    } else {
        String::new()
    };

    let rows: String = if pending.is_empty() {
        "<tr><td colspan=\"5\" style=\"text-align:center;padding:2rem;\">No pending attempts to review</td></tr>".to_string()
    } else {
        pending.iter().map(|p| {
            format!(r#"
                <tr>
                    <td><a href="/admin/queue?expand={}">{}</a></td>
                    <td>{}/10</td>
                    <td>{} chars</td>
                    <td>{}</td>
                    <td>
                        <form method="POST" action="/admin/queue/{}/approve" style="display:inline;">
                            <button type="submit" style="background:#28a745;color:white;border:none;padding:0.5rem 1rem;cursor:pointer;">Approve</button>
                        </form>
                        <button onclick="showReject('{}')" style="background:#dc3545;color:white;border:none;padding:0.5rem 1rem;cursor:pointer;margin-left:0.5rem;">Reject</button>
                    </td>
                </tr>
            "#,
                p.callsign, p.callsign,
                p.questions_correct,
                p.copy_chars,
                p.created_at.format("%Y-%m-%d %H:%M"),
                p.id,
                p.id
            )
        }).collect()
    };

    let html = format!(r#"<!DOCTYPE html>
<html>
<head>
    <title>Admin Queue - Know Code Extra</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{ font-family: monospace; max-width: 900px; margin: 0 auto; padding: 1rem; background: #fffbeb; }}
        h1 {{ color: #78350f; }}
        table {{ width: 100%; border-collapse: collapse; background: white; }}
        th, td {{ border: 1px solid #d97706; padding: 0.75rem; text-align: left; }}
        th {{ background: #78350f; color: white; }}
        tr:nth-child(even) {{ background: #fef3c7; }}
        .modal {{ display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); }}
        .modal-content {{ background: white; margin: 10% auto; padding: 2rem; max-width: 400px; border: 2px solid #78350f; }}
        textarea {{ width: 100%; height: 100px; margin: 1rem 0; }}
    </style>
</head>
<body>
    <h1>Validation Queue</h1>
    {}
    <table>
        <tr><th>Callsign</th><th>Score</th><th>Copy</th><th>Submitted</th><th>Actions</th></tr>
        {}
    </table>

    <div id="rejectModal" class="modal">
        <div class="modal-content">
            <h3>Reject Attempt</h3>
            <form id="rejectForm" method="POST">
                <label>Note (optional):</label>
                <textarea name="note" placeholder="Reason for rejection..."></textarea>
                <button type="submit" style="background:#dc3545;color:white;border:none;padding:0.5rem 1rem;cursor:pointer;">Confirm Reject</button>
                <button type="button" onclick="hideReject()" style="margin-left:0.5rem;">Cancel</button>
            </form>
        </div>
    </div>

    <script>
        function showReject(id) {{
            document.getElementById('rejectForm').action = '/admin/queue/' + id + '/reject';
            document.getElementById('rejectModal').style.display = 'block';
        }}
        function hideReject() {{
            document.getElementById('rejectModal').style.display = 'none';
        }}
    </script>
</body>
</html>"#, history_html, rows);

    Ok(Html(html))
}

/// Approve an attempt
pub async fn approve_attempt(
    State(state): State<Arc<crate::AppState>>,
    headers: axum::http::HeaderMap,
    Path(attempt_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let auth = headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok());

    if !check_auth(auth, &state.admin_username, &state.admin_password) {
        return Err((StatusCode::UNAUTHORIZED, "Unauthorized".to_string()));
    }

    // Get next certificate number in a transaction
    let mut tx = state.db.begin().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let max_cert: (Option<i32>,) = sqlx::query_as(
        "SELECT MAX(certificate_number) FROM attempts"
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let next_cert = max_cert.0.unwrap_or(0) + 1;
    let now = chrono::Utc::now();

    let result = sqlx::query(
        "UPDATE attempts SET validation_status = 'approved', certificate_number = ?, validated_at = ?
         WHERE id = ? AND validation_status = 'pending'"
    )
    .bind(next_cert)
    .bind(now.to_rfc3339())
    .bind(&attempt_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Attempt not found or not pending".to_string()));
    }

    tx.commit().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Redirect::to("/admin/queue"))
}

/// Reject an attempt
pub async fn reject_attempt(
    State(state): State<Arc<crate::AppState>>,
    headers: axum::http::HeaderMap,
    Path(attempt_id): Path<String>,
    Form(form): Form<RejectForm>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let auth = headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok());

    if !check_auth(auth, &state.admin_username, &state.admin_password) {
        return Err((StatusCode::UNAUTHORIZED, "Unauthorized".to_string()));
    }

    let now = chrono::Utc::now();

    let result = sqlx::query(
        "UPDATE attempts SET validation_status = 'rejected', validated_at = ?, admin_note = ?
         WHERE id = ? AND validation_status = 'pending'"
    )
    .bind(now.to_rfc3339())
    .bind(form.note)
    .bind(&attempt_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Attempt not found or not pending".to_string()));
    }

    Ok(Redirect::to("/admin/queue"))
}
```

**Step 2: Add base64 dependency**

Run: `cargo add base64`

**Step 3: Add module to main.rs**

At the top of main.rs after `mod certificate;`:

```rust
mod admin;
```

**Step 4: Add admin routes in main.rs**

In the router builder, add before `.fallback_service`:

```rust
.route("/admin/queue", get(admin::admin_queue))
.route("/admin/queue/:id/approve", post(admin::approve_attempt))
.route("/admin/queue/:id/reject", post(admin::reject_attempt))
```

**Step 5: Run to verify compiles**

Run: `cargo check`
Expected: Compiles successfully

**Step 6: Commit**

```bash
git add src/admin.rs src/main.rs Cargo.toml Cargo.lock
git commit -m "feat: add admin queue with Basic auth"
```

---

## Task 8: Update Frontend Results Page

**Files:**
- Modify: `frontend/knowcodeextra.jsx:773-861` (Results view)

**Step 1: Update results page for pending state**

Replace the passed section in the results view:

```jsx
{passed && (
  <div className="bg-amber-100 border-2 border-amber-400 p-6 mb-6">
    <h3 className="font-mono text-sm text-amber-800 mb-2 font-bold">
      VERIFICATION PENDING
    </h3>
    <p className="font-serif text-amber-800">
      Congratulations! Your result has been submitted for verification.
      Once approved, you'll be able to view and download your official certificate.
    </p>
  </div>
)}
```

Remove the "VIEW CERTIFICATE" button since certificates are only available after approval.

**Step 2: Update submitAttempt to handle blocked attempts**

```jsx
const submitAttempt = async (attemptData) => {
  try {
    const response = await fetch(`${API_BASE}/api/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attemptData),
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    } else if (response.status === 400) {
      const text = await response.text();
      return { success: false, blocked: true, message: text };
    }
  } catch (error) {
    console.error("Failed to submit attempt:", error);
  }
  return { success: false };
};
```

**Step 3: Handle blocked response in calculateResults**

```jsx
const result = await submitAttempt({
  callsign: userCall,
  test_speed: test.speed,
  questions_correct: correct,
  copy_chars: copyChars,
  passed: didPass,
});

if (result?.blocked) {
  // Show blocked message with practice links
  setBlockedMessage(result.message);
  setView("blocked");
  setIsSubmitting(false);
  return;
}
```

**Step 4: Add blocked view**

```jsx
// Blocked Page (already has a pending/approved attempt)
if (view === "blocked") {
  return (
    <div className="min-h-screen bg-amber-50 text-stone-800 relative">
      <VintagePattern />
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
        <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 p-8">
          <div className="text-center">
            <h1 className="font-serif text-3xl font-bold text-amber-900 mb-4">
              Already Submitted
            </h1>
            <p className="font-serif text-amber-800 mb-6">
              You already have a passed attempt awaiting verification.
            </p>
            <p className="font-serif text-amber-700 mb-8">
              While you wait, practice more at:
            </p>
            <div className="space-y-4">
              <a
                href="https://morsestorytime.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-amber-900 text-amber-50 px-8 py-4 font-mono tracking-widest hover:bg-amber-800 transition-all"
              >
                MORSE STORY TIME
              </a>
              <a
                href="https://keyersjourney.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white text-amber-900 px-8 py-4 font-mono tracking-widest border-2 border-amber-300 hover:border-amber-500 transition-all"
              >
                KEYER'S JOURNEY
              </a>
            </div>
            <button
              onClick={() => setView("home")}
              className="mt-8 font-mono text-sm text-amber-700 hover:text-amber-900 underline"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Add blockedMessage state**

```jsx
const [blockedMessage, setBlockedMessage] = useState(null);
```

**Step 6: Build frontend**

Run: `cd frontend && ./build.sh`
Expected: Builds successfully

**Step 7: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: update frontend for pending verification flow"
```

---

## Task 9: Test Full Flow

**Step 1: Start server**

Run: `cargo run`

**Step 2: Test submission flow**

1. Visit http://localhost:3000
2. Take test, pass it
3. Verify you see "Verification pending" message
4. Try to take test again with same callsign
5. Verify you get blocked with practice site links

**Step 3: Test admin flow**

1. Visit http://localhost:3000/admin/queue
2. Login with admin/changeme
3. Verify pending attempt appears
4. Click callsign to view history
5. Approve the attempt
6. Verify it disappears from queue

**Step 4: Test certificate**

1. Visit http://localhost:3000/api/certificate/{attempt_id}
2. Verify certificate shows with #1 number

**Step 5: Test leaderboard**

1. Visit leaderboard
2. Verify approved callsign appears

**Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: complete validation queue implementation"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add database columns for validation |
| 2 | Add admin credentials to config |
| 3 | Block duplicate passed attempts |
| 4 | Filter leaderboard to approved only |
| 5 | Filter stats to approved passes only |
| 6 | Require approval for certificate access |
| 7 | Create admin module with Basic auth |
| 8 | Update frontend for pending state |
| 9 | Test full flow |
