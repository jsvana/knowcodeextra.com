// certificate.rs
// Add this module to your Axum API for server-side certificate generation
//
// Add to Cargo.toml:
//   [dependencies]
//   # ... existing deps ...
//   
// Add route in main.rs:
//   mod certificate;
//   .route("/api/certificate/:attempt_id", get(certificate::get_certificate_svg))

use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
};
use std::sync::Arc;

/// SVG template with placeholders - emphasizes "Know-Code" status
const CERTIFICATE_TEMPLATE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="parchment" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FEF3C7"/>
      <stop offset="50%" style="stop-color:#FFFBEB"/>
      <stop offset="100%" style="stop-color:#FDE68A"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#B45309"/>
      <stop offset="50%" style="stop-color:#D97706"/>
      <stop offset="100%" style="stop-color:#92400E"/>
    </linearGradient>
    <radialGradient id="sealGradient" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#DC2626"/>
      <stop offset="70%" style="stop-color:#991B1B"/>
      <stop offset="100%" style="stop-color:#7F1D1D"/>
    </radialGradient>
    <linearGradient id="badgeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#78350F"/>
      <stop offset="50%" style="stop-color:#92400E"/>
      <stop offset="100%" style="stop-color:#78350F"/>
    </linearGradient>
    <pattern id="noisePattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
      <circle cx="25" cy="25" r="0.5" fill="#92400E" opacity="0.03"/>
      <circle cx="75" cy="75" r="0.5" fill="#92400E" opacity="0.03"/>
      <circle cx="50" cy="10" r="0.5" fill="#92400E" opacity="0.02"/>
      <circle cx="10" cy="60" r="0.5" fill="#92400E" opacity="0.02"/>
      <circle cx="90" cy="40" r="0.5" fill="#92400E" opacity="0.02"/>
    </pattern>
  </defs>
  
  <rect width="800" height="600" fill="url(#parchment)"/>
  <rect width="800" height="600" fill="url(#noisePattern)"/>
  
  <rect x="20" y="20" width="760" height="560" fill="none" stroke="#92400E" stroke-width="3"/>
  <rect x="28" y="28" width="744" height="544" fill="none" stroke="#B45309" stroke-width="1"/>
  <rect x="40" y="40" width="720" height="520" fill="none" stroke="#92400E" stroke-width="2"/>
  <rect x="46" y="46" width="708" height="508" fill="none" stroke="#D97706" stroke-width="1" stroke-dasharray="4,2"/>
  
  <g fill="none" stroke="#92400E" stroke-width="2">
    <path d="M60,80 L60,60 L80,60"/><path d="M65,85 L65,65 L85,65"/><circle cx="60" cy="60" r="3" fill="#92400E"/>
    <path d="M740,80 L740,60 L720,60"/><path d="M735,85 L735,65 L715,65"/><circle cx="740" cy="60" r="3" fill="#92400E"/>
    <path d="M60,520 L60,540 L80,540"/><path d="M65,515 L65,535 L85,535"/><circle cx="60" cy="540" r="3" fill="#92400E"/>
    <path d="M740,520 L740,540 L720,540"/><path d="M735,515 L735,535 L715,535"/><circle cx="740" cy="540" r="3" fill="#92400E"/>
  </g>
  
  <g transform="translate(400, 70)">
    <ellipse cx="0" cy="20" rx="30" ry="5" fill="#92400E" opacity="0.3"/>
    <rect x="-25" y="8" width="50" height="8" rx="2" fill="#78350F"/>
    <rect x="-5" y="-5" width="10" height="15" rx="1" fill="#78350F"/>
    <circle cx="0" cy="-10" r="6" fill="#92400E"/>
    <rect x="-30" y="12" width="60" height="3" rx="1" fill="#78350F" opacity="0.6"/>
  </g>
  
  <text x="400" y="115" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="bold" fill="#78350F" letter-spacing="3">CERTIFICATE</text>
  <text x="400" y="138" text-anchor="middle" font-family="monospace" font-size="11" fill="#92400E" letter-spacing="5">OF MORSE CODE PROFICIENCY</text>
  
  <line x1="200" y1="152" x2="600" y2="152" stroke="url(#gold)" stroke-width="2"/>
  <circle cx="200" cy="152" r="3" fill="#92400E"/>
  <circle cx="400" cy="152" r="4" fill="#B45309"/>
  <circle cx="600" cy="152" r="3" fill="#92400E"/>
  
  <text x="400" y="182" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#78350F" font-style="italic">This is to certify that</text>
  
  <text x="400" y="222" text-anchor="middle" font-family="monospace" font-size="44" font-weight="bold" fill="#78350F" letter-spacing="5">{{CALLSIGN}}</text>
  <line x1="250" y1="232" x2="550" y2="232" stroke="#D97706" stroke-width="2"/>
  
  <text x="400" y="262" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#78350F">has demonstrated proficiency in International Morse Code</text>
  <text x="400" y="282" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#78350F">at a speed of <tspan font-weight="bold" font-size="18">20 WPM</tspan> and is hereby recognized as a</text>
  
  <g transform="translate(400, 340)">
    <rect x="-180" y="-35" width="360" height="70" fill="url(#badgeGradient)" rx="4"/>
    <rect x="-176" y="-31" width="352" height="62" fill="none" stroke="#D97706" stroke-width="1" rx="2"/>
    <path d="M-170,-25 L-160,-25 L-160,-15" fill="none" stroke="#FDE68A" stroke-width="1.5"/>
    <path d="M170,-25 L160,-25 L160,-15" fill="none" stroke="#FDE68A" stroke-width="1.5"/>
    <path d="M-170,25 L-160,25 L-160,15" fill="none" stroke="#FDE68A" stroke-width="1.5"/>
    <path d="M170,25 L160,25 L160,15" fill="none" stroke="#FDE68A" stroke-width="1.5"/>
    <text x="-150" y="8" text-anchor="middle" font-size="18" fill="#FDE68A">★</text>
    <text x="150" y="8" text-anchor="middle" font-size="18" fill="#FDE68A">★</text>
    <text x="0" y="8" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="bold" fill="#FFFBEB" letter-spacing="3">KNOW-CODE</text>
    <text x="0" y="28" text-anchor="middle" font-family="monospace" font-size="14" fill="#FDE68A" letter-spacing="8">EXTRA</text>
  </g>
  
  <text x="400" y="395" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="#78350F" font-style="italic">"Proving the code lives on"</text>
  
  <g transform="translate(400, 418)">
    <circle cx="-40" cy="0" r="2" fill="#92400E"/>
    <rect x="-35" y="-1" width="10" height="2" fill="#92400E"/>
    <circle cx="-20" cy="0" r="2" fill="#92400E"/>
    <rect x="-15" y="-1" width="30" height="2" fill="#92400E"/>
    <circle cx="20" cy="0" r="2" fill="#92400E"/>
    <rect x="25" y="-1" width="10" height="2" fill="#92400E"/>
    <circle cx="40" cy="0" r="2" fill="#92400E"/>
  </g>
  
  <g transform="translate(0, 450)">
    <text x="150" y="0" text-anchor="middle" font-family="monospace" font-size="10" fill="#92400E" letter-spacing="2">DATE ISSUED</text>
    <text x="150" y="20" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#78350F">{{DATE}}</text>
    <line x1="80" y1="25" x2="220" y2="25" stroke="#D97706" stroke-width="1"/>
    
    <g transform="translate(400, 15)">
      <circle cx="0" cy="0" r="35" fill="url(#sealGradient)" stroke="#7F1D1D" stroke-width="2"/>
      <circle cx="0" cy="0" r="28" fill="none" stroke="#FCA5A5" stroke-width="1" opacity="0.5"/>
      <circle cx="0" cy="0" r="22" fill="none" stroke="#FCA5A5" stroke-width="1" opacity="0.3"/>
      <text x="0" y="-2" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#FEE2E2">KNOW</text>
      <text x="0" y="10" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#FEE2E2">CODE</text>
      <text x="0" y="-18" text-anchor="middle" font-size="8" fill="#FCA5A5">★</text>
      <text x="16" y="-10" text-anchor="middle" font-size="6" fill="#FCA5A5">★</text>
      <text x="-16" y="-10" text-anchor="middle" font-size="6" fill="#FCA5A5">★</text>
    </g>
    
    <text x="650" y="0" text-anchor="middle" font-family="monospace" font-size="10" fill="#92400E" letter-spacing="2">CERTIFICATE NO.</text>
    <text x="650" y="20" text-anchor="middle" font-family="monospace" font-size="12" fill="#78350F">{{CERT_NO}}</text>
    <line x1="580" y1="25" x2="720" y2="25" stroke="#D97706" stroke-width="1"/>
  </g>
  
  <text x="400" y="515" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="#92400E" font-style="italic">Historical examination courtesy of WB4WXD &amp; KB6NU</text>
  <text x="400" y="530" text-anchor="middle" font-family="Georgia, serif" font-size="8" fill="#92400E" opacity="0.7">This certificate is based on the honor system and is not an official FCC document</text>
  <a href="https://knowcodeextra.com" target="_blank"><text x="400" y="548" text-anchor="middle" font-family="monospace" font-size="10" fill="#B45309" text-decoration="underline">KNOWCODEEXTRA.COM</text></a>
  <text x="400" y="565" text-anchor="middle" font-family="monospace" font-size="9" fill="#D97706" opacity="0.5">−·−· ·−−·   ·−·−·   ···−·−</text>
</svg>"##;

/// Certificate data for generation (20 WPM Extra only)
pub struct CertificateData {
    pub callsign: String,
    pub date: String,
    pub cert_no: String,
}

impl CertificateData {
    /// Create certificate data from an attempt
    pub fn from_attempt(callsign: &str, cert_no: &str, date: &str) -> Self {
        Self {
            callsign: callsign.to_uppercase(),
            date: date.to_string(),
            cert_no: cert_no.to_string(),
        }
    }

    /// Generate the SVG certificate
    pub fn to_svg(&self) -> String {
        CERTIFICATE_TEMPLATE
            .replace("{{CALLSIGN}}", &self.callsign)
            .replace("{{DATE}}", &self.date)
            .replace("{{CERT_NO}}", &self.cert_no)
    }
}

/// Handler to get certificate SVG for a passing attempt
pub async fn get_certificate_svg(
    State(state): State<Arc<crate::AppState>>,
    Path(attempt_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Fetch the attempt from database - requires approved status
    let attempt: Option<crate::Attempt> = sqlx::query_as(
        "SELECT id, callsign, test_speed, questions_correct, copy_chars, passed, created_at,
                validation_status, certificate_number, validated_at, admin_note
         FROM attempts WHERE id = ? AND passed = true AND validation_status = 'approved'"
    )
    .bind(&attempt_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let attempt = attempt.ok_or((
        StatusCode::NOT_FOUND,
        "Certificate not available. Attempt may be pending approval or not passed.".to_string()
    ))?;

    // Use the assigned certificate number from database
    let cert_no = match attempt.certificate_number {
        Some(num) => format!("#{}", num),
        None => return Err((
            StatusCode::NOT_FOUND,
            "Certificate number not yet assigned".to_string()
        )),
    };

    // Format date
    let date = attempt.created_at.format("%B %d, %Y").to_string();

    // Generate SVG
    let cert_data = CertificateData::from_attempt(
        &attempt.callsign,
        &cert_no,
        &date,
    );

    let svg = cert_data.to_svg();

    Ok((
        [(header::CONTENT_TYPE, "image/svg+xml")],
        svg
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_certificate_generation() {
        let cert = CertificateData::from_attempt("W6JSV", "20WPM-ABC123", "January 17, 2025");
        let svg = cert.to_svg();

        assert!(svg.contains("W6JSV"));
        assert!(svg.contains("20 WPM"));
        assert!(svg.contains("KNOW-CODE"));
        assert!(svg.contains("EXTRA"));
        assert!(svg.contains("January 17, 2025"));
        assert!(svg.contains("20WPM-ABC123"));
        assert!(svg.contains("Proving the code lives on"));
    }
}
