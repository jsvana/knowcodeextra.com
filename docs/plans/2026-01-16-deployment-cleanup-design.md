# KnowCodeExtra Cleanup & Deployment Design

## Overview

Clean up the KnowCodeExtra project and prepare for easy VPS deployment. The Rust backend will serve the React frontend and bundled audio files as a single self-contained binary + static assets.

## Target Environment

- **Deployment:** Static binary on VPS
- **Domain:** https://knowcodeextra.com
- **Reverse proxy:** Nginx (handles HTTPS/TLS termination)
- **Database:** SQLite (file-based, no external dependencies)

## Project Structure

```
knowcodeextra.com/
├── src/
│   └── main.rs              # Server entry point
├── static/                  # Served by Rust app
│   ├── index.html           # Frontend HTML shell
│   ├── app.js               # Bundled React component
│   └── audio/               # MP3 files for tests
│       ├── 5wpm/
│       ├── 13wpm/
│       └── 20wpm/
├── frontend/                # Frontend source (not deployed)
│   ├── index.html
│   ├── knowcodeextra.jsx
│   └── build.sh
├── deploy/
│   ├── knowcodeextra.service   # Systemd unit file
│   └── nginx.conf              # Example nginx config
├── Cargo.toml
├── Cargo.lock
├── .env.example
├── .gitignore
└── README.md
```

## Rust Server Changes

### Static File Serving

Add `ServeDir` from tower-http to serve the `static/` directory:

```rust
let app = Router::new()
    // API routes
    .route("/health", get(health))
    .route("/api/attempts", post(create_attempt).get(list_attempts))
    .route("/api/attempts/:callsign", get(get_attempts_by_callsign))
    .route("/api/leaderboard", get(leaderboard))
    .route("/api/stats", get(stats))
    // Static files with SPA fallback
    .fallback_service(ServeDir::new("static").fallback(ServeFile::new("static/index.html")))
    .layer(cors)
    .layer(TraceLayer::new_for_http())
    .with_state(state);
```

### Configuration

Environment variables:
- `DATABASE_URL` - SQLite connection string (default: `sqlite:knowcodeextra.db`)
- `LISTEN_ADDR` - Bind address (default: `127.0.0.1:3000`)
- `RUST_LOG` - Log level (default: `knowcodeextra_api=info`)
- `STATIC_DIR` - Path to static files (default: `./static`)

### Dependencies

Ensure tower-http has the `fs` feature:
```toml
tower-http = { version = "0.5", features = ["fs", "cors", "trace"] }
```

## Frontend Build

### Build Script (frontend/build.sh)

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"
npx esbuild knowcodeextra.jsx --bundle --outfile=../static/app.js --minify --format=iife --global-name=App
cp index.html ../static/
echo "Frontend built to static/"
```

### HTML Shell (frontend/index.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KnowCodeExtra - CW Code Tests</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
```

### Frontend Changes

Update `knowcodeextra.jsx`:
- Change `API_BASE` from `http://localhost:3000` to `""` (empty string for relative URLs)
- Update audio URLs from external KB6NU links to `/audio/5wpm/...` etc.

## Systemd Service

File: `deploy/knowcodeextra.service`

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

## Nginx Configuration

File: `deploy/nginx.conf`

```nginx
server {
    listen 80;
    server_name knowcodeextra.com www.knowcodeextra.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name knowcodeextra.com www.knowcodeextra.com;

    ssl_certificate /etc/letsencrypt/live/knowcodeextra.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/knowcodeextra.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Audio Files

Download MP3s from KB6NU archive (or provide custom audio) and place in:
```
static/audio/
├── 5wpm/
│   └── extra_5wpm_01.mp3, extra_5wpm_02.mp3, ...
├── 13wpm/
│   └── extra_13wpm_01.mp3, ...
└── 20wpm/
    └── extra_20wpm_01.mp3, ...
```

## VPS Directory Structure

```
/opt/knowcodeextra/
├── knowcodeextra_api     # Compiled binary
├── static/               # Frontend + audio
│   ├── index.html
│   ├── app.js
│   └── audio/
└── data/
    └── knowcodeextra.db  # SQLite database
```

## Deployment Workflow

### Initial Setup (on VPS)

```bash
# Create directories
sudo mkdir -p /opt/knowcodeextra/{static,data}
sudo chown -R www-data:www-data /opt/knowcodeextra

# Install service
sudo cp deploy/knowcodeextra.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable knowcodeextra
```

### Build & Deploy

```bash
# On development machine
cargo build --release
cd frontend && ./build.sh && cd ..

# Copy to VPS
scp target/release/knowcodeextra_api user@vps:/opt/knowcodeextra/
scp -r static/* user@vps:/opt/knowcodeextra/static/

# On VPS
sudo systemctl restart knowcodeextra
sudo systemctl status knowcodeextra
```

### SSL Setup (first time)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d knowcodeextra.com -d www.knowcodeextra.com
```

## Files to Create/Modify

1. **Restructure** - Move files from `knowcodeextra-api/` to project root
2. **src/main.rs** - Add static file serving with STATIC_DIR config
3. **frontend/index.html** - HTML shell for React app
4. **frontend/build.sh** - esbuild script
5. **frontend/knowcodeextra.jsx** - Move and update API URLs
6. **deploy/knowcodeextra.service** - Systemd unit
7. **deploy/nginx.conf** - Example nginx config
8. **.gitignore** - Exclude target/, .env, *.db, node_modules/
9. **README.md** - Update with deployment instructions
