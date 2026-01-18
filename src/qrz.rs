use std::sync::Arc;
use tokio::sync::RwLock;

/// QRZ API client with session caching
#[derive(Clone)]
pub struct QrzClient {
    username: String,
    password: String,
    http: reqwest::Client,
    session_key: Arc<RwLock<Option<String>>>,
}

impl QrzClient {
    pub fn new(username: String, password: String) -> Self {
        Self {
            username,
            password,
            http: reqwest::Client::new(),
            session_key: Arc::new(RwLock::new(None)),
        }
    }

    /// Login to QRZ and get session key
    async fn login(&self) -> Result<String, String> {
        let url = format!(
            "https://xmldata.qrz.com/xml/current/?username={}&password={}",
            self.username, self.password
        );

        let response = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("QRZ login request failed: {}", e))?;

        let text = response
            .text()
            .await
            .map_err(|e| format!("QRZ login response read failed: {}", e))?;

        Self::extract_session_key(&text)
    }

    fn extract_session_key(xml: &str) -> Result<String, String> {
        if let Some(start) = xml.find("<Key>") {
            if let Some(end) = xml.find("</Key>") {
                let key = &xml[start + 5..end];
                return Ok(key.to_string());
            }
        }

        if xml.contains("<Error>") {
            if let Some(start) = xml.find("<Error>") {
                if let Some(end) = xml.find("</Error>") {
                    let error = &xml[start + 7..end];
                    return Err(format!("QRZ error: {}", error));
                }
            }
        }

        Err("Could not parse QRZ session key".to_string())
    }

    async fn get_session_key(&self) -> Result<String, String> {
        {
            let cached = self.session_key.read().await;
            if let Some(ref key) = *cached {
                return Ok(key.clone());
            }
        }

        let key = self.login().await?;

        {
            let mut cached = self.session_key.write().await;
            *cached = Some(key.clone());
        }

        Ok(key)
    }

    async fn clear_session(&self) {
        let mut cached = self.session_key.write().await;
        *cached = None;
    }

    /// Lookup callsign and return email if found
    pub async fn lookup_email(&self, callsign: &str) -> Result<Option<String>, String> {
        let session_key = self.get_session_key().await?;

        let url = format!(
            "https://xmldata.qrz.com/xml/current/?s={}&callsign={}",
            session_key, callsign
        );

        let response = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("QRZ lookup request failed: {}", e))?;

        let text = response
            .text()
            .await
            .map_err(|e| format!("QRZ lookup response read failed: {}", e))?;

        if text.contains("Session Timeout") || text.contains("Invalid session key") {
            self.clear_session().await;
            return Box::pin(self.lookup_email(callsign)).await;
        }

        Ok(Self::extract_email(&text))
    }

    fn extract_email(xml: &str) -> Option<String> {
        if let Some(start) = xml.find("<email>") {
            if let Some(end) = xml.find("</email>") {
                let email = &xml[start + 7..end];
                if !email.is_empty() {
                    return Some(email.to_string());
                }
            }
        }
        None
    }
}

/// Create QRZ client from environment variables, returns None if not configured
pub fn create_client_from_env() -> Option<QrzClient> {
    let username = std::env::var("QRZ_USERNAME").ok()?;
    let password = std::env::var("QRZ_PASSWORD").ok()?;

    if username.is_empty() || password.is_empty() {
        return None;
    }

    Some(QrzClient::new(username, password))
}
