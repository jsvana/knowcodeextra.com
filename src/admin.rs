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
