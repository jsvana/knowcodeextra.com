use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, SqlitePool,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

mod admin;
mod certificate;
mod jwt;
mod qrz;

// ============================================================================
// Configuration
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "Config::default_database_url")]
    pub database_url: String,

    #[serde(default = "Config::default_listen_addr")]
    pub listen_addr: String,

    #[serde(default = "Config::default_static_dir")]
    pub static_dir: String,

    #[serde(default = "Config::default_log_level")]
    pub log_level: String,

    #[serde(default = "Config::default_admin_username")]
    pub admin_username: String,

    #[serde(default = "Config::default_admin_password")]
    pub admin_password: String,

    #[serde(default = "Config::default_admin_jwt_secret")]
    pub admin_jwt_secret: String,
}

impl Config {
    fn default_database_url() -> String {
        "sqlite:knowcodeextra.db".to_string()
    }

    fn default_listen_addr() -> String {
        "0.0.0.0:3000".to_string()
    }

    fn default_static_dir() -> String {
        "./static".to_string()
    }

    fn default_log_level() -> String {
        "knowcodeextra=info,tower_http=info".to_string()
    }

    fn default_admin_username() -> String {
        "admin".to_string()
    }

    fn default_admin_password() -> String {
        "changeme".to_string()
    }

    fn default_admin_jwt_secret() -> String {
        "change-this-secret-in-production".to_string()
    }

    pub fn load() -> Result<Self, config::ConfigError> {
        let config_path =
            std::env::var("CONFIG_FILE").unwrap_or_else(|_| "config.toml".to_string());

        let mut config: Config = config::Config::builder()
            // Start with defaults
            .set_default("database_url", Self::default_database_url())?
            .set_default("listen_addr", Self::default_listen_addr())?
            .set_default("static_dir", Self::default_static_dir())?
            .set_default("log_level", Self::default_log_level())?
            .set_default("admin_username", Self::default_admin_username())?
            .set_default("admin_password", Self::default_admin_password())?
            .set_default("admin_jwt_secret", Self::default_admin_jwt_secret())?
            // Layer on config file (optional)
            .add_source(config::File::with_name(&config_path).required(false))
            .build()?
            .try_deserialize()?;

        // Override with environment variables (these take highest priority)
        if let Ok(v) = std::env::var("DATABASE_URL") {
            config.database_url = v;
        }
        if let Ok(v) = std::env::var("LISTEN_ADDR") {
            config.listen_addr = v;
        }
        if let Ok(v) = std::env::var("STATIC_DIR") {
            config.static_dir = v;
        }
        if let Ok(v) = std::env::var("RUST_LOG") {
            config.log_level = v;
        }
        if let Ok(v) = std::env::var("KNOWCODE_ADMIN_USERNAME") {
            config.admin_username = v;
        }
        if let Ok(v) = std::env::var("KNOWCODE_ADMIN_PASSWORD") {
            config.admin_password = v;
        }
        if let Ok(v) = std::env::var("KNOWCODE_ADMIN_JWT_SECRET") {
            config.admin_jwt_secret = v;
        }

        Ok(config)
    }
}

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptRequest {
    pub callsign: String,
    pub test_speed: i32,        // 20 WPM only
    pub questions_correct: i32, // 0-10
    pub copy_chars: i32,        // characters copied
    pub passed: bool,
    #[serde(default)]
    pub audio_progress: Option<f32>, // 0-100 percentage of audio played at submission
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Attempt {
    pub id: String,
    pub callsign: String,
    pub test_speed: i32,
    pub questions_correct: i32,
    pub copy_chars: i32,
    pub passed: bool,
    pub created_at: DateTime<Utc>,
    #[sqlx(default)]
    pub validation_status: Option<String>,
    #[sqlx(default)]
    pub certificate_number: Option<i32>,
    #[sqlx(default)]
    pub validated_at: Option<DateTime<Utc>>,
    #[sqlx(default)]
    pub admin_note: Option<String>,
    #[sqlx(default)]
    pub email: Option<String>,
    #[sqlx(default)]
    pub reached_out: bool,
    #[sqlx(default)]
    pub audio_progress: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptResponse {
    pub id: String,
    pub callsign: String,
    pub test_speed: i32,
    pub questions_correct: i32,
    pub copy_chars: i32,
    pub passed: bool,
    pub created_at: DateTime<Utc>,
    pub certificate_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct LeaderboardEntry {
    pub callsign: String,
    pub highest_speed_passed: i32,
    pub total_attempts: i32,
    pub total_passes: i32,
    pub first_passed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsResponse {
    pub total_attempts: i64,
    pub total_passes: i64,
    pub unique_callsigns: i64,
    pub attempts_by_speed: Vec<SpeedStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SpeedStats {
    pub test_speed: i32,
    pub attempts: i64,
    pub passes: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    pub speed: Option<i32>,
    pub passed_only: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CallsignQuery {
    pub speed: Option<i32>,
}

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

// ============================================================================
// Application State
// ============================================================================

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub admin_username: String,
    pub admin_password: String,
    pub admin_jwt_secret: String,
    pub qrz_client: Option<qrz::QrzClient>,
    pub static_dir: String,
}

// ============================================================================
// Database Setup
// ============================================================================

async fn setup_database(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS attempts (
            id TEXT PRIMARY KEY,
            callsign TEXT NOT NULL,
            test_speed INTEGER NOT NULL,
            questions_correct INTEGER NOT NULL,
            copy_chars INTEGER NOT NULL,
            passed BOOLEAN NOT NULL,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

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

    // Create indexes for common queries
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_callsign ON attempts(callsign)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_passed ON attempts(passed)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_test_speed ON attempts(test_speed)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_created_at ON attempts(created_at DESC)")
        .execute(pool)
        .await?;

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

    sqlx::query("ALTER TABLE attempts ADD COLUMN email TEXT")
        .execute(pool)
        .await
        .ok();

    sqlx::query("ALTER TABLE attempts ADD COLUMN reached_out INTEGER DEFAULT 0")
        .execute(pool)
        .await
        .ok();

    sqlx::query("ALTER TABLE attempts ADD COLUMN audio_progress REAL")
        .execute(pool)
        .await
        .ok();

    // Index for validation queue queries
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_validation_status ON attempts(validation_status)")
        .execute(pool)
        .await?;

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

    Ok(())
}

// ============================================================================
// Handlers
// ============================================================================

/// Record a new test attempt
async fn create_attempt(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AttemptRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate callsign
    let callsign = req.callsign.trim().to_uppercase();
    if callsign.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Callsign is required".to_string()));
    }

    // Check if callsign already has an attempt today (rate limit: once per day)
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
            "You can only attempt the test once per day. Practice more at morsestorytime.com and keyersjourney.com, and try again tomorrow!".to_string(),
        ));
    }

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

    // Validate test speed (only 20 WPM supported)
    if req.test_speed != 20 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid test speed. Must be 20".to_string(),
        ));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO attempts (id, callsign, test_speed, questions_correct, copy_chars, passed, created_at, validation_status, audio_progress)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    .bind(req.audio_progress)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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

    Ok((StatusCode::CREATED, Json(response)))
}

/// List all attempts with optional filtering
async fn list_attempts(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);

    let attempts: Vec<Attempt> = match (query.speed, query.passed_only) {
        (Some(speed), Some(true)) => {
            sqlx::query_as(
                r#"
                SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at
                FROM attempts
                WHERE test_speed = ? AND passed = true
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(speed)
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await
        }
        (Some(speed), _) => {
            sqlx::query_as(
                r#"
                SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at
                FROM attempts
                WHERE test_speed = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(speed)
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await
        }
        (None, Some(true)) => {
            sqlx::query_as(
                r#"
                SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at
                FROM attempts
                WHERE passed = true
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await
        }
        _ => {
            sqlx::query_as(
                r#"
                SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at
                FROM attempts
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db)
            .await
        }
    }
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(attempts))
}

/// Get attempts for a specific callsign
async fn get_callsign_attempts(
    State(state): State<Arc<AppState>>,
    Path(callsign): Path<String>,
    Query(query): Query<CallsignQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let callsign = callsign.trim().to_uppercase();

    let attempts: Vec<Attempt> = match query.speed {
        Some(speed) => {
            sqlx::query_as(
                r#"
                SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at
                FROM attempts
                WHERE callsign = ? AND test_speed = ?
                ORDER BY created_at DESC
                "#,
            )
            .bind(&callsign)
            .bind(speed)
            .fetch_all(&state.db)
            .await
        }
        None => {
            sqlx::query_as(
                r#"
                SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at
                FROM attempts
                WHERE callsign = ?
                ORDER BY created_at DESC
                "#,
            )
            .bind(&callsign)
            .fetch_all(&state.db)
            .await
        }
    }
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(attempts))
}

/// Get leaderboard - operators ranked by highest speed passed
async fn get_leaderboard(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let limit = query.limit.unwrap_or(50).min(100);

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

    Ok(Json(entries))
}

/// Get overall statistics
async fn get_stats(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let total_attempts: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attempts")
        .fetch_one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total_passes: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM attempts WHERE passed = true AND validation_status = 'approved'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let unique_callsigns: (i64,) = sqlx::query_as("SELECT COUNT(DISTINCT callsign) FROM attempts")
        .fetch_one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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

    let stats = StatsResponse {
        total_attempts: total_attempts.0,
        total_passes: total_passes.0,
        unique_callsigns: unique_callsigns.0,
        attempts_by_speed,
    };

    Ok(Json(stats))
}

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

/// Health check endpoint
async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "knowcodeextra-api",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

// ============================================================================
// Main
// ============================================================================

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env file first (so env vars are available for config)
    dotenvy::dotenv().ok();

    // Load configuration
    let config = Config::load()?;

    // Initialize tracing with configured log level
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| config.log_level.clone().into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Configuration loaded");
    tracing::debug!(?config, "Full configuration");

    // Database connection
    tracing::info!("Connecting to database: {}", config.database_url);

    let connect_options: SqliteConnectOptions = config
        .database_url
        .parse::<SqliteConnectOptions>()?
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    // Run migrations
    setup_database(&pool).await?;
    tracing::info!("Database setup complete");

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
        admin_jwt_secret: config.admin_jwt_secret.clone(),
        qrz_client,
        static_dir: config.static_dir.clone(),
    });

    // Generate initial PoLo notes file
    if let Err(e) = admin::regenerate_polo_notes(&state).await {
        tracing::warn!("Failed to generate initial PoLo notes file: {}", e);
    }

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Admin API routes (protected by JWT)
    let admin_api = Router::new()
        .route("/stats", get(admin::get_admin_stats))
        .route("/queue", get(admin::get_queue))
        .route("/queue/:callsign/history", get(admin::get_callsign_history))
        .route("/queue/:id/approve", post(admin::approve_attempt_json))
        .route("/queue/:id/reject", post(admin::reject_attempt_json))
        .route("/approved", get(admin::get_approved_list))
        .route(
            "/approved/mark-reached-out",
            post(admin::mark_reached_out_json),
        )
        .route("/search", get(admin::search_attempts))
        .route("/settings", get(admin::get_settings))
        .route("/tests", get(admin::list_tests_admin))
        .route("/tests", post(admin::create_test))
        .route("/tests/:id", axum::routing::put(admin::update_test))
        .route("/tests/:id", axum::routing::delete(admin::delete_test))
        .route("/tests/:test_id/questions", get(admin::list_questions_admin))
        .route("/tests/:test_id/questions", post(admin::create_question))
        .route("/questions/:id", axum::routing::put(admin::update_question))
        .route("/questions/:id", axum::routing::delete(admin::delete_question))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            jwt::require_admin_auth,
        ));

    // SPA fallback for admin routes
    let index_file = ServeFile::new(format!("{}/index.html", config.static_dir));

    // Build router
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/attempts", post(create_attempt))
        .route("/api/attempts", get(list_attempts))
        .route("/api/attempts/:callsign", get(get_callsign_attempts))
        .route("/api/leaderboard", get(get_leaderboard))
        .route("/api/stats", get(get_stats))
        .route("/api/tests", get(list_tests))
        .route("/api/tests/:test_id/questions", get(get_test_questions))
        .route("/api/tests/:test_id/submit", post(submit_test))
        .route(
            "/api/certificate/:attempt_id",
            get(certificate::get_certificate_svg),
        )
        .route("/api/admin/login", post(jwt::login))
        .nest("/api/admin", admin_api)
        // Explicit SPA routes for /admin
        .route_service("/admin", index_file.clone())
        .route_service("/admin/", index_file.clone())
        .fallback_service(ServeDir::new(&config.static_dir).not_found_service(index_file))
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state);

    tracing::info!("Serving static files from {}", config.static_dir);

    // Start server
    let listener = tokio::net::TcpListener::bind(&config.listen_addr).await?;
    tracing::info!("Server listening on {}", config.listen_addr);

    axum::serve(listener, app).await?;

    Ok(())
}
