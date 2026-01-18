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
    pub sub: String, // username
    pub exp: usize,  // expiry timestamp
    pub iat: usize,  // issued at
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
            return (
                StatusCode::UNAUTHORIZED,
                "Missing or invalid authorization header",
            )
                .into_response();
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
