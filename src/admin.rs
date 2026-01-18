// src/admin.rs
use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Json, Redirect},
    Form,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
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

#[derive(Deserialize)]
pub struct BulkIdsForm {
    #[serde(default)]
    pub ids: Vec<String>,
}

/// Dashboard statistics response
#[derive(Debug, Serialize)]
pub struct AdminStatsResponse {
    pub pending_count: i64,
    pub approved_today: i64,
    pub total_certificates: i64,
    pub rejected_count: i64,
    pub recent_activity: Vec<RecentActivity>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct RecentActivity {
    pub id: String,
    pub callsign: String,
    pub action: String,
    pub created_at: DateTime<Utc>,
}

/// Paginated approved list response
#[derive(Debug, Serialize)]
pub struct ApprovedListResponse {
    pub items: Vec<ApprovedAttempt>,
    pub total: i64,
    pub page: i32,
    pub per_page: i32,
}

#[derive(Debug, Deserialize)]
pub struct ApprovedListQuery {
    #[serde(default = "default_page")]
    pub page: i32,
    #[serde(default = "default_per_page")]
    pub per_page: i32,
    pub reached_out: Option<bool>,
}

fn default_page() -> i32 { 1 }
fn default_per_page() -> i32 { 25 }

/// Search response
#[derive(Debug, Serialize, FromRow)]
pub struct SearchResult {
    pub id: String,
    pub callsign: String,
    pub questions_correct: i32,
    pub copy_chars: i32,
    pub passed: bool,
    pub validation_status: Option<String>,
    pub certificate_number: Option<i32>,
    pub admin_note: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

/// Settings response (safe values only)
#[derive(Debug, Serialize)]
pub struct SettingsResponse {
    pub database_url: String,
    pub listen_addr: String,
    pub static_dir: String,
    pub log_level: String,
    pub qrz_enabled: bool,
}

/// Queue item for JSON API
#[derive(Debug, Serialize, FromRow)]
pub struct QueueItem {
    pub id: String,
    pub callsign: String,
    pub questions_correct: i32,
    pub copy_chars: i32,
    pub created_at: DateTime<Utc>,
}

/// History for a callsign
#[derive(Debug, Serialize, FromRow)]
pub struct AttemptHistory {
    pub id: String,
    pub questions_correct: i32,
    pub copy_chars: i32,
    pub passed: bool,
    pub validation_status: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct ApprovedAttempt {
    id: String,
    callsign: String,
    certificate_number: Option<i32>,
    validated_at: Option<DateTime<Utc>>,
    email: Option<String>,
    reached_out: bool,
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
        nav {{ margin-bottom: 1rem; }}
        nav a {{ color: #78350f; }}
    </style>
</head>
<body>
    <nav>
        <a href="/admin/approved">View Approved &rarr;</a>
    </nav>
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
        nav a {{ color: #78350f; }}
    </style>
</head>
<body>
    <nav>
        <a href="/admin/queue">&larr; Pending Queue</a>
    </nav>
    <h1>Approved Attempts</h1>
    <form method="POST" action="/admin/approved/mark-reached-out">
        <div class="actions">
            <button type="submit" class="btn">Mark Selected as Reached Out</button>
            <label style="margin-left:1rem;">
                <input type="checkbox" id="selectAll" onclick="toggleAll()" /> Select All
            </label>
        </div>
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
    </script>
</body>
</html>"#, rows);

    Ok(Html(html))
}

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

// ============================================================================
// JSON API ENDPOINTS
// ============================================================================

/// GET /api/admin/stats - Dashboard statistics
pub async fn get_admin_stats(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let pending: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM attempts WHERE validation_status = 'pending'"
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let today = chrono::Utc::now().date_naive();
    let approved_today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM attempts WHERE validation_status = 'approved' AND date(validated_at) = ?"
    )
    .bind(today.to_string())
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total_certs: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM attempts WHERE validation_status = 'approved'"
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let rejected: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM attempts WHERE validation_status = 'rejected'"
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Recent activity (last 10 approvals/rejections)
    let recent: Vec<RecentActivity> = sqlx::query_as(
        r#"
        SELECT id, callsign, validation_status as action, validated_at as created_at
        FROM attempts
        WHERE validation_status IN ('approved', 'rejected')
        ORDER BY validated_at DESC
        LIMIT 10
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AdminStatsResponse {
        pending_count: pending.0,
        approved_today: approved_today.0,
        total_certificates: total_certs.0,
        rejected_count: rejected.0,
        recent_activity: recent,
    }))
}

/// GET /api/admin/queue - Get pending queue as JSON
pub async fn get_queue(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let pending: Vec<QueueItem> = sqlx::query_as(
        "SELECT id, callsign, questions_correct, copy_chars, created_at
         FROM attempts
         WHERE validation_status = 'pending'
         ORDER BY created_at ASC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(pending))
}

/// GET /api/admin/queue/:callsign/history - Get attempt history for callsign
pub async fn get_callsign_history(
    State(state): State<Arc<crate::AppState>>,
    Path(callsign): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let history: Vec<AttemptHistory> = sqlx::query_as(
        "SELECT id, questions_correct, copy_chars, passed, validation_status, created_at
         FROM attempts
         WHERE callsign = ?
         ORDER BY created_at DESC"
    )
    .bind(&callsign)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(history))
}

/// POST /api/admin/queue/:id/approve - Approve attempt (JSON response)
pub async fn approve_attempt_json(
    State(state): State<Arc<crate::AppState>>,
    Path(attempt_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
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

    // Fetch email from QRZ if configured
    let email: Option<String> = if let Some(ref qrz) = state.qrz_client {
        let callsign: (String,) = sqlx::query_as(
            "SELECT callsign FROM attempts WHERE id = ?"
        )
        .bind(&attempt_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        qrz.lookup_email(&callsign.0).await.ok().flatten()
    } else {
        None
    };

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

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Attempt not found or not pending".to_string()));
    }

    tx.commit().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "certificate_number": next_cert
    })))
}

/// POST /api/admin/queue/:id/reject - Reject attempt (JSON response)
pub async fn reject_attempt_json(
    State(state): State<Arc<crate::AppState>>,
    Path(attempt_id): Path<String>,
    Json(form): Json<RejectForm>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
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

    Ok(Json(serde_json::json!({ "success": true })))
}

/// GET /api/admin/approved - Paginated approved list
pub async fn get_approved_list(
    State(state): State<Arc<crate::AppState>>,
    Query(query): Query<ApprovedListQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let offset = (query.page - 1) * query.per_page;

    let (items, total): (Vec<ApprovedAttempt>, (i64,)) = match query.reached_out {
        Some(true) => {
            let items: Vec<ApprovedAttempt> = sqlx::query_as(
                "SELECT id, callsign, certificate_number, validated_at, email, reached_out
                 FROM attempts
                 WHERE validation_status = 'approved' AND reached_out = 1
                 ORDER BY certificate_number DESC
                 LIMIT ? OFFSET ?"
            )
            .bind(query.per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM attempts WHERE validation_status = 'approved' AND reached_out = 1"
            )
            .fetch_one(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            (items, total)
        }
        Some(false) => {
            let items: Vec<ApprovedAttempt> = sqlx::query_as(
                "SELECT id, callsign, certificate_number, validated_at, email, reached_out
                 FROM attempts
                 WHERE validation_status = 'approved' AND reached_out = 0
                 ORDER BY certificate_number DESC
                 LIMIT ? OFFSET ?"
            )
            .bind(query.per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM attempts WHERE validation_status = 'approved' AND reached_out = 0"
            )
            .fetch_one(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            (items, total)
        }
        None => {
            let items: Vec<ApprovedAttempt> = sqlx::query_as(
                "SELECT id, callsign, certificate_number, validated_at, email, reached_out
                 FROM attempts
                 WHERE validation_status = 'approved'
                 ORDER BY certificate_number DESC
                 LIMIT ? OFFSET ?"
            )
            .bind(query.per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM attempts WHERE validation_status = 'approved'"
            )
            .fetch_one(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            (items, total)
        }
    };

    Ok(Json(ApprovedListResponse {
        items,
        total: total.0,
        page: query.page,
        per_page: query.per_page,
    }))
}

/// POST /api/admin/approved/mark-reached-out - Mark as reached out (JSON)
pub async fn mark_reached_out_json(
    State(state): State<Arc<crate::AppState>>,
    Json(form): Json<BulkIdsForm>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if form.ids.is_empty() {
        return Ok(Json(serde_json::json!({ "success": true, "count": 0 })));
    }

    let placeholders: Vec<&str> = form.ids.iter().map(|_| "?").collect();
    let query = format!(
        "UPDATE attempts SET reached_out = 1 WHERE id IN ({})",
        placeholders.join(", ")
    );

    let mut q = sqlx::query(&query);
    for id in &form.ids {
        q = q.bind(id);
    }

    let result = q.execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "count": result.rows_affected()
    })))
}

/// GET /api/admin/search - Search attempts by callsign
pub async fn search_attempts(
    State(state): State<Arc<crate::AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let search_term = format!("%{}%", query.q.to_uppercase());

    let results: Vec<SearchResult> = sqlx::query_as(
        "SELECT id, callsign, questions_correct, copy_chars, passed, validation_status, certificate_number, admin_note, created_at
         FROM attempts
         WHERE callsign LIKE ?
         ORDER BY callsign, created_at DESC
         LIMIT 100"
    )
    .bind(&search_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(results))
}

/// GET /api/admin/settings - Get safe config values
pub async fn get_settings(
    State(state): State<Arc<crate::AppState>>,
) -> impl IntoResponse {
    // Note: We need to store config in AppState or pass it differently
    // For now, return what we can from AppState
    Json(SettingsResponse {
        database_url: "[configured]".to_string(),
        listen_addr: "[configured]".to_string(),
        static_dir: "[configured]".to_string(),
        log_level: "[configured]".to_string(),
        qrz_enabled: state.qrz_client.is_some(),
    })
}
