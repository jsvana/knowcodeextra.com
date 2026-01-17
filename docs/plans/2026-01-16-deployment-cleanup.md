# KnowCodeExtra Cleanup & Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the project for easy VPS deployment with the Rust backend serving static frontend assets.

**Architecture:** Single Rust binary serves API endpoints and static files (HTML/JS/audio). Nginx terminates HTTPS and proxies to localhost:3000. SQLite database stored in `/opt/knowcodeextra/data/`.

**Tech Stack:** Rust/Axum, tower-http (static files), esbuild (JSX bundling), systemd, nginx

---

## Task 1: Initialize Git Repository

**Files:**
- Create: `/home/jsvana/projects/knowcodeextra.com/.gitignore`

**Step 1: Create .gitignore**

```gitignore
# Build artifacts
/target/
/knowcodeextra-api/target/

# Dependencies
/node_modules/
/frontend/node_modules/

# Environment and database
.env
*.db
*.db-shm
*.db-wal

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Built frontend (regenerated from source)
/static/app.js
```

**Step 2: Initialize git**

Run: `cd /home/jsvana/projects/knowcodeextra.com && git init`
Expected: Initialized empty Git repository

**Step 3: Initial commit**

Run: `cd /home/jsvana/projects/knowcodeextra.com && git add .gitignore && git commit -m "chore: initialize repository with gitignore"`
Expected: 1 file changed

---

## Task 2: Restructure Project - Move Rust Files to Root

**Files:**
- Move: `knowcodeextra-api/src/` → `src/`
- Move: `knowcodeextra-api/Cargo.toml` → `Cargo.toml`
- Move: `knowcodeextra-api/Cargo.lock` → `Cargo.lock`
- Move: `knowcodeextra-api/.env.example` → `.env.example`
- Delete: `knowcodeextra-api/` directory

**Step 1: Move Rust project files to root**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
mv knowcodeextra-api/src . && \
mv knowcodeextra-api/Cargo.toml . && \
mv knowcodeextra-api/Cargo.lock . && \
mv knowcodeextra-api/.env.example .
```
Expected: No output (success)

**Step 2: Remove old directory (excluding target for now)**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
rm -rf knowcodeextra-api/README.md knowcodeextra-api/.gitignore 2>/dev/null; \
rmdir knowcodeextra-api 2>/dev/null || rm -rf knowcodeextra-api/target && rmdir knowcodeextra-api
```
Expected: Directory removed

**Step 3: Verify structure**

Run: `ls -la /home/jsvana/projects/knowcodeextra.com/`
Expected: See `src/`, `Cargo.toml`, `Cargo.lock`, `.env.example` at root

**Step 4: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add -A && \
git commit -m "refactor: flatten project structure, move Rust files to root"
```

---

## Task 3: Update Cargo.toml for Static File Serving

**Files:**
- Modify: `/home/jsvana/projects/knowcodeextra.com/Cargo.toml`

**Step 1: Add fs feature to tower-http**

In Cargo.toml, change:
```toml
tower-http = { version = "0.5", features = ["cors", "trace"] }
```
To:
```toml
tower-http = { version = "0.5", features = ["cors", "trace", "fs"] }
```

**Step 2: Verify compilation**

Run: `cd /home/jsvana/projects/knowcodeextra.com && cargo check`
Expected: Compiles successfully (warnings OK)

**Step 3: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add Cargo.toml Cargo.lock && \
git commit -m "feat: add tower-http fs feature for static file serving"
```

---

## Task 4: Update main.rs for Static File Serving

**Files:**
- Modify: `/home/jsvana/projects/knowcodeextra.com/src/main.rs`

**Step 1: Add imports**

At the top of main.rs, add to imports:
```rust
use tower_http::services::{ServeDir, ServeFile};
```

**Step 2: Add STATIC_DIR env var**

In the `main` function, after the `database_url` line, add:
```rust
let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "./static".to_string());
```

**Step 3: Update router with fallback service**

Replace the router building section:
```rust
// Build router
let app = Router::new()
    .route("/health", get(health))
    .route("/api/attempts", post(create_attempt))
    .route("/api/attempts", get(list_attempts))
    .route("/api/attempts/:callsign", get(get_callsign_attempts))
    .route("/api/leaderboard", get(get_leaderboard))
    .route("/api/stats", get(get_stats))
    .layer(cors)
    .layer(tower_http::trace::TraceLayer::new_for_http())
    .with_state(state);
```

With:
```rust
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
```

**Step 4: Fix sqlx macro issue**

The `query_as!` macro requires compile-time database. Replace it with runtime query. Change the leaderboard query from `sqlx::query_as!` to `sqlx::query_as`:

```rust
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
```

Also add `FromRow` derive to `LeaderboardEntry`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct LeaderboardEntry {
    pub callsign: String,
    pub highest_speed_passed: i32,
    pub total_attempts: i32,
    pub total_passes: i32,
    pub first_passed_at: Option<DateTime<Utc>>,
}
```

**Step 5: Verify compilation**

Run: `cd /home/jsvana/projects/knowcodeextra.com && cargo check`
Expected: Compiles successfully

**Step 6: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add src/main.rs && \
git commit -m "feat: add static file serving with SPA fallback"
```

---

## Task 5: Create Frontend Directory and Build Script

**Files:**
- Create: `/home/jsvana/projects/knowcodeextra.com/frontend/`
- Move: `knowcodeextra.jsx` → `frontend/knowcodeextra.jsx`
- Create: `frontend/index.html`
- Create: `frontend/build.sh`

**Step 1: Create frontend directory and move JSX**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
mkdir -p frontend && \
mv knowcodeextra.jsx frontend/
```

**Step 2: Create index.html**

Create `frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KnowCodeExtra - CW Code Tests</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
```

**Step 3: Create build.sh**

Create `frontend/build.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Building frontend..."

# Install esbuild if not present
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Install Node.js first."
    exit 1
fi

# Create static directory
mkdir -p ../static

# Bundle JSX
npx esbuild knowcodeextra.jsx \
    --bundle \
    --outfile=../static/app.js \
    --minify \
    --format=iife \
    --global-name=App \
    --external:react \
    --external:react-dom \
    --loader:.jsx=jsx \
    --jsx=automatic \
    --jsx-import-source=react

# Copy HTML
cp index.html ../static/

echo "Frontend built to ../static/"
```

**Step 4: Make build script executable**

Run: `chmod +x /home/jsvana/projects/knowcodeextra.com/frontend/build.sh`

**Step 5: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add frontend/ && \
git commit -m "feat: add frontend build infrastructure"
```

---

## Task 6: Update Frontend for Production

**Files:**
- Modify: `/home/jsvana/projects/knowcodeextra.com/frontend/knowcodeextra.jsx`

**Step 1: Change API_BASE to empty string**

Change line 91 from:
```javascript
const API_BASE = 'http://localhost:3000';
```
To:
```javascript
const API_BASE = '';
```

**Step 2: Update audio URLs to local paths**

Change the `testData` audioUrl values from external URLs to local paths:
- `'5wpm'`: `audioUrl: '/audio/5wpm/test.mp3'`
- `'13wpm'`: `audioUrl: '/audio/13wpm/test.mp3'`
- `'20wpm'`: `audioUrl: '/audio/20wpm/test.mp3'`

**Step 3: Add React render call at end of file**

Add at the end of the file (after the component):
```javascript
// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(KnowCodeExtra));
```

**Step 4: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add frontend/knowcodeextra.jsx && \
git commit -m "feat: update frontend for production (relative URLs, local audio)"
```

---

## Task 7: Create Static Directory Structure

**Files:**
- Create: `/home/jsvana/projects/knowcodeextra.com/static/`
- Create: `/home/jsvana/projects/knowcodeextra.com/static/audio/5wpm/`
- Create: `/home/jsvana/projects/knowcodeextra.com/static/audio/13wpm/`
- Create: `/home/jsvana/projects/knowcodeextra.com/static/audio/20wpm/`
- Create: `/home/jsvana/projects/knowcodeextra.com/static/audio/.gitkeep`

**Step 1: Create directories**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
mkdir -p static/audio/{5wpm,13wpm,20wpm} && \
touch static/audio/.gitkeep
```

**Step 2: Build frontend**

Run: `cd /home/jsvana/projects/knowcodeextra.com/frontend && ./build.sh`
Expected: "Frontend built to ../static/"

**Step 3: Verify static files**

Run: `ls -la /home/jsvana/projects/knowcodeextra.com/static/`
Expected: See `index.html`, `app.js`, `audio/`

**Step 4: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add static/audio/.gitkeep static/index.html && \
git commit -m "feat: add static directory structure and built frontend"
```

---

## Task 8: Create Deploy Directory with Systemd Service

**Files:**
- Create: `/home/jsvana/projects/knowcodeextra.com/deploy/knowcodeextra.service`

**Step 1: Create deploy directory**

Run: `mkdir -p /home/jsvana/projects/knowcodeextra.com/deploy`

**Step 2: Create systemd service file**

Create `deploy/knowcodeextra.service`:
```ini
[Unit]
Description=KnowCodeExtra CW Test API
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/knowcodeextra
ExecStart=/opt/knowcodeextra/knowcodeextra_api
Restart=always
RestartSec=5
Environment=RUST_LOG=knowcodeextra_api=info,tower_http=info
Environment=DATABASE_URL=sqlite:/opt/knowcodeextra/data/knowcodeextra.db
Environment=LISTEN_ADDR=127.0.0.1:3000
Environment=STATIC_DIR=/opt/knowcodeextra/static

[Install]
WantedBy=multi-user.target
```

**Step 3: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add deploy/ && \
git commit -m "feat: add systemd service file"
```

---

## Task 9: Create Nginx Configuration

**Files:**
- Create: `/home/jsvana/projects/knowcodeextra.com/deploy/nginx.conf`

**Step 1: Create nginx config**

Create `deploy/nginx.conf`:
```nginx
# KnowCodeExtra nginx configuration
# Copy to /etc/nginx/sites-available/knowcodeextra.conf
# Then: ln -s /etc/nginx/sites-available/knowcodeextra.conf /etc/nginx/sites-enabled/

server {
    listen 80;
    server_name knowcodeextra.com www.knowcodeextra.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name knowcodeextra.com www.knowcodeextra.com;

    # SSL certificates (use certbot to generate)
    ssl_certificate /etc/letsencrypt/live/knowcodeextra.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/knowcodeextra.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # Proxy to Rust backend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (if needed later)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Cache static assets
    location ~* \.(mp3|js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

**Step 2: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add deploy/nginx.conf && \
git commit -m "feat: add nginx configuration"
```

---

## Task 10: Update .env.example

**Files:**
- Modify: `/home/jsvana/projects/knowcodeextra.com/.env.example`

**Step 1: Add STATIC_DIR variable**

Update `.env.example`:
```bash
# Database connection
DATABASE_URL=sqlite:knowcodeextra.db

# Server address
LISTEN_ADDR=0.0.0.0:3000

# Static files directory
STATIC_DIR=./static

# Logging level
RUST_LOG=knowcodeextra_api=debug,tower_http=debug
```

**Step 2: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add .env.example && \
git commit -m "feat: add STATIC_DIR to environment config"
```

---

## Task 11: Update README

**Files:**
- Modify or Create: `/home/jsvana/projects/knowcodeextra.com/README.md`

**Step 1: Create comprehensive README**

Create `README.md`:
```markdown
# KnowCodeExtra

A web application for taking historic FCC Morse Code examinations. Built with Rust/Axum backend and React frontend.

## Development

### Prerequisites

- Rust 1.70+
- Node.js 18+ (for frontend build)

### Setup

```bash
# Copy environment file
cp .env.example .env

# Build frontend
cd frontend && ./build.sh && cd ..

# Run server
cargo run
```

Visit http://localhost:3000

### Project Structure

```
├── src/main.rs          # Rust server
├── frontend/            # React source
│   ├── knowcodeextra.jsx
│   ├── index.html
│   └── build.sh
├── static/              # Built frontend + audio
│   ├── index.html
│   ├── app.js
│   └── audio/
└── deploy/              # Deployment configs
    ├── knowcodeextra.service
    └── nginx.conf
```

## Deployment

### Build Release

```bash
cargo build --release
cd frontend && ./build.sh && cd ..
```

### VPS Setup

```bash
# Create directories
sudo mkdir -p /opt/knowcodeextra/{static,data}
sudo chown -R www-data:www-data /opt/knowcodeextra

# Copy files
scp target/release/knowcodeextra_api user@vps:/opt/knowcodeextra/
scp -r static/* user@vps:/opt/knowcodeextra/static/

# Install service
sudo cp deploy/knowcodeextra.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now knowcodeextra

# Setup nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/knowcodeextra.conf
sudo ln -s /etc/nginx/sites-available/knowcodeextra.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d knowcodeextra.com
sudo systemctl reload nginx
```

### Updates

```bash
cargo build --release
cd frontend && ./build.sh && cd ..
scp target/release/knowcodeextra_api user@vps:/opt/knowcodeextra/
scp -r static/* user@vps:/opt/knowcodeextra/static/
ssh user@vps "sudo systemctl restart knowcodeextra"
```

## Audio Files

Place MP3 files in `static/audio/{5wpm,13wpm,20wpm}/`. The frontend expects:
- `/audio/5wpm/test.mp3`
- `/audio/13wpm/test.mp3`
- `/audio/20wpm/test.mp3`

## License

MIT
```

**Step 2: Commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add README.md && \
git commit -m "docs: add comprehensive README with deployment instructions"
```

---

## Task 12: Verify Full Build

**Step 1: Clean and rebuild**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
cargo build --release
```
Expected: Compiles successfully

**Step 2: Run server locally**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
cp .env.example .env && \
cargo run
```
Expected: Server starts, shows "Serving static files from ./static"

**Step 3: Test endpoints**

In another terminal:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/
```
Expected: Health returns JSON, root returns index.html

**Step 4: Final commit**

Run:
```bash
cd /home/jsvana/projects/knowcodeextra.com && \
git add -A && \
git status
```
If any uncommitted changes, commit them.

---

## Summary

After completing all tasks, the project will have:

1. **Clean structure** - Rust files at root, no nested `knowcodeextra-api/` directory
2. **Static file serving** - Axum serves frontend from `static/` directory
3. **Frontend build** - Simple esbuild script in `frontend/`
4. **Production config** - Relative API URLs, local audio paths
5. **Deployment files** - systemd service and nginx config
6. **Documentation** - README with full deployment instructions
7. **Git history** - Clean commits for each logical change
