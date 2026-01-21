# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Run development server
cargo run

# Build release binary
cargo build --release

# Build frontend (outputs to static/)
cd frontend && ./build.sh

# Check Rust code compiles
cargo check
```

## Architecture

**Backend:** Single Rust binary using Axum that serves both the API and static files. SQLite database with auto-creation on first run.

**Frontend:** React JSX bundled with esbuild. Uses CDN-loaded React via shim files (`react-shim.js`, `react-dom-shim.js`) that re-export the global `window.React` and `window.ReactDOM`.

**Key files:**
- `src/main.rs` - All backend code: config loading, database setup, API handlers, static file serving
- `frontend/knowcodeextra.jsx` - Single-file React app with all components
- `frontend/build.sh` - esbuild bundling script
- `config.toml` - Server configuration (database_url, listen_addr, static_dir, log_level)

**API endpoints:**
- `POST /api/attempts` - Record test attempt
- `GET /api/attempts` - List attempts (with filtering)
- `GET /api/attempts/:callsign` - Get attempts for callsign
- `GET /api/leaderboard` - Ranked operators
- `GET /api/stats` - Aggregate statistics
- `GET /health` - Health check

**Static file serving:** Axum serves `static/` directory with SPA fallback to `index.html`.

## Configuration

Config loads in order (later overrides earlier):
1. Built-in defaults
2. `config.toml` (or path in `CONFIG_FILE` env var)
3. `KNOWCODE_*` prefixed env vars
4. Legacy env vars (`DATABASE_URL`, `LISTEN_ADDR`, `STATIC_DIR`, `RUST_LOG`)

## Audio Files

Test audio files go in `static/audio/20wpm/test.mp3`. These are not included in the repo.

## Release

The application is built and released by tagging a version on GitHub and then updating a SHA256 sum in a local Ansible repository. Ask the user for the repository details.
