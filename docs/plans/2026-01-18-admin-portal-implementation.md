# Admin Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the admin portal from server-rendered HTML pages to a React SPA with JWT authentication, dashboard, improved queue/approved views, search, and settings.

**Architecture:** Frontend adds admin routes to the existing React app with an auth context for JWT tokens. Backend adds JWT-based login endpoint and new admin API endpoints, replacing Basic Auth with Bearer token validation.

**Tech Stack:** React (existing), Axum (existing), jsonwebtoken crate for JWT, existing Tailwind/amber styling

---

## Task 1: Add JWT Dependency

**Files:**
- Modify: `Cargo.toml:19` (add after reqwest line)

**Step 1: Add jsonwebtoken crate**

Add to dependencies in Cargo.toml after line 20:

```toml
jsonwebtoken = "9"
```

**Step 2: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add Cargo.toml
git commit -m "chore: add jsonwebtoken dependency for admin auth"
```

---

## Task 2: Add JWT Secret to Config

**Files:**
- Modify: `src/main.rs:39-43` (add admin_jwt_secret field)
- Modify: `src/main.rs:63-68` (add default function)
- Modify: `src/main.rs:80-81` (add to config builder)
- Modify: `src/main.rs:211-216` (add to AppState)
- Modify: `src/main.rs:643-648` (add to state construction)

**Step 1: Add config field**

In `src/main.rs`, after line 43 (admin_password field), add:

```rust
    #[serde(default = "Config::default_admin_jwt_secret")]
    pub admin_jwt_secret: String,
```

**Step 2: Add default function**

After the `default_admin_password` function (around line 68), add:

```rust
    fn default_admin_jwt_secret() -> String {
        "change-this-secret-in-production".to_string()
    }
```

**Step 3: Add to config builder**

In the config builder (around line 81), add after admin_password default:

```rust
            .set_default("admin_jwt_secret", Self::default_admin_jwt_secret())?
```

**Step 4: Add to AppState**

In the AppState struct (around line 214), add after admin_password:

```rust
    pub admin_jwt_secret: String,
```

**Step 5: Add to state construction**

In main() state construction (around line 646), add after admin_password:

```rust
        admin_jwt_secret: config.admin_jwt_secret.clone(),
```

**Step 6: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 7: Commit**

```bash
git add src/main.rs
git commit -m "feat: add admin_jwt_secret to config"
```

---

## Task 3: Create JWT Auth Module

**Files:**
- Create: `src/jwt.rs`
- Modify: `src/main.rs:17` (add mod jwt)

**Step 1: Create jwt.rs**

Create `src/jwt.rs`:

```rust
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const TOKEN_EXPIRY_HOURS: i64 = 8;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,  // username
    pub exp: usize,   // expiry timestamp
    pub iat: usize,   // issued at
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub expires_in: i64,
}

/// Login endpoint - validates credentials and returns JWT
pub async fn login(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate credentials
    if req.username != state.admin_username || req.password != state.admin_password {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }

    // Create JWT
    let now = chrono::Utc::now();
    let exp = now + chrono::Duration::hours(TOKEN_EXPIRY_HOURS);

    let claims = Claims {
        sub: req.username,
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.admin_jwt_secret.as_bytes()),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(LoginResponse {
        token,
        expires_in: TOKEN_EXPIRY_HOURS * 3600,
    }))
}

/// Middleware to validate JWT on admin routes
pub async fn require_admin_auth(
    State(state): State<Arc<crate::AppState>>,
    request: Request,
    next: Next,
) -> Response {
    // Extract token from Authorization header
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return (StatusCode::UNAUTHORIZED, "Missing or invalid authorization header").into_response();
        }
    };

    // Validate JWT
    let validation = Validation::default();
    match decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.admin_jwt_secret.as_bytes()),
        &validation,
    ) {
        Ok(_) => next.run(request).await,
        Err(_) => (StatusCode::UNAUTHORIZED, "Invalid or expired token").into_response(),
    }
}
```

**Step 2: Add module declaration**

In `src/main.rs`, after line 19 (mod qrz;), add:

```rust
mod jwt;
```

**Step 3: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/jwt.rs src/main.rs
git commit -m "feat: add JWT authentication module"
```

---

## Task 4: Create Admin API Endpoints

**Files:**
- Modify: `src/admin.rs` (add new endpoints, remove Basic Auth checks)

**Step 1: Add new imports and types at top of admin.rs**

Replace the imports at the top of `src/admin.rs` (lines 1-12) with:

```rust
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
```

**Step 2: Add new response types after RejectForm struct (around line 65)**

After the BulkIdsForm struct, add:

```rust
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
```

**Step 3: Add dashboard stats endpoint**

Add after the new types:

```rust
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
```

**Step 4: Add queue list endpoint (JSON)**

```rust
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
```

**Step 5: Add approve/reject JSON endpoints**

```rust
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
```

**Step 6: Add paginated approved list endpoint**

```rust
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
```

**Step 7: Add search endpoint**

```rust
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
```

**Step 8: Add settings endpoint**

```rust
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
```

**Step 9: Verify it compiles**

Run: `cargo check`
Expected: Compiles (may have warnings about unused old functions)

**Step 10: Commit**

```bash
git add src/admin.rs
git commit -m "feat: add admin JSON API endpoints"
```

---

## Task 5: Wire Up Routes with JWT Middleware

**Files:**
- Modify: `src/main.rs:657-669` (update routes)

**Step 1: Add middleware import**

At the top of main.rs, update the axum import to include middleware:

```rust
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
```

**Step 2: Update router with new routes**

Replace the router construction (around line 657-676) with:

```rust
    // Admin API routes (protected by JWT)
    let admin_api = Router::new()
        .route("/stats", get(admin::get_admin_stats))
        .route("/queue", get(admin::get_queue))
        .route("/queue/:callsign/history", get(admin::get_callsign_history))
        .route("/queue/:id/approve", post(admin::approve_attempt_json))
        .route("/queue/:id/reject", post(admin::reject_attempt_json))
        .route("/approved", get(admin::get_approved_list))
        .route("/approved/mark-reached-out", post(admin::mark_reached_out_json))
        .route("/search", get(admin::search_attempts))
        .route("/settings", get(admin::get_settings))
        .layer(middleware::from_fn_with_state(state.clone(), jwt::require_admin_auth));

    // Build router
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/attempts", post(create_attempt))
        .route("/api/attempts", get(list_attempts))
        .route("/api/attempts/:callsign", get(get_callsign_attempts))
        .route("/api/leaderboard", get(get_leaderboard))
        .route("/api/stats", get(get_stats))
        .route("/api/certificate/:attempt_id", get(certificate::get_certificate_svg))
        .route("/api/admin/login", post(jwt::login))
        .nest("/api/admin", admin_api)
        .fallback_service(
            ServeDir::new(&config.static_dir)
                .not_found_service(ServeFile::new(format!("{}/index.html", config.static_dir))),
        )
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state);
```

**Step 3: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: wire up admin API routes with JWT middleware"
```

---

## Task 6: Create Admin Frontend - Auth Context

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add admin components after line 1256)

**Step 1: Add AdminAuthContext after the main app component**

After the KnowCodeExtra component (around line 1256, before the mount code), add:

```jsx
// ============================================================================
// ADMIN PORTAL
// ============================================================================

// Admin Auth Context
const AdminAuthContext = React.createContext(null);

function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (username, password) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Login failed");
      }

      const data = await response.json();
      setToken(data.token);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
  };

  const adminFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      logout();
      throw new Error("Session expired");
    }

    return response;
  };

  return (
    <AdminAuthContext.Provider value={{ token, login, logout, adminFetch, isLoading, isAuthenticated: !!token }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

function useAdminAuth() {
  const context = React.useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin auth context"
```

---

## Task 7: Create Admin Login Page

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after AdminAuthProvider)

**Step 1: Add AdminLogin component**

After the useAdminAuth function, add:

```jsx
// Admin Login Page
function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const { login, isLoading } = useAdminAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white border-4 border-amber-800 shadow-2xl max-w-md w-full p-8">
        {/* Corner ornaments */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-600" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-600" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-600" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-600" />

        <div className="text-center mb-8">
          <TelegraphKey className="w-16 h-8 text-amber-800 mx-auto mb-4" />
          <h1
            className="font-serif text-3xl font-bold text-amber-900"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Admin Portal
          </h1>
          <p className="font-mono text-xs text-amber-600 mt-2">KNOW CODE EXTRA</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 p-3 text-red-800 font-mono text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">
              USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono
                       focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono
                       focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-amber-900 text-amber-50 px-6 py-4 font-mono tracking-widest
                     hover:bg-amber-800 transition-all disabled:opacity-50"
          >
            {isLoading ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <a href="/" className="font-mono text-sm text-amber-600 hover:text-amber-800">
            &larr; Return to main site
          </a>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin login page"
```

---

## Task 8: Create Admin Layout with Sidebar

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after AdminLogin)

**Step 1: Add AdminLayout and Toast components**

After AdminLogin, add:

```jsx
// Toast notification component
function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === "success" ? "bg-green-600" : "bg-red-600";

  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 shadow-lg font-mono text-sm z-50`}>
      {message}
    </div>
  );
}

// Admin Layout with Sidebar
function AdminLayout({ children, currentPage, pendingCount = 0 }) {
  const { logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "queue", label: "Queue", icon: "📋", badge: pendingCount },
    { id: "approved", label: "Approved", icon: "✓" },
    { id: "search", label: "Search", icon: "🔍" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div className="min-h-screen bg-amber-50 flex">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 bg-amber-900 text-amber-50 p-2"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-40
        w-64 bg-amber-900 text-amber-50 transform transition-transform
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-6 border-b border-amber-800">
          <h1 className="font-serif text-xl font-bold">Admin Portal</h1>
          <p className="font-mono text-xs text-amber-400 mt-1">KNOW CODE EXTRA</p>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#/admin/${item.id}`}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors
                ${currentPage === item.id
                  ? "bg-amber-800 text-amber-50"
                  : "text-amber-300 hover:bg-amber-800 hover:text-amber-50"
                }
              `}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-amber-800">
          <button
            onClick={logout}
            className="w-full px-4 py-2 font-mono text-sm text-amber-300 hover:text-amber-50 hover:bg-amber-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 md:ml-0">
        <header className="bg-white border-b border-amber-200 px-6 py-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold text-amber-900 capitalize ml-12 md:ml-0">
            {currentPage}
          </h2>
        </header>
        <main className="p-6">
          {children}
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin layout with sidebar navigation"
```

---

## Task 9: Create Admin Dashboard Page

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after AdminLayout)

**Step 1: Add AdminDashboard component**

After AdminLayout, add:

```jsx
// Admin Dashboard Page
function AdminDashboard({ onNavigate }) {
  const { adminFetch } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/stats`);
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refetch on window focus
    const handleFocus = () => fetchStats();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 p-6 text-center">
        <p className="text-red-800 font-mono mb-4">{error}</p>
        <button
          onClick={fetchStats}
          className="bg-red-600 text-white px-4 py-2 font-mono text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const statCards = [
    { label: "Pending", value: stats.pending_count, highlight: stats.pending_count > 0 },
    { label: "Approved Today", value: stats.approved_today },
    { label: "Total Certificates", value: stats.total_certificates },
    { label: "Rejections", value: stats.rejected_count },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white border-2 p-6 shadow-sm ${
              card.highlight ? "border-amber-500 bg-amber-50" : "border-amber-300"
            }`}
          >
            <p className="font-mono text-xs text-amber-600 mb-1">{card.label.toUpperCase()}</p>
            <p className="font-serif text-3xl font-bold text-amber-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      {stats.pending_count > 0 && (
        <div className="bg-amber-100 border-2 border-amber-400 p-4 flex items-center justify-between">
          <p className="font-serif text-amber-800">
            You have <strong>{stats.pending_count}</strong> attempt(s) awaiting review
          </p>
          <button
            onClick={() => onNavigate("queue")}
            className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800"
          >
            Review Queue
          </button>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">RECENT ACTIVITY</h3>
        </div>
        <div className="divide-y divide-amber-200">
          {stats.recent_activity.length === 0 ? (
            <p className="px-6 py-8 text-center text-amber-600 font-serif italic">
              No recent activity
            </p>
          ) : (
            stats.recent_activity.map((item) => (
              <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <span className="font-mono text-amber-900 font-bold">{item.callsign}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 font-mono ${
                    item.action === "approved"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {item.action}
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
    </div>
  );
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin dashboard page"
```

---

## Task 10: Create Admin Queue Page

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after AdminDashboard)

**Step 1: Add AdminQueue component**

After AdminDashboard, add:

```jsx
// Admin Queue Page
function AdminQueue({ onPendingCountChange }) {
  const { adminFetch } = useAdminAuth();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCallsign, setExpandedCallsign] = useState(null);
  const [history, setHistory] = useState({});
  const [toast, setToast] = useState(null);
  const [rejectModal, setRejectModal] = useState({ isOpen: false, attemptId: null });
  const [rejectNote, setRejectNote] = useState("");

  const fetchQueue = async () => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue`);
      if (!response.ok) throw new Error("Failed to fetch queue");
      const data = await response.json();
      setQueue(data);
      onPendingCountChange?.(data.length);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (callsign) => {
    if (history[callsign]) return;
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${callsign}/history`);
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setHistory((prev) => ({ ...prev, [callsign]: data }));
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleApprove = async (attemptId) => {
    // Optimistic update
    const item = queue.find((q) => q.id === attemptId);
    setQueue((prev) => prev.filter((q) => q.id !== attemptId));

    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/approve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to approve");
      const data = await response.json();
      setToast({ message: `Approved - Certificate #${data.certificate_number}`, type: "success" });
      onPendingCountChange?.(queue.length - 1);
    } catch (err) {
      // Rollback
      setQueue((prev) => [...prev, item].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleReject = async () => {
    const attemptId = rejectModal.attemptId;
    const item = queue.find((q) => q.id === attemptId);
    setQueue((prev) => prev.filter((q) => q.id !== attemptId));
    setRejectModal({ isOpen: false, attemptId: null });

    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: rejectNote || null }),
      });
      if (!response.ok) throw new Error("Failed to reject");
      setToast({ message: "Rejected", type: "success" });
      setRejectNote("");
      onPendingCountChange?.(queue.length - 1);
    } catch (err) {
      setQueue((prev) => [...prev, item].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      setToast({ message: err.message, type: "error" });
    }
  };

  const toggleHistory = (callsign) => {
    if (expandedCallsign === callsign) {
      setExpandedCallsign(null);
    } else {
      setExpandedCallsign(callsign);
      fetchHistory(callsign);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const formatRelativeTime = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">PENDING VALIDATION</h3>
        </div>

        {queue.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-serif text-xl text-amber-800 mb-2">No pending attempts</p>
            <p className="font-mono text-sm text-amber-600">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-amber-200">
            {queue.map((item) => (
              <div key={item.id}>
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <button
                      onClick={() => toggleHistory(item.callsign)}
                      className="font-mono text-lg font-bold text-amber-900 hover:text-amber-700"
                    >
                      {item.callsign}
                      <span className="ml-2 text-xs text-amber-500">
                        {expandedCallsign === item.callsign ? "▼" : "▶"}
                      </span>
                    </button>
                    <div className="flex gap-4 mt-1 font-mono text-sm text-amber-600">
                      <span>{item.questions_correct}/10</span>
                      <span>{item.copy_chars} chars</span>
                      <span>{formatRelativeTime(item.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="bg-green-600 text-white px-4 py-2 font-mono text-sm hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectModal({ isOpen: true, attemptId: item.id })}
                      className="bg-red-600 text-white px-4 py-2 font-mono text-sm hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {/* History panel */}
                {expandedCallsign === item.callsign && history[item.callsign] && (
                  <div className="bg-amber-50 px-6 py-4 border-t border-amber-200">
                    <h4 className="font-mono text-xs text-amber-700 mb-2">HISTORY FOR {item.callsign}</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full font-mono text-sm">
                        <thead>
                          <tr className="text-amber-600 text-left">
                            <th className="pr-4">Date</th>
                            <th className="pr-4">Score</th>
                            <th className="pr-4">Copy</th>
                            <th className="pr-4">Passed</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history[item.callsign].map((h) => (
                            <tr key={h.id} className="text-amber-800">
                              <td className="pr-4 py-1">{new Date(h.created_at).toLocaleDateString()}</td>
                              <td className="pr-4">{h.questions_correct}/10</td>
                              <td className="pr-4">{h.copy_chars}</td>
                              <td className="pr-4">{h.passed ? "Yes" : "No"}</td>
                              <td>{h.validation_status || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRejectModal({ isOpen: false, attemptId: null })} />
          <div className="relative bg-amber-50 border-4 border-amber-800 shadow-2xl max-w-md w-full p-8">
            <h2 className="font-serif text-2xl font-bold text-amber-900 mb-4">Reject Attempt</h2>
            <div className="mb-4">
              <label className="font-mono text-xs text-amber-700 block mb-1">NOTE (OPTIONAL)</label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="w-full border-2 border-amber-300 bg-white p-3 font-mono text-sm h-24 focus:border-amber-500 focus:outline-none"
                placeholder="Reason for rejection..."
              />
            </div>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setRejectModal({ isOpen: false, attemptId: null })}
                className="px-4 py-2 font-mono text-sm border-2 border-amber-300 text-amber-800 hover:border-amber-500"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 font-mono text-sm bg-red-600 text-white hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin queue page with approve/reject"
```

---

## Task 11: Create Admin Approved Page

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after AdminQueue)

**Step 1: Add AdminApproved component**

After AdminQueue, add:

```jsx
// Admin Approved Page
function AdminApproved() {
  const { adminFetch } = useAdminAuth();
  const [data, setData] = useState({ items: [], total: 0, page: 1, per_page: 25 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null); // null = all, false = not reached out, true = reached out
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState(null);

  const fetchApproved = async (page = 1) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/admin/approved?page=${page}&per_page=25`;
      if (filter !== null) url += `&reached_out=${filter}`;
      const response = await adminFetch(url);
      if (!response.ok) throw new Error("Failed to fetch");
      const result = await response.json();
      setData(result);
      setSelected(new Set());
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkReachedOut = async () => {
    if (selected.size === 0) return;

    const ids = Array.from(selected);
    // Optimistic update
    setData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        ids.includes(item.id) ? { ...item, reached_out: true } : item
      ),
    }));
    setSelected(new Set());

    try {
      const response = await adminFetch(`${API_BASE}/api/admin/approved/mark-reached-out`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Failed to mark");
      const result = await response.json();
      setToast({ message: `Marked ${result.count} as reached out`, type: "success" });
    } catch (err) {
      fetchApproved(data.page); // Rollback by refetching
      setToast({ message: err.message, type: "error" });
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  };

  const copyEmail = (email) => {
    navigator.clipboard.writeText(email);
    setToast({ message: "Email copied", type: "success" });
  };

  useEffect(() => {
    fetchApproved(1);
  }, [filter]);

  const totalPages = Math.ceil(data.total / data.per_page);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Actions bar */}
      <div className="bg-white border-2 border-amber-300 p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleMarkReachedOut}
            disabled={selected.size === 0}
            className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800 disabled:opacity-50"
          >
            Mark Selected as Reached Out
          </button>
          <span className="font-mono text-sm text-amber-600">{selected.size} selected</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-amber-600">Filter:</span>
          <select
            value={filter === null ? "all" : filter.toString()}
            onChange={(e) => setFilter(e.target.value === "all" ? null : e.target.value === "true")}
            className="border-2 border-amber-300 px-3 py-1 font-mono text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="all">All</option>
            <option value="false">Not Reached Out</option>
            <option value="true">Reached Out</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border-2 border-amber-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-amber-900 text-amber-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={data.items.length > 0 && selected.size === data.items.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CALLSIGN</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">EMAIL</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CERT #</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">APPROVED</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">REACHED OUT</th>
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
                    No approved attempts
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr
                    key={item.id}
                    className={item.reached_out ? "opacity-50" : ""}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-900">{item.callsign}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-amber-700">{item.email || "Not found"}</span>
                        {item.email && (
                          <button
                            onClick={() => copyEmail(item.email)}
                            className="text-amber-500 hover:text-amber-700"
                            title="Copy email"
                          >
                            📋
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/api/certificate/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-amber-600 hover:text-amber-800 underline"
                      >
                        #{item.certificate_number}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {item.validated_at ? new Date(item.validated_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 font-mono ${
                        item.reached_out
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {item.reached_out ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-amber-200 flex items-center justify-between">
            <span className="font-mono text-sm text-amber-600">
              Showing {((data.page - 1) * data.per_page) + 1}-{Math.min(data.page * data.per_page, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchApproved(data.page - 1)}
                disabled={data.page <= 1}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => fetchApproved(data.page + 1)}
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

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin approved page with pagination"
```

---

## Task 12: Create Admin Search Page

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after AdminApproved)

**Step 1: Add AdminSearch component**

After AdminApproved, add:

```jsx
// Admin Search Page
function AdminSearch() {
  const { adminFetch } = useAdminAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (attemptId) => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/approve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to approve");
      const data = await response.json();
      setToast({ message: `Approved - Certificate #${data.certificate_number}`, type: "success" });
      // Refresh search results
      handleSearch({ preventDefault: () => {} });
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleReject = async (attemptId) => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: null }),
      });
      if (!response.ok) throw new Error("Failed to reject");
      setToast({ message: "Rejected", type: "success" });
      handleSearch({ preventDefault: () => {} });
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  // Group results by callsign
  const grouped = results.reduce((acc, item) => {
    if (!acc[item.callsign]) acc[item.callsign] = [];
    acc[item.callsign].push(item);
    return acc;
  }, {});

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Search Form */}
      <form onSubmit={handleSearch} className="bg-white border-2 border-amber-300 p-6 mb-6">
        <div className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            className="flex-1 border-2 border-amber-300 px-4 py-3 font-mono uppercase
                     focus:border-amber-500 focus:outline-none"
            placeholder="Search by callsign (e.g., W1AW or W1)"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-amber-900 text-amber-50 px-6 py-3 font-mono tracking-widest
                     hover:bg-amber-800 disabled:opacity-50"
          >
            {loading ? "..." : "SEARCH"}
          </button>
        </div>
        <p className="font-mono text-xs text-amber-600 mt-2">
          Supports partial matches (e.g., "W1" finds all W1* callsigns)
        </p>
      </form>

      {/* Results */}
      {searched && (
        <div className="bg-white border-2 border-amber-300 shadow-sm">
          <div className="bg-amber-900 text-amber-50 px-6 py-3">
            <h3 className="font-mono text-sm tracking-widest">
              SEARCH RESULTS ({results.length})
            </h3>
          </div>

          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-serif text-amber-800 mb-2">No attempts found for "{query}"</p>
              <p className="font-mono text-sm text-amber-600">Try a partial callsign or check spelling</p>
            </div>
          ) : (
            <div className="divide-y divide-amber-200">
              {Object.entries(grouped).map(([callsign, attempts]) => (
                <div key={callsign} className="px-6 py-4">
                  <h4 className="font-mono text-lg font-bold text-amber-900 mb-3">{callsign}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full font-mono text-sm">
                      <thead>
                        <tr className="text-amber-600 text-left border-b border-amber-200">
                          <th className="pr-4 pb-2">Date</th>
                          <th className="pr-4 pb-2">Score</th>
                          <th className="pr-4 pb-2">Copy</th>
                          <th className="pr-4 pb-2">Passed</th>
                          <th className="pr-4 pb-2">Status</th>
                          <th className="pr-4 pb-2">Cert #</th>
                          <th className="pb-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attempts.map((item) => (
                          <tr key={item.id} className="text-amber-800">
                            <td className="pr-4 py-2">{new Date(item.created_at).toLocaleDateString()}</td>
                            <td className="pr-4">{item.questions_correct}/10</td>
                            <td className="pr-4">{item.copy_chars}</td>
                            <td className="pr-4">{item.passed ? "Yes" : "No"}</td>
                            <td className="pr-4">
                              <span className={`text-xs px-2 py-0.5 ${
                                item.validation_status === "approved" ? "bg-green-100 text-green-800" :
                                item.validation_status === "rejected" ? "bg-red-100 text-red-800" :
                                item.validation_status === "pending" ? "bg-amber-100 text-amber-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                {item.validation_status || "—"}
                              </span>
                            </td>
                            <td className="pr-4">
                              {item.certificate_number ? (
                                <a
                                  href={`/api/certificate/${item.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-600 hover:text-amber-800 underline"
                                >
                                  #{item.certificate_number}
                                </a>
                              ) : "—"}
                            </td>
                            <td>
                              {item.validation_status === "pending" && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleApprove(item.id)}
                                    className="text-xs bg-green-600 text-white px-2 py-1 hover:bg-green-700"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(item.id)}
                                    className="text-xs bg-red-600 text-white px-2 py-1 hover:bg-red-700"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {item.admin_note && (
                                <span className="text-xs text-amber-600 ml-2" title={item.admin_note}>
                                  📝
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin search page"
```

---

## Task 13: Create Admin Settings Page

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add after AdminSearch)

**Step 1: Add AdminSettings component**

After AdminSearch, add:

```jsx
// Admin Settings Page
function AdminSettings() {
  const { adminFetch } = useAdminAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await adminFetch(`${API_BASE}/api/admin/settings`);
        if (!response.ok) throw new Error("Failed to fetch settings");
        const data = await response.json();
        setSettings(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  const configItems = settings ? [
    { label: "Database", value: settings.database_url },
    { label: "Listen Address", value: settings.listen_addr },
    { label: "Static Directory", value: settings.static_dir },
    { label: "Log Level", value: settings.log_level },
    { label: "QRZ Integration", value: settings.qrz_enabled ? "Enabled" : "Disabled", status: settings.qrz_enabled },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Config Display */}
      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">CURRENT CONFIGURATION</h3>
        </div>
        <div className="divide-y divide-amber-200">
          {configItems.map((item) => (
            <div key={item.label} className="px-6 py-4 flex items-center justify-between">
              <span className="font-mono text-sm text-amber-700">{item.label}</span>
              <span className="font-mono text-sm text-amber-900">
                {item.status !== undefined ? (
                  <span className={`px-2 py-1 text-xs ${item.status ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {item.value}
                  </span>
                ) : (
                  item.value
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="bg-amber-100 border-l-4 border-amber-600 p-4">
        <p className="font-serif text-amber-800 text-sm">
          <strong>Note:</strong> Settings are configured via <code className="bg-amber-200 px-1">config.toml</code> or environment variables.
          Changes require a server restart.
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin settings page"
```

---

## Task 14: Create Admin App Router

**Files:**
- Modify: `frontend/knowcodeextra.jsx` (add AdminApp and update mount)

**Step 1: Add AdminApp component with hash-based routing**

After AdminSettings, add:

```jsx
// Admin App with Hash-based Routing
function AdminApp() {
  const { isAuthenticated } = useAdminAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [pendingCount, setPendingCount] = useState(0);

  // Handle hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/admin/")) {
        const page = hash.replace("#/admin/", "");
        if (["dashboard", "queue", "approved", "search", "settings"].includes(page)) {
          setCurrentPage(page);
        }
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigateTo = (page) => {
    window.location.hash = `/admin/${page}`;
    setCurrentPage(page);
  };

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  let content;
  switch (currentPage) {
    case "dashboard":
      content = <AdminDashboard onNavigate={navigateTo} />;
      break;
    case "queue":
      content = <AdminQueue onPendingCountChange={setPendingCount} />;
      break;
    case "approved":
      content = <AdminApproved />;
      break;
    case "search":
      content = <AdminSearch />;
      break;
    case "settings":
      content = <AdminSettings />;
      break;
    default:
      content = <AdminDashboard onNavigate={navigateTo} />;
  }

  return (
    <AdminLayout currentPage={currentPage} pendingCount={pendingCount}>
      {content}
    </AdminLayout>
  );
}
```

**Step 2: Update the app mount code**

Replace the mount code at the end of the file (around line 1259-1260) with:

```jsx
// Mount the app based on URL
function App() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");

  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <AdminApp />
      </AdminAuthProvider>
    );
  }

  return <KnowCodeExtra />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
```

**Step 3: Verify frontend builds**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add frontend/knowcodeextra.jsx
git commit -m "feat: add admin app with hash-based routing"
```

---

## Task 15: Build and Test End-to-End

**Step 1: Build the frontend**

Run: `cd frontend && ./build.sh`
Expected: Builds without errors

**Step 2: Build the backend**

Run: `cargo build`
Expected: Compiles without errors (may have warnings about unused code)

**Step 3: Commit final state**

```bash
git add -A
git commit -m "feat: complete admin portal implementation"
```

---

## Task 16: Clean Up Old HTML Admin Routes (Optional)

**Files:**
- Modify: `src/admin.rs` (remove old HTML-rendering functions)
- Modify: `src/main.rs` (remove old admin routes if still present)

This task is optional - the old HTML admin endpoints can be removed once the new React admin is working.

**Step 1: Remove old functions from admin.rs**

Remove these functions (they're no longer needed):
- `check_auth`
- `admin_queue` (the HTML version)
- `approve_attempt` (the redirect version)
- `reject_attempt` (the redirect version)
- `approved_list` (the HTML version)
- `mark_reached_out` (the redirect version)

**Step 2: Remove old route definitions if any remain**

The old routes were already replaced in Task 5.

**Step 3: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/admin.rs
git commit -m "chore: remove legacy HTML admin endpoints"
```

---

## Summary

This plan implements:
1. JWT authentication (backend + frontend)
2. Admin login page
3. Dashboard with stats and recent activity
4. Queue page with approve/reject and inline history
5. Approved list with pagination and bulk actions
6. Search page
7. Settings page
8. Hash-based routing for SPA navigation
9. Shared components (Toast, Layout, Auth Context)

All following the existing amber/monospace styling.
