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
├── config.toml          # Configuration file
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

## Configuration

The server is configured via `config.toml`. All settings can also be overridden via environment variables.

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `database_url` | `KNOWCODE_DATABASE_URL` or `DATABASE_URL` | `sqlite:knowcodeextra.db` | SQLite database path |
| `listen_addr` | `KNOWCODE_LISTEN_ADDR` or `LISTEN_ADDR` | `0.0.0.0:3000` | Server bind address |
| `static_dir` | `KNOWCODE_STATIC_DIR` or `STATIC_DIR` | `./static` | Static files directory |
| `log_level` | `KNOWCODE_LOG_LEVEL` or `RUST_LOG` | `knowcodeextra=info,tower_http=info` | Log level filter |

Config file location can be changed with `CONFIG_FILE` env var.

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
scp target/release/knowcodeextra user@vps:/opt/knowcodeextra/
scp deploy/config.toml user@vps:/opt/knowcodeextra/
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
scp target/release/knowcodeextra user@vps:/opt/knowcodeextra/
scp -r static/* user@vps:/opt/knowcodeextra/static/
ssh user@vps "sudo systemctl restart knowcodeextra"
```

## Audio Files

Place the test MP3 file in `static/audio/20wpm/test.mp3`.

## License

MIT
