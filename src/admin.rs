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
use tokio::fs;

// ============================================================================
// ADMIN TEST MANAGEMENT TYPES
// ============================================================================

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

fn default_passing_score() -> i32 {
    7
}

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

fn default_page() -> i32 {
    1
}
fn default_per_page() -> i32 {
    25
}

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

#[derive(Debug, FromRow, Serialize)]
pub struct ApprovedAttempt {
    id: String,
    callsign: String,
    certificate_number: Option<i32>,
    validated_at: Option<DateTime<Utc>>,
    email: Option<String>,
    reached_out: bool,
}

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

// ============================================================================
// JSON API ENDPOINTS
// ============================================================================

/// GET /api/admin/stats - Dashboard statistics
pub async fn get_admin_stats(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let pending: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM attempts WHERE validation_status = 'pending'")
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

    let total_certs: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM attempts WHERE validation_status = 'approved'")
            .fetch_one(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let rejected: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM attempts WHERE validation_status = 'rejected'")
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
        "#,
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
         ORDER BY created_at ASC",
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
         ORDER BY created_at DESC",
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
    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let max_cert: (Option<i32>,) = sqlx::query_as("SELECT MAX(certificate_number) FROM attempts")
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let next_cert = max_cert.0.unwrap_or(0) + 1;
    let now = chrono::Utc::now();

    // Fetch email from QRZ if configured
    let email: Option<String> = if let Some(ref qrz) = state.qrz_client {
        let callsign: (String,) = sqlx::query_as("SELECT callsign FROM attempts WHERE id = ?")
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
        return Err((
            StatusCode::NOT_FOUND,
            "Attempt not found or not pending".to_string(),
        ));
    }

    tx.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Regenerate the Ham2K PoLo notes file
    if let Err(e) = regenerate_polo_notes(&state).await {
        tracing::error!("Failed to regenerate PoLo notes: {}", e);
        // Don't fail the approval, just log the error
    }

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
         WHERE id = ? AND validation_status = 'pending'",
    )
    .bind(now.to_rfc3339())
    .bind(form.note)
    .bind(&attempt_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            "Attempt not found or not pending".to_string(),
        ));
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
                 LIMIT ? OFFSET ?",
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
                 LIMIT ? OFFSET ?",
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
                 LIMIT ? OFFSET ?",
            )
            .bind(query.per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM attempts WHERE validation_status = 'approved'",
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

    let result = q
        .execute(&state.db)
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

/// GET /api/admin/attempts - List all attempts with filters
pub async fn list_all_attempts(
    State(state): State<Arc<crate::AppState>>,
    Query(query): Query<AllAttemptsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate pagination
    if query.page < 1 {
        return Err((StatusCode::BAD_REQUEST, "Page must be >= 1".to_string()));
    }
    if query.per_page < 1 || query.per_page > 100 {
        return Err((StatusCode::BAD_REQUEST, "per_page must be between 1 and 100".to_string()));
    }

    let offset = match (query.page - 1).checked_mul(query.per_page) {
        Some(o) => o,
        None => return Err((StatusCode::BAD_REQUEST, "Pagination overflow".to_string())),
    };

    // Validate date format (YYYY-MM-DD) using chrono parsing
    if let Some(ref date_from) = query.date_from {
        if chrono::NaiveDate::parse_from_str(date_from, "%Y-%m-%d").is_err() {
            return Err((StatusCode::BAD_REQUEST, "date_from must be YYYY-MM-DD format".to_string()));
        }
    }
    if let Some(ref date_to) = query.date_to {
        if chrono::NaiveDate::parse_from_str(date_to, "%Y-%m-%d").is_err() {
            return Err((StatusCode::BAD_REQUEST, "date_to must be YYYY-MM-DD format".to_string()));
        }
    }

    // Build query based on which filters are present
    // We use a match on the combination of filters to build type-safe queries
    let (total, items) = match (query.passed, &query.callsign, &query.date_from, &query.date_to) {
        // No filters
        (None, None, None, None) => {
            let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attempts")
                .fetch_one(&state.db)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let items: Vec<AttemptListItem> = sqlx::query_as(
                "SELECT id, callsign, test_speed, questions_correct, copy_chars, consecutive_correct, passed, validation_status, created_at, copy_text
                 FROM attempts ORDER BY created_at DESC LIMIT ? OFFSET ?"
            )
            .bind(query.per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            (total.0, items)
        }
        // Only passed filter
        (Some(passed), None, None, None) => {
            let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attempts WHERE passed = ?")
                .bind(passed)
                .fetch_one(&state.db)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let items: Vec<AttemptListItem> = sqlx::query_as(
                "SELECT id, callsign, test_speed, questions_correct, copy_chars, consecutive_correct, passed, validation_status, created_at, copy_text
                 FROM attempts WHERE passed = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            )
            .bind(passed)
            .bind(query.per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            (total.0, items)
        }
        // Only callsign filter
        (None, Some(callsign), None, None) => {
            let pattern = format!("%{}%", callsign.to_uppercase());
            let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attempts WHERE callsign LIKE ?")
                .bind(&pattern)
                .fetch_one(&state.db)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let items: Vec<AttemptListItem> = sqlx::query_as(
                "SELECT id, callsign, test_speed, questions_correct, copy_chars, consecutive_correct, passed, validation_status, created_at, copy_text
                 FROM attempts WHERE callsign LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            )
            .bind(&pattern)
            .bind(query.per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            (total.0, items)
        }
        // Default: use dynamic query building for complex filter combinations
        _ => {
            // Build conditions with placeholders
            let mut conditions = Vec::new();
            let mut bind_values: Vec<String> = Vec::new();

            if let Some(passed) = query.passed {
                conditions.push(format!("passed = {}", if passed { 1 } else { 0 }));
            }

            if let Some(ref callsign) = query.callsign {
                conditions.push("callsign LIKE ?".to_string());
                bind_values.push(format!("%{}%", callsign.to_uppercase()));
            }

            if let Some(ref date_from) = query.date_from {
                conditions.push("date(created_at) >= ?".to_string());
                bind_values.push(date_from.clone());
            }

            if let Some(ref date_to) = query.date_to {
                conditions.push("date(created_at) <= ?".to_string());
                bind_values.push(date_to.clone());
            }

            let where_clause = format!("WHERE {}", conditions.join(" AND "));

            // Count query
            let count_sql = format!("SELECT COUNT(*) FROM attempts {}", where_clause);
            let mut count_query = sqlx::query_as::<_, (i64,)>(&count_sql);
            for val in &bind_values {
                count_query = count_query.bind(val);
            }
            let total: (i64,) = count_query
                .fetch_one(&state.db)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            // Items query
            let items_sql = format!(
                "SELECT id, callsign, test_speed, questions_correct, copy_chars, consecutive_correct, passed, validation_status, created_at, copy_text
                 FROM attempts {} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                where_clause
            );
            let mut items_query = sqlx::query_as::<_, AttemptListItem>(&items_sql);
            for val in &bind_values {
                items_query = items_query.bind(val);
            }
            let items: Vec<AttemptListItem> = items_query
                .bind(query.per_page)
                .bind(offset)
                .fetch_all(&state.db)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            (total.0, items)
        }
    };

    Ok(Json(AllAttemptsResponse {
        items,
        total,
        page: query.page,
        per_page: query.per_page,
    }))
}

/// GET /api/admin/settings - Get safe config values
pub async fn get_settings(State(state): State<Arc<crate::AppState>>) -> impl IntoResponse {
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

// ============================================================================
// HAM2K POLO NOTES FILE GENERATION
// ============================================================================

/// Regenerate the Ham2K PoLo callsign notes file from approved members
/// File format: one callsign per line with notes
/// Example: W1ABC 🎉 Know Code Extra #1
pub async fn regenerate_polo_notes(state: &Arc<crate::AppState>) -> Result<(), String> {
    #[derive(FromRow)]
    struct ApprovedMember {
        callsign: String,
        certificate_number: Option<i32>,
    }

    let members: Vec<ApprovedMember> = sqlx::query_as(
        "SELECT callsign, certificate_number FROM attempts
         WHERE validation_status = 'approved'
         ORDER BY certificate_number ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let mut content = String::from("# Know Code Extra Club Members\n");
    content.push_str("# Ham2K PoLo Callsign Notes - https://knowcodeextra.com\n\n");

    for member in members {
        let cert_num = member.certificate_number.unwrap_or(0);
        content.push_str(&format!(
            "{} 🎉 Know Code Extra #{}\n",
            member.callsign, cert_num
        ));
    }

    let file_path = format!("{}/members.txt", state.static_dir);
    fs::write(&file_path, content)
        .await
        .map_err(|e| format!("Failed to write PoLo notes file: {}", e))?;

    tracing::info!("Regenerated PoLo notes file at {}", file_path);
    Ok(())
}

// ============================================================================
// ADMIN TEST CRUD ENDPOINTS
// ============================================================================

/// GET /api/admin/tests - List all tests (including inactive)
pub async fn list_tests_admin(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let rows: Vec<AdminTestRow> = sqlx::query_as(
        r#"
        SELECT t.id, t.title, t.speed_wpm, t.year, t.audio_url, t.passing_score, t.active, t.created_at, t.segments,
               (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
        FROM tests t
        ORDER BY t.speed_wpm, t.title
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let tests: Vec<AdminTest> = rows.into_iter().map(|row| {
        let test_id = row.id.clone();
        AdminTest {
            id: row.id,
            title: row.title,
            speed_wpm: row.speed_wpm,
            year: row.year,
            audio_url: row.audio_url,
            passing_score: row.passing_score,
            active: row.active,
            created_at: row.created_at,
            question_count: row.question_count,
            segments: row.segments.and_then(|s| {
                serde_json::from_str(&s).map_err(|e| {
                    tracing::warn!("Failed to parse segments JSON for test {}: {}", test_id, e);
                    e
                }).ok()
            }),
        }
    }).collect();

    Ok(Json(tests))
}

/// POST /api/admin/tests - Create new test
pub async fn create_test(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<CreateTestRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO tests (id, title, speed_wpm, year, audio_url, passing_score, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
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
        bindings.push(if active {
            "1".to_string()
        } else {
            "0".to_string()
        });
    }
    if let Some(ref segments) = req.segments {
        let segments_json = serde_json::to_string(segments)
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid segments: {}", e)))?;
        updates.push("segments = ?");
        bindings.push(segments_json);
    }

    if updates.is_empty() {
        return Ok(Json(
            serde_json::json!({ "success": true, "updated": false }),
        ));
    }

    let query = format!("UPDATE tests SET {} WHERE id = ?", updates.join(", "));
    let mut q = sqlx::query(&query);
    for b in &bindings {
        q = q.bind(b);
    }
    q = q.bind(&test_id);

    let result = q
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Test not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

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

// ============================================================================
// ADMIN QUESTION CRUD ENDPOINTS
// ============================================================================

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

    let id = uuid::Uuid::new_v4().to_string();
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
    // Validate input
    let prosign = req.prosign.trim().to_uppercase();
    let alternate = req.alternate.trim().to_uppercase();

    if prosign.is_empty() || alternate.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Prosign and alternate cannot be empty".to_string()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO prosign_mappings (id, prosign, alternate, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&prosign)
    .bind(&alternate)
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await
    .map_err(|e| {
        // Check for UNIQUE constraint violation (duplicate prosign)
        if e.to_string().contains("UNIQUE constraint failed") {
            (StatusCode::CONFLICT, format!("Prosign '{}' already exists", prosign))
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        }
    })?;

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
