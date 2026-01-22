/// Send a notification via ntfy when a test attempt is submitted
pub async fn send_attempt_notification(
    ntfy_url: &str,
    ntfy_topic: &str,
    ntfy_username: &str,
    ntfy_password: &str,
    callsign: &str,
    passed: bool,
) {
    let status = if passed { "PASSED" } else { "FAILED" };
    let body = format!("{} submitted - {}", callsign, status);

    let url = format!("{}/{}", ntfy_url.trim_end_matches('/'), ntfy_topic);

    let client = reqwest::Client::new();
    let result = client
        .post(&url)
        .basic_auth(ntfy_username, Some(ntfy_password))
        .header("Title", "KnowCodeExtra")
        .body(body)
        .send()
        .await;

    match result {
        Ok(response) => {
            if !response.status().is_success() {
                tracing::warn!(
                    "ntfy notification failed with status {}: {}",
                    response.status(),
                    ntfy_topic
                );
            }
        }
        Err(e) => {
            tracing::warn!("ntfy notification request failed: {}", e);
        }
    }
}
