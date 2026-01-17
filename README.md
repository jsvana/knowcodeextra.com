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
scp target/release/knowcodeextra user@vps:/opt/knowcodeextra/
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

Place MP3 files in `static/audio/{5wpm,13wpm,20wpm}/`. The frontend expects:
- `/audio/5wpm/test.mp3`
- `/audio/13wpm/test.mp3`
- `/audio/20wpm/test.mp3`

## License

MIT
