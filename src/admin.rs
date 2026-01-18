// src/admin.rs
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::sync::Arc;

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
