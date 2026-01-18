# Outreach Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add outreach tracking for approved attempts with automatic QRZ email lookup on approval.

**Architecture:** Add database columns for email and reached_out status, create QRZ API client module, modify approval flow to fetch email, add new admin page for viewing/managing approved attempts with bulk actions.

**Tech Stack:** Rust/Axum, SQLite, reqwest for HTTP, quick-xml for XML parsing

---

## Task 1: Add Database Columns

**Files:**
- Modify: `src/main.rs` (setup_database function, Attempt struct)

**Step 1: Add migration for new columns**

In `setup_database()`, add after existing ALTER TABLE statements:

```rust
sqlx::query("ALTER TABLE attempts ADD COLUMN email TEXT")
    .execute(pool)
    .await
    .ok();

sqlx::query("ALTER TABLE attempts ADD COLUMN reached_out INTEGER DEFAULT 0")
    .execute(pool)
    .await
    .ok();
```

**Step 2: Update Attempt struct**

Add to the Attempt struct after existing fields:

```rust
#[sqlx(default)]
pub email: Option<String>,
#[sqlx(default)]
pub reached_out: bool,
```

**Step 3: Run to verify compiles**

Run: `cargo check`

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: add email and reached_out columns to attempts"
```

---

## Task 2: Add QRZ Client Module

**Files:**
- Create: `src/qrz.rs`
- Modify: `src/main.rs` (add mod declaration)

**Step 1: Add dependencies**

Run: `cargo add reqwest --features rustls-tls` and `cargo add quick-xml`

**Step 2: Create QRZ client module**

Create `src/qrz.rs`:

```rust
use std::sync::Arc;
use tokio::sync::RwLock;

/// QRZ API client with session caching
pub struct QrzClient {
    username: String,
    password: String,
    http: reqwest::Client,
    session_key: Arc<RwLock<Option<String>>>,
}

impl QrzClient {
    pub fn new(username: String, password: String) -> Self {
        Self {
            username,
            password,
            http: reqwest::Client::new(),
            session_key: Arc::new(RwLock::new(None)),
        }
    }

    /// Login to QRZ and get session key
    async fn login(&self) -> Result<String, String> {
        let url = format!(
            "https://xmldata.qrz.com/xml/current/?username={}&password={}",
            self.username, self.password
        );

        let response = self.http.get(&url).send().await
            .map_err(|e| format!("QRZ login request failed: {}", e))?;

        let text = response.text().await
            .map_err(|e| format!("QRZ login response read failed: {}", e))?;

        // Parse XML to extract session key
        Self::extract_session_key(&text)
    }

    fn extract_session_key(xml: &str) -> Result<String, String> {
        // Look for <Key>...</Key> in response
        if let Some(start) = xml.find("<Key>") {
            if let Some(end) = xml.find("</Key>") {
                let key = &xml[start + 5..end];
                return Ok(key.to_string());
            }
        }

        // Check for error
        if xml.contains("<Error>") {
            if let Some(start) = xml.find("<Error>") {
                if let Some(end) = xml.find("</Error>") {
                    let error = &xml[start + 7..end];
                    return Err(format!("QRZ error: {}", error));
                }
            }
        }

        Err("Could not parse QRZ session key".to_string())
    }

    /// Get or refresh session key
    async fn get_session_key(&self) -> Result<String, String> {
        // Check if we have a cached key
        {
            let cached = self.session_key.read().await;
            if let Some(ref key) = *cached {
                return Ok(key.clone());
            }
        }

        // Need to login
        let key = self.login().await?;

        // Cache the key
        {
            let mut cached = self.session_key.write().await;
            *cached = Some(key.clone());
        }

        Ok(key)
    }

    /// Clear cached session (call on session expired error)
    async fn clear_session(&self) {
        let mut cached = self.session_key.write().await;
        *cached = None;
    }

    /// Lookup callsign and return email if found
    pub async fn lookup_email(&self, callsign: &str) -> Result<Option<String>, String> {
        let session_key = self.get_session_key().await?;

        let url = format!(
            "https://xmldata.qrz.com/xml/current/?s={}&callsign={}",
            session_key, callsign
        );

        let response = self.http.get(&url).send().await
            .map_err(|e| format!("QRZ lookup request failed: {}", e))?;

        let text = response.text().await
            .map_err(|e| format!("QRZ lookup response read failed: {}", e))?;

        // Check for session expired
        if text.contains("Session Timeout") || text.contains("Invalid session key") {
            self.clear_session().await;
            // Retry once with fresh session
            return Box::pin(self.lookup_email(callsign)).await;
        }

        // Extract email from response
        Ok(Self::extract_email(&text))
    }

    fn extract_email(xml: &str) -> Option<String> {
        // Look for <email>...</email> in response
        if let Some(start) = xml.find("<email>") {
            if let Some(end) = xml.find("</email>") {
                let email = &xml[start + 7..end];
                if !email.is_empty() {
                    return Some(email.to_string());
                }
            }
        }
        None
    }
}

/// Create QRZ client from environment variables, returns None if not configured
pub fn create_client_from_env() -> Option<QrzClient> {
    let username = std::env::var("QRZ_USERNAME").ok()?;
    let password = std::env::var("QRZ_PASSWORD").ok()?;

    if username.is_empty() || password.is_empty() {
        return None;
    }

    Some(QrzClient::new(username, password))
}
```

**Step 3: Add module to main.rs**

After `mod admin;`:

```rust
mod qrz;
```

**Step 4: Run to verify compiles**

Run: `cargo check`

**Step 5: Commit**

```bash
git add src/qrz.rs src/main.rs Cargo.toml Cargo.lock
git commit -m "feat: add QRZ API client module"
```

---

## Task 3: Add QRZ Client to AppState

**Files:**
- Modify: `src/main.rs` (AppState, main function)

**Step 1: Update AppState**

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub admin_username: String,
    pub admin_password: String,
    pub qrz_client: Option<qrz::QrzClient>,
}
```

Note: QrzClient needs to be Clone. Update qrz.rs to derive Clone:

```rust
#[derive(Clone)]
pub struct QrzClient {
    // ... fields stay the same
}
```

**Step 2: Update state creation in main()**

```rust
let qrz_client = qrz::create_client_from_env();
if qrz_client.is_some() {
    tracing::info!("QRZ API client configured");
} else {
    tracing::warn!("QRZ credentials not set, email lookup disabled");
}

let state = Arc::new(AppState {
    db: pool,
    admin_username: config.admin_username.clone(),
    admin_password: config.admin_password.clone(),
    qrz_client,
});
```

**Step 3: Run to verify compiles**

Run: `cargo check`

**Step 4: Commit**

```bash
git add src/main.rs src/qrz.rs
git commit -m "feat: add QRZ client to AppState"
```

---

## Task 4: Fetch Email on Approval

**Files:**
- Modify: `src/admin.rs` (approve_attempt function)

**Step 1: Update approve_attempt to fetch email**

After getting the next certificate number, before the UPDATE query:

```rust
// Fetch email from QRZ if configured
let email: Option<String> = if let Some(ref qrz) = state.qrz_client {
    // Get callsign for this attempt
    let callsign: (String,) = sqlx::query_as(
        "SELECT callsign FROM attempts WHERE id = ?"
    )
    .bind(&attempt_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match qrz.lookup_email(&callsign.0).await {
        Ok(email) => {
            if email.is_some() {
                tracing::info!("Found email for {}", callsign.0);
            } else {
                tracing::warn!("No email found for {}", callsign.0);
            }
            email
        }
        Err(e) => {
            tracing::error!("QRZ lookup failed for {}: {}", callsign.0, e);
            None
        }
    }
} else {
    None
};
```

**Step 2: Update the UPDATE query to include email**

```rust
let result = sqlx::query(
    "UPDATE attempts SET validation_status = 'approved', certificate_number = ?, validated_at = ?, email = ?
     WHERE id = ? AND validation_status = 'pending'"
)
.bind(next_cert)
.bind(now.to_rfc3339())
.bind(&email)
.bind(&attempt_id)
.execute(&mut *tx)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

**Step 3: Run to verify compiles**

Run: `cargo check`

**Step 4: Commit**

```bash
git add src/admin.rs
git commit -m "feat: fetch email from QRZ on approval"
```

---

## Task 5: Create Approved Page

**Files:**
- Modify: `src/admin.rs` (add approved_list handler)
- Modify: `src/main.rs` (add route)

**Step 1: Add ApprovedAttempt struct**

In `src/admin.rs`:

```rust
#[derive(Debug, FromRow)]
struct ApprovedAttempt {
    id: String,
    callsign: String,
    certificate_number: Option<i32>,
    validated_at: Option<DateTime<Utc>>,
    email: Option<String>,
    reached_out: bool,
}
```

**Step 2: Add approved_list handler**

```rust
/// Approved attempts page with outreach tracking
pub async fn approved_list(
    State(state): State<Arc<crate::AppState>>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, impl IntoResponse> {
    let auth = headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok());

    if !check_auth(auth, &state.admin_username, &state.admin_password) {
        return Err((
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, "Basic realm=\"Admin\"")],
            "Unauthorized",
        ));
    }

    let approved: Vec<ApprovedAttempt> = sqlx::query_as(
        "SELECT id, callsign, certificate_number, validated_at, email, reached_out
         FROM attempts
         WHERE validation_status = 'approved'
         ORDER BY certificate_number DESC"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let rows: String = if approved.is_empty() {
        "<tr><td colspan=\"6\" style=\"text-align:center;padding:2rem;\">No approved attempts yet</td></tr>".to_string()
    } else {
        approved.iter().map(|a| {
            let email_display = a.email.as_deref().unwrap_or("Not found");
            let reached_out_display = if a.reached_out { "Yes" } else { "No" };
            let row_style = if a.reached_out { "opacity: 0.5;" } else { "" };
            let validated = a.validated_at
                .map(|d| d.format("%Y-%m-%d").to_string())
                .unwrap_or_default();

            format!(r#"
                <tr style="{}">
                    <td><input type="checkbox" name="ids" value="{}" class="attempt-checkbox" /></td>
                    <td>{}</td>
                    <td>{}</td>
                    <td>#{}</td>
                    <td>{}</td>
                    <td>{}</td>
                </tr>
            "#,
                row_style,
                a.id,
                a.callsign,
                email_display,
                a.certificate_number.unwrap_or(0),
                validated,
                reached_out_display
            )
        }).collect()
    };

    let html = format!(r#"<!DOCTYPE html>
<html>
<head>
    <title>Approved Attempts - Know Code Extra</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{ font-family: monospace; max-width: 1000px; margin: 0 auto; padding: 1rem; background: #fffbeb; }}
        h1 {{ color: #78350f; }}
        table {{ width: 100%; border-collapse: collapse; background: white; }}
        th, td {{ border: 1px solid #d97706; padding: 0.75rem; text-align: left; }}
        th {{ background: #78350f; color: white; }}
        tr:nth-child(even) {{ background: #fef3c7; }}
        .actions {{ margin-bottom: 1rem; }}
        .btn {{ background: #78350f; color: white; border: none; padding: 0.5rem 1rem; cursor: pointer; }}
        .btn:hover {{ background: #92400e; }}
        nav {{ margin-bottom: 1rem; }}
        nav a {{ margin-right: 1rem; color: #78350f; }}
    </style>
</head>
<body>
    <nav>
        <a href="/admin/queue">← Pending Queue</a>
    </nav>
    <h1>Approved Attempts</h1>
    <form method="POST" action="/admin/approved/mark-reached-out" class="actions">
        <button type="submit" class="btn">Mark Selected as Reached Out</button>
        <label style="margin-left:1rem;">
            <input type="checkbox" id="selectAll" onclick="toggleAll()" /> Select All
        </label>
    </form>
    <form id="mainForm" method="POST" action="/admin/approved/mark-reached-out">
        <table>
            <tr>
                <th style="width:30px;"></th>
                <th>Callsign</th>
                <th>Email</th>
                <th>Cert #</th>
                <th>Approved</th>
                <th>Reached Out</th>
            </tr>
            {}
        </table>
    </form>

    <script>
        function toggleAll() {{
            var checkboxes = document.querySelectorAll('.attempt-checkbox');
            var selectAll = document.getElementById('selectAll');
            checkboxes.forEach(function(cb) {{
                cb.checked = selectAll.checked;
            }});
        }}

        // Move checked items to form before submit
        document.querySelector('.actions form').onsubmit = function(e) {{
            e.preventDefault();
            var mainForm = document.getElementById('mainForm');
            mainForm.submit();
        }};
    </script>
</body>
</html>"#, rows);

    Ok(Html(html))
}
```

**Step 3: Add route in main.rs**

After the other admin routes:

```rust
.route("/admin/approved", get(admin::approved_list))
```

**Step 4: Run to verify compiles**

Run: `cargo check`

**Step 5: Commit**

```bash
git add src/admin.rs src/main.rs
git commit -m "feat: add approved attempts page"
```

---

## Task 6: Add Bulk Mark Reached Out Endpoint

**Files:**
- Modify: `src/admin.rs` (add mark_reached_out handler)
- Modify: `src/main.rs` (add route)

**Step 1: Add form struct for bulk IDs**

```rust
#[derive(Deserialize)]
pub struct BulkIdsForm {
    #[serde(default)]
    ids: Vec<String>,
}
```

**Step 2: Add mark_reached_out handler**

```rust
/// Mark selected attempts as reached out
pub async fn mark_reached_out(
    State(state): State<Arc<crate::AppState>>,
    headers: axum::http::HeaderMap,
    Form(form): Form<BulkIdsForm>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let auth = headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok());

    if !check_auth(auth, &state.admin_username, &state.admin_password) {
        return Err((StatusCode::UNAUTHORIZED, "Unauthorized".to_string()));
    }

    if form.ids.is_empty() {
        return Ok(Redirect::to("/admin/approved"));
    }

    // Build query with placeholders for each ID
    let placeholders: Vec<&str> = form.ids.iter().map(|_| "?").collect();
    let query = format!(
        "UPDATE attempts SET reached_out = 1 WHERE id IN ({})",
        placeholders.join(", ")
    );

    let mut q = sqlx::query(&query);
    for id in &form.ids {
        q = q.bind(id);
    }

    q.execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Marked {} attempts as reached out", form.ids.len());

    Ok(Redirect::to("/admin/approved"))
}
```

**Step 3: Add route in main.rs**

```rust
.route("/admin/approved/mark-reached-out", post(admin::mark_reached_out))
```

**Step 4: Run to verify compiles**

Run: `cargo check`

**Step 5: Commit**

```bash
git add src/admin.rs src/main.rs
git commit -m "feat: add bulk mark reached out endpoint"
```

---

## Task 7: Add Navigation Link from Queue

**Files:**
- Modify: `src/admin.rs` (update admin_queue HTML)

**Step 1: Add nav link to approved page**

In the `admin_queue` HTML, add after `<h1>Validation Queue</h1>`:

```rust
    <nav>
        <a href="/admin/approved">View Approved →</a>
    </nav>
```

And add the nav style to the CSS:

```css
nav {{ margin-bottom: 1rem; }}
nav a {{ color: #78350f; }}
```

**Step 2: Run to verify compiles**

Run: `cargo check`

**Step 3: Commit**

```bash
git add src/admin.rs
git commit -m "feat: add navigation between admin pages"
```

---

## Task 8: Test Full Flow

**Step 1: Build and run**

Run: `cargo build && cargo run`

**Step 2: Test approval with QRZ**

Set environment variables and test:

```bash
export QRZ_USERNAME=your_username
export QRZ_PASSWORD=your_password
cargo run
```

1. Create a test attempt that passes
2. Go to /admin/queue, approve it
3. Check logs for QRZ lookup result
4. Go to /admin/approved, verify email appears

**Step 3: Test bulk mark**

1. Check some attempts on /admin/approved
2. Click "Mark Selected as Reached Out"
3. Verify rows become muted and show "Yes"

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "feat: complete outreach tracking implementation"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add email and reached_out columns |
| 2 | Create QRZ API client module |
| 3 | Add QRZ client to AppState |
| 4 | Fetch email on approval |
| 5 | Create approved attempts page |
| 6 | Add bulk mark reached out endpoint |
| 7 | Add navigation between admin pages |
| 8 | Test full flow |
