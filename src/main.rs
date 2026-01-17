use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, FromRow, SqlitePool};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

mod certificate;

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

    pub fn load() -> Result<Self, config::ConfigError> {
        let config_path = std::env::var("CONFIG_FILE").unwrap_or_else(|_| "config.toml".to_string());

        config::Config::builder()
            // Start with defaults
            .set_default("database_url", Self::default_database_url())?
            .set_default("listen_addr", Self::default_listen_addr())?
            .set_default("static_dir", Self::default_static_dir())?
            .set_default("log_level", Self::default_log_level())?
            .set_default("admin_username", Self::default_admin_username())?
            .set_default("admin_password", Self::default_admin_password())?
            // Layer on config file (optional)
            .add_source(config::File::with_name(&config_path).required(false))
            // Layer on environment variables (prefix KNOWCODE_)
            .add_source(
                config::Environment::with_prefix("KNOWCODE")
                    .separator("_")
                    .try_parsing(true),
            )
            // Legacy env var support
            .add_source(
                config::Environment::default()
                    .prefix("")
                    .try_parsing(true)
                    .source(Some({
                        let mut map = std::collections::HashMap::new();
                        if let Ok(v) = std::env::var("DATABASE_URL") {
                            map.insert("database_url".to_string(), v);
                        }
                        if let Ok(v) = std::env::var("LISTEN_ADDR") {
                            map.insert("listen_addr".to_string(), v);
                        }
                        if let Ok(v) = std::env::var("STATIC_DIR") {
                            map.insert("static_dir".to_string(), v);
                        }
                        if let Ok(v) = std::env::var("RUST_LOG") {
                            map.insert("log_level".to_string(), v);
                        }
                        map
                    })),
            )
            .build()?
            .try_deserialize()
    }
}

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptRequest {
    pub callsign: String,
    pub test_speed: i32,        // 5, 13, or 20
    pub questions_correct: i32, // 0-10
    pub copy_chars: i32,        // characters copied
    pub passed: bool,
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

// ============================================================================
// Application State
// ============================================================================

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub admin_username: String,
    pub admin_password: String,
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

    // Index for validation queue queries
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_validation_status ON attempts(validation_status)")
        .execute(pool)
        .await?;

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

    // Validate test speed
    if ![5, 13, 20].contains(&req.test_speed) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid test speed. Must be 5, 13, or 20".to_string(),
        ));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

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
            MAX(CASE WHEN passed = true THEN test_speed ELSE 0 END) as highest_speed_passed,
            COUNT(*) as total_attempts,
            SUM(CASE WHEN passed = true THEN 1 ELSE 0 END) as total_passes,
            MIN(CASE WHEN passed = true THEN created_at ELSE NULL END) as first_passed_at
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

    let total_passes: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attempts WHERE passed = true")
        .fetch_one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let unique_callsigns: (i64,) =
        sqlx::query_as("SELECT COUNT(DISTINCT callsign) FROM attempts")
            .fetch_one(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let attempts_by_speed: Vec<SpeedStats> = sqlx::query_as(
        r#"
        SELECT 
            test_speed,
            COUNT(*) as attempts,
            SUM(CASE WHEN passed = true THEN 1 ELSE 0 END) as passes
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

    let state = Arc::new(AppState {
        db: pool,
        admin_username: config.admin_username.clone(),
        admin_password: config.admin_password.clone(),
    });

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/attempts", post(create_attempt))
        .route("/api/attempts", get(list_attempts))
        .route("/api/attempts/:callsign", get(get_callsign_attempts))
        .route("/api/leaderboard", get(get_leaderboard))
        .route("/api/stats", get(get_stats))
        .route("/api/certificate/:attempt_id", get(certificate::get_certificate_svg))
        .fallback_service(
            ServeDir::new(&config.static_dir)
                .not_found_service(ServeFile::new(format!("{}/index.html", config.static_dir))),
        )
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
