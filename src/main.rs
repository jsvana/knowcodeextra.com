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
        INSERT INTO attempts (id, callsign, test_speed, questions_correct, copy_chars, passed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&callsign)
    .bind(req.test_speed)
    .bind(req.questions_correct)
    .bind(req.copy_chars)
    .bind(req.passed)
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let certificate_number = if req.passed {
        Some(format!(
            "{}WPM-{}",
            req.test_speed,
            id.split('-').next().unwrap_or(&id).to_uppercase()
        ))
    } else {
        None
    };

    let response = AttemptResponse {
        id,
        callsign,
        test_speed: req.test_speed,
        questions_correct: req.questions_correct,
        copy_chars: req.copy_chars,
        passed: req.passed,
        created_at: now,
        certificate_number,
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
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "knowcodeextra=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load environment variables
    dotenvy::dotenv().ok();

    // Database connection
    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:knowcodeextra.db".to_string());
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "./static".to_string());

    tracing::info!("Connecting to database: {}", database_url);

    let connect_options: SqliteConnectOptions = database_url
        .parse::<SqliteConnectOptions>()?
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    // Run migrations
    setup_database(&pool).await?;
    tracing::info!("Database setup complete");

    let state = Arc::new(AppState { db: pool });

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
        .fallback_service(
            ServeDir::new(&static_dir)
                .not_found_service(ServeFile::new(format!("{}/index.html", static_dir))),
        )
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state);

    tracing::info!("Serving static files from {}", static_dir);

    // Start server
    let addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
