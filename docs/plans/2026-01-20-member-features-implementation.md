# Member Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three features: fix Ham2K PoLo member list MIME type, add welcome email generator, add public roster page.

**Architecture:** Backend changes in Rust (Axum), frontend changes in React JSX. New database table for settings. New API endpoints for roster and email generation.

**Tech Stack:** Rust/Axum, SQLite, React, Tailwind CSS

---

## Task 1: Fix Member List MIME Type

**Files:**
- Modify: `src/admin.rs:791-799` (change emoji)
- Modify: `src/main.rs` (add custom handler and route)

**Step 1: Change emoji in regenerate_polo_notes**

In `src/admin.rs`, find line 795-798 and change the emoji from 🎉 to 📜:

```rust
// Change this line:
        content.push_str(&format!(
            "{} 📜 Know Code Extra #{}\n",
            member.callsign, cert_num
        ));
```

**Step 2: Add custom handler for members.txt**

In `src/main.rs`, add this handler after the existing handlers (around line 1037, before the `main` function):

```rust
/// Serve members.txt with proper UTF-8 charset
async fn get_members_txt(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let file_path = format!("{}/members.txt", state.static_dir);
    let content = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, format!("File not found: {}", e)))?;

    Ok((
        [(axum::http::header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        content,
    ))
}
```

**Step 3: Register the route**

In `src/main.rs`, add the route in the Router (around line 1150, before the fallback):

```rust
        .route("/members.txt", get(get_members_txt))
```

**Step 4: Verify**

Run:
```bash
cargo build && cargo run &
sleep 2
curl -I http://localhost:3000/members.txt | grep -i content-type
curl http://localhost:3000/members.txt | head -5
pkill knowcodeextra
```

Expected: `Content-Type: text/plain; charset=utf-8` and file content with 📜 emoji.

**Step 5: Commit**

```bash
git add src/admin.rs src/main.rs
git commit -m "fix: serve members.txt with UTF-8 charset and update emoji to scroll"
```

---

## Task 2: Add Settings Database Table

**Files:**
- Modify: `src/main.rs` (add table creation in setup_database)

**Step 1: Add settings table creation**

In `src/main.rs`, add this in the `setup_database` function (around line 420, after prosign_mappings table):

```rust
    // Create settings table for key-value storage
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;
```

**Step 2: Verify**

Run:
```bash
cargo build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: add settings table for key-value storage"
```

---

## Task 3: Add Email Template Backend Endpoints

**Files:**
- Modify: `src/admin.rs` (add email template endpoints)

**Step 1: Add request/response types**

In `src/admin.rs`, add these types after the existing types (around line 245):

```rust
#[derive(Debug, Deserialize)]
pub struct EmailTemplateRequest {
    pub template: String,
}

#[derive(Debug, Serialize)]
pub struct EmailTemplateResponse {
    pub template: String,
}

#[derive(Debug, Deserialize)]
pub struct GenerateEmailRequest {
    pub member_id: String,
}

#[derive(Debug, Serialize)]
pub struct GenerateEmailResponse {
    pub email: String,
    pub recipient_email: Option<String>,
}
```

**Step 2: Add get email template endpoint**

In `src/admin.rs`, add this handler:

```rust
/// GET /api/admin/settings/email-template
pub async fn get_email_template(
    State(state): State<Arc<crate::AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let result: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM settings WHERE key = 'email_template'"
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let template = result.map(|r| r.0).unwrap_or_else(|| {
        "Hello {nickname},\n\nCongratulations on passing the Know Code Extra examination!\n\nYour certificate number is #{member_number}.\n\n73,\nKnow Code Extra".to_string()
    });

    Ok(Json(EmailTemplateResponse { template }))
}
```

**Step 3: Add save email template endpoint**

```rust
/// PUT /api/admin/settings/email-template
pub async fn save_email_template(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<EmailTemplateRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('email_template', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .bind(&req.template)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true })))
}
```

**Step 4: Add generate email endpoint**

```rust
/// POST /api/admin/email/generate
pub async fn generate_email(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<GenerateEmailRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Get member info
    #[derive(FromRow)]
    struct MemberInfo {
        callsign: String,
        certificate_number: Option<i32>,
        email: Option<String>,
    }

    let member: MemberInfo = sqlx::query_as(
        "SELECT callsign, certificate_number, email FROM attempts WHERE id = ? AND validation_status = 'approved'"
    )
    .bind(&req.member_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Member not found".to_string()))?;

    // Get template
    let template_result: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM settings WHERE key = 'email_template'"
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let template = template_result.map(|r| r.0).unwrap_or_else(|| {
        "Hello {nickname},\n\nCongratulations on passing the Know Code Extra examination!\n\nYour certificate number is #{member_number}.\n\n73,\nKnow Code Extra".to_string()
    });

    // Get nickname from QRZ if available
    let nickname = if let Some(ref qrz) = state.qrz_client {
        qrz.lookup_name(&member.callsign).await.ok().flatten()
            .unwrap_or_else(|| member.callsign.clone())
    } else {
        member.callsign.clone()
    };

    // Replace placeholders
    let email = template
        .replace("{callsign}", &member.callsign)
        .replace("{member_number}", &member.certificate_number.unwrap_or(0).to_string())
        .replace("{nickname}", &nickname);

    Ok(Json(GenerateEmailResponse {
        email,
        recipient_email: member.email,
    }))
}
```

**Step 5: Verify build**

Run:
```bash
cargo build
```

Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/admin.rs
git commit -m "feat: add email template backend endpoints"
```

---

## Task 4: Register Email Template Routes

**Files:**
- Modify: `src/main.rs` (add routes to admin_api)

**Step 1: Add routes**

In `src/main.rs`, add these routes to the `admin_api` Router (around line 1139):

```rust
        .route("/settings/email-template", get(admin::get_email_template))
        .route("/settings/email-template", axum::routing::put(admin::save_email_template))
        .route("/email/generate", post(admin::generate_email))
```

**Step 2: Verify build**

Run:
```bash
cargo build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/main.rs
git commit -m "feat: register email template routes"
```

---

## Task 5: Add QRZ Name Lookup Helper

**Files:**
- Modify: `src/qrz.rs` (add lookup_name method)

**Step 1: Check existing QRZ client**

First read `src/qrz.rs` to understand the existing structure.

**Step 2: Add lookup_name method**

Add a method similar to `lookup_email` but for the first name. The QRZ XML response contains `<fname>` for first name.

```rust
    pub async fn lookup_name(&self, callsign: &str) -> Result<Option<String>, reqwest::Error> {
        let session_key = self.get_session_key().await?;

        let url = format!(
            "https://xmldata.qrz.com/xml/current/?s={}&callsign={}",
            session_key, callsign
        );

        let response = self.client.get(&url).send().await?.text().await?;

        // Simple XML parsing for fname
        if let Some(start) = response.find("<fname>") {
            if let Some(end) = response[start..].find("</fname>") {
                let name = &response[start + 7..start + end];
                if !name.is_empty() {
                    return Ok(Some(name.to_string()));
                }
            }
        }

        Ok(None)
    }
```

**Step 3: Verify build**

Run:
```bash
cargo build
```

**Step 4: Commit**

```bash
git add src/qrz.rs
git commit -m "feat: add QRZ name lookup helper"
```

---

## Task 6: Add Public Roster API Endpoint

**Files:**
- Modify: `src/main.rs` (add roster endpoint and route)

**Step 1: Add roster response type**

In `src/main.rs`, add this type after the existing types (around line 210):

```rust
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct RosterEntry {
    pub callsign: String,
    pub certificate_number: Option<i32>,
    pub validated_at: Option<DateTime<Utc>>,
}
```

**Step 2: Add roster handler**

Add this handler (around line 840, after get_stats):

```rust
/// GET /api/roster - Public roster of approved members
async fn get_roster(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let entries: Vec<RosterEntry> = sqlx::query_as(
        r#"
        SELECT callsign, certificate_number, validated_at
        FROM attempts
        WHERE validation_status = 'approved'
        ORDER BY certificate_number ASC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(entries))
}
```

**Step 3: Register the route**

Add this route in the public API section (around line 1156):

```rust
        .route("/api/roster", get(get_roster))
```

**Step 4: Verify**

Run:
```bash
cargo build && cargo run &
sleep 2
curl http://localhost:3000/api/roster | head
pkill knowcodeextra
```

Expected: JSON array of members.

**Step 5: Commit**

```bash
git add src/main.rs
git commit -m "feat: add public roster API endpoint"
```

---

## Task 7: Add Email Template UI to Admin Settings

**Files:**
- Modify: `frontend/admin-settings.jsx`

**Step 1: Add EmailTemplateEditor component**

In `frontend/admin-settings.jsx`, add this component before the `AdminSettings` export (around line 238):

```jsx
// Email Template Editor Component
function EmailTemplateEditor() {
  const { adminFetch } = useAdminAuth();
  const [template, setTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const response = await adminFetch(`${API_BASE}/api/admin/settings/email-template`);
        if (!response.ok) throw new Error("Failed to fetch template");
        const data = await response.json();
        setTemplate(data.template);
      } catch (err) {
        setToast({ message: err.message, type: "error" });
      } finally {
        setLoading(false);
      }
    };
    fetchTemplate();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/settings/email-template`, {
        method: "PUT",
        body: JSON.stringify({ template }),
      });
      if (!response.ok) throw new Error("Failed to save template");
      setToast({ message: "Template saved", type: "success" });
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="font-mono text-amber-600">Loading template...</div>;
  }

  return (
    <div className="bg-white border-2 border-amber-300 shadow-sm">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="bg-amber-900 text-amber-50 px-6 py-3">
        <h3 className="font-mono text-sm tracking-widest">EMAIL TEMPLATE</h3>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-2">
            Available placeholders: {"{callsign}"}, {"{member_number}"}, {"{nickname}"}
          </label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={10}
            className="w-full border-2 border-amber-300 px-4 py-3 font-mono text-sm
                     focus:border-amber-500 focus:outline-none resize-y"
            placeholder="Enter your email template..."
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-900 text-amber-50 px-6 py-2 font-mono text-sm
                   hover:bg-amber-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Template"}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Add EmailTemplateEditor to AdminSettings**

In the `AdminSettings` component return, add `<EmailTemplateEditor />` at the end of the `space-y-6` div:

```jsx
  return (
    <div className="space-y-6">
      {/* existing config items div */}
      <div className="bg-white border-2 border-amber-300 shadow-sm">
        {/* ... existing content ... */}
      </div>
      {/* existing note div */}
      <div className="bg-amber-100 border-l-4 border-amber-600 p-4">
        {/* ... existing content ... */}
      </div>

      {/* Add this: */}
      <EmailTemplateEditor />
    </div>
  );
```

**Step 3: Build frontend**

Run:
```bash
cd frontend && ./build.sh
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add frontend/admin-settings.jsx
git commit -m "feat: add email template editor to admin settings"
```

---

## Task 8: Add Generate Email Button to Approved List

**Files:**
- Modify: `frontend/admin-queue.jsx`

**Step 1: Add state and modal for email generation**

In `AdminApproved` component, add these state variables after the existing ones (around line 500):

```jsx
  const [emailModal, setEmailModal] = useState({ isOpen: false, member: null });
  const [generatedEmail, setGeneratedEmail] = useState(null);
  const [generating, setGenerating] = useState(false);
```

**Step 2: Add generateEmail function**

Add this function after the `copyEmail` function:

```jsx
  const generateEmail = async (member) => {
    setEmailModal({ isOpen: true, member });
    setGenerating(true);
    setGeneratedEmail(null);
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/email/generate`, {
        method: "POST",
        body: JSON.stringify({ member_id: member.id }),
      });
      if (!response.ok) throw new Error("Failed to generate email");
      const data = await response.json();
      setGeneratedEmail(data);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
      setEmailModal({ isOpen: false, member: null });
    } finally {
      setGenerating(false);
    }
  };

  const copyGeneratedEmail = () => {
    if (generatedEmail) {
      navigator.clipboard.writeText(generatedEmail.email);
      setToast({ message: "Email copied to clipboard", type: "success" });
    }
  };
```

**Step 3: Add email button to table row**

In the table, add a new column header after "REACHED OUT":

```jsx
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">
                  ACTIONS
                </th>
```

And add the button in the corresponding table cell:

```jsx
                    <td className="px-4 py-3">
                      <button
                        onClick={() => generateEmail(item)}
                        className="text-xs bg-amber-600 text-white px-2 py-1 hover:bg-amber-700"
                      >
                        Email
                      </button>
                    </td>
```

**Step 4: Add email modal**

Add this modal before the closing `</div>` of the component:

```jsx
      {/* Email Generation Modal */}
      {emailModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEmailModal({ isOpen: false, member: null })}
          />
          <div className="relative bg-white border-2 border-amber-300 shadow-xl max-w-2xl w-full p-6">
            <h3 className="font-mono text-lg text-amber-900 mb-4">
              Generate Email for {emailModal.member?.callsign}
            </h3>
            {generating ? (
              <div className="font-mono text-amber-600 py-8 text-center">
                Generating...
              </div>
            ) : generatedEmail ? (
              <div className="space-y-4">
                {generatedEmail.recipient_email && (
                  <div>
                    <label className="font-mono text-xs text-amber-600 block mb-1">
                      RECIPIENT
                    </label>
                    <div className="font-mono text-amber-900">
                      {generatedEmail.recipient_email}
                    </div>
                  </div>
                )}
                <div>
                  <label className="font-mono text-xs text-amber-600 block mb-1">
                    EMAIL BODY
                  </label>
                  <pre className="bg-amber-50 border border-amber-200 p-4 font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {generatedEmail.email}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={copyGeneratedEmail}
                    className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800"
                  >
                    Copy to Clipboard
                  </button>
                  <button
                    onClick={() => setEmailModal({ isOpen: false, member: null })}
                    className="border-2 border-amber-300 px-4 py-2 font-mono text-sm hover:bg-amber-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
```

**Step 5: Update colspan in empty/loading states**

Update the `colSpan` values from 6 to 7 in the loading and empty states.

**Step 6: Build frontend**

Run:
```bash
cd frontend && ./build.sh
```

**Step 7: Commit**

```bash
git add frontend/admin-queue.jsx
git commit -m "feat: add generate email button to approved list"
```

---

## Task 9: Add Public Roster Page

**Files:**
- Modify: `frontend/app.jsx`

**Step 1: Add roster view state handling**

The `App` component already has a `view` state. Add "roster" as a possible view.

**Step 2: Add fetchRoster function**

Add this function after the existing fetch functions (around line 125):

```jsx
  const [roster, setRoster] = useState([]);

  const fetchRoster = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/roster`);
      if (response.ok) {
        const data = await response.json();
        setRoster(data);
      }
    } catch (error) {
      console.error("Failed to fetch roster:", error);
    }
  };
```

**Step 3: Add roster page view**

Add this view block before the final `return null;` (around line 1283):

```jsx
  // Roster Page
  if (view === "roster") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-8 py-10 md:px-12">
            <button
              onClick={() => setView("home")}
              className="font-mono text-sm text-amber-700 hover:text-amber-900 mb-8 flex items-center gap-2 font-medium"
            >
              {"\u2190"} RETURN HOME
            </button>

            <h1
              className="font-serif text-4xl font-bold text-amber-900 mb-2 text-center drop-shadow-sm"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                textShadow: "1px 1px 3px rgba(120, 53, 15, 0.1)",
              }}
            >
              Member Roster
            </h1>
            <p className="text-center text-amber-700 mb-8 font-serif italic">
              Certified Know Code Extra members
            </p>

            {/* Roster Table */}
            <div className="bg-white border-2 border-amber-300 shadow-md overflow-hidden">
              <div className="bg-amber-900 text-amber-50 px-6 py-3">
                <div className="grid grid-cols-12 gap-4 font-mono text-xs tracking-widest">
                  <div className="col-span-2">#</div>
                  <div className="col-span-4">CALLSIGN</div>
                  <div className="col-span-3 text-center">CERT #</div>
                  <div className="col-span-3 text-center">DATE</div>
                </div>
              </div>

              {roster.length === 0 ? (
                <div className="px-6 py-12 text-center text-amber-600 font-serif italic">
                  No members yet. Be the first!
                </div>
              ) : (
                <div className="divide-y divide-amber-200">
                  {roster.map((entry, index) => (
                    <div key={entry.callsign} className="px-6 py-4">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2 font-mono text-amber-600">
                          {index + 1}
                        </div>
                        <div className="col-span-4 font-mono text-lg font-bold text-amber-900">
                          {entry.callsign}
                        </div>
                        <div className="col-span-3 text-center">
                          <span className="inline-block bg-amber-100 border border-amber-300 px-3 py-1 font-mono text-amber-800">
                            #{entry.certificate_number}
                          </span>
                        </div>
                        <div className="col-span-3 text-center font-mono text-sm text-amber-700">
                          {entry.validated_at
                            ? new Date(entry.validated_at).toLocaleDateString()
                            : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={() => {
                  fetchLeaderboard();
                  fetchStats();
                  setView("leaderboard");
                }}
                className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
              >
                VIEW LEADERBOARD
              </button>
              <button
                onClick={() => setView("select")}
                className="bg-amber-900 text-amber-50 px-6 py-3 font-mono tracking-widest hover:bg-amber-800"
              >
                TAKE THE TEST
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
```

**Step 4: Add roster link to home page**

In the home page view, find the "VIEW LEADERBOARD" button (around line 457) and add a roster link next to it:

```jsx
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => {
                    fetchLeaderboard();
                    fetchStats();
                    setView("leaderboard");
                  }}
                  className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
                >
                  VIEW LEADERBOARD
                </button>
                <button
                  onClick={() => {
                    fetchRoster();
                    setView("roster");
                  }}
                  className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
                >
                  VIEW ROSTER
                </button>
              </div>
```

**Step 5: Add roster link to leaderboard page**

In the leaderboard view, add a link to the roster (around line 1277, after the TAKE THE TEST button):

```jsx
              <button
                onClick={() => {
                  fetchRoster();
                  setView("roster");
                }}
                className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
              >
                VIEW ROSTER
              </button>
```

**Step 6: Build frontend**

Run:
```bash
cd frontend && ./build.sh
```

**Step 7: Commit**

```bash
git add frontend/app.jsx
git commit -m "feat: add public roster page"
```

---

## Task 10: Final Verification and Build

**Step 1: Full build**

Run:
```bash
cargo build --release
cd frontend && ./build.sh
```

**Step 2: Manual testing checklist**

- [ ] Visit `/members.txt` - should show UTF-8 emoji and correct Content-Type header
- [ ] Visit home page - should show "VIEW ROSTER" link
- [ ] Click roster - should show member list
- [ ] Admin: Settings page - should show email template editor
- [ ] Admin: Approved list - should have "Email" button per row
- [ ] Admin: Click Email button - should show modal with generated email

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final build for member features"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Fix member list MIME type and emoji |
| 2 | Add settings database table |
| 3 | Add email template backend endpoints |
| 4 | Register email template routes |
| 5 | Add QRZ name lookup helper |
| 6 | Add public roster API endpoint |
| 7 | Add email template UI to admin settings |
| 8 | Add generate email button to approved list |
| 9 | Add public roster page |
| 10 | Final verification and build |
