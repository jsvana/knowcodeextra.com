# Ntfy Notifications for Test Attempts

## Overview

Add push notifications via ntfy when users submit test attempts. Notifications are sent for all attempts (pass or fail).

## Configuration

Environment variables:
- `KNOWCODE_NTFY_URL` - ntfy server URL (e.g., `https://ntfy.example.com`)
- `KNOWCODE_NTFY_TOPIC` - topic name to publish to
- `KNOWCODE_NTFY_USERNAME` - username for basic auth
- `KNOWCODE_NTFY_PASSWORD` - password for basic auth

All four must be set for notifications to be enabled.

## Notification Format

- **Title:** KnowCodeExtra
- **Body:** `{CALLSIGN} submitted - PASSED` or `{CALLSIGN} submitted - FAILED`
- **Priority:** default (3)

## Implementation

### 1. Config Changes

Add to `Config` struct:
```rust
pub ntfy_url: Option<String>,
pub ntfy_topic: Option<String>,
pub ntfy_username: Option<String>,
pub ntfy_password: Option<String>,
```

### 2. AppState Changes

Add same fields to `AppState` struct.

### 3. Module: `src/notify.rs`

```rust
pub async fn send_attempt_notification(
    ntfy_url: &str,
    ntfy_topic: &str,
    ntfy_username: &str,
    ntfy_password: &str,
    callsign: &str,
    passed: bool,
)
```

- POST to `{ntfy_url}/{topic}` with basic auth
- Errors logged but don't fail the request
- Uses reqwest for HTTP

### 4. Integration

Call notification in:
- `create_attempt` handler - after DB insert
- `submit_test` handler - after DB insert

Both use `tokio::spawn` to avoid adding latency to the response.
Only sends if all four config values are present.

## Ansible Configuration

### ntfy role
- Add `ntfy_knowcodeextra_password` to vault
- Create `knowcodeextra` user with write access to `knowcodeextra` topic
- Give `jsvana` read access to `knowcodeextra` topic

### knowcodeextra role
- Add ntfy env vars to `knowcodeextra.env.j2`
- Reference `ntfy_knowcodeextra_password` from vault

## Usage

1. Set ntfy password in ansible vault
2. Deploy ntfy role (creates user/topic)
3. Deploy knowcodeextra role (configures env vars)
4. Subscribe to `knowcodeextra` topic in ntfy app
