# Ntfy.sh Notifications for Test Attempts

## Overview

Add push notifications via ntfy.sh when users submit test attempts. Notifications are sent for all attempts (pass or fail).

## Configuration

- Environment variable: `KNOWCODE_NTFY_TOPIC`
- When unset, notifications are disabled (silent no-op)

## Notification Format

- **Title:** KnowCodeExtra
- **Body:** `{CALLSIGN} submitted - PASSED` or `{CALLSIGN} submitted - FAILED`
- **Priority:** default (3)

## Implementation

### 1. Config Changes

Add to `Config` struct:
```rust
pub ntfy_topic: Option<String>,
```

Load from `KNOWCODE_NTFY_TOPIC` env var.

### 2. AppState Changes

Add to `AppState` struct:
```rust
pub ntfy_topic: Option<String>,
```

### 3. New Module: `src/notify.rs`

```rust
pub async fn send_attempt_notification(
    ntfy_topic: &str,
    callsign: &str,
    passed: bool,
)
```

- POST to `https://ntfy.sh/{topic}`
- Errors logged but don't fail the request
- Uses reqwest for HTTP

### 4. Integration

Call notification in:
- `create_attempt` handler - after DB insert
- `submit_test` handler - after DB insert

Both use `tokio::spawn` to avoid adding latency to the response.

## Usage

1. Set `KNOWCODE_NTFY_TOPIC=knowcodeextra-alerts` (or any topic name)
2. Subscribe to `knowcodeextra-alerts` in ntfy app on phone/desktop
3. Receive notifications when users submit attempts
