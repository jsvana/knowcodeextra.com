import React, { useState, useEffect } from "react";
import { API_BASE } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";
import { Toast } from "./admin-layout.jsx";

export function AdminSearch() {
  const { adminFetch } = useAdminAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/search?q=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (attemptId) => {
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/queue/${attemptId}/approve`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("Failed to approve");
      const data = await response.json();
      setToast({
        message: `Approved - Certificate #${data.certificate_number}`,
        type: "success",
      });
      // Refresh search results
      handleSearch({ preventDefault: () => {} });
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleReject = async (attemptId) => {
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/queue/${attemptId}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ note: null }),
        },
      );
      if (!response.ok) throw new Error("Failed to reject");
      setToast({ message: "Rejected", type: "success" });
      handleSearch({ preventDefault: () => {} });
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  // Group results by callsign
  const grouped = results.reduce((acc, item) => {
    if (!acc[item.callsign]) acc[item.callsign] = [];
    acc[item.callsign].push(item);
    return acc;
  }, {});

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Search Form */}
      <form
        onSubmit={handleSearch}
        className="bg-white border-2 border-amber-300 p-6 mb-6"
      >
        <div className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            className="flex-1 border-2 border-amber-300 px-4 py-3 font-mono uppercase
                     focus:border-amber-500 focus:outline-none"
            placeholder="Search by callsign (e.g., W1AW or W1)"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-amber-900 text-amber-50 px-6 py-3 font-mono tracking-widest
                     hover:bg-amber-800 disabled:opacity-50"
          >
            {loading ? "..." : "SEARCH"}
          </button>
        </div>
        <p className="font-mono text-xs text-amber-600 mt-2">
          Supports partial matches (e.g., "W1" finds all W1* callsigns)
        </p>
      </form>

      {/* Results */}
      {searched && (
        <div className="bg-white border-2 border-amber-300 shadow-sm">
          <div className="bg-amber-900 text-amber-50 px-6 py-3">
            <h3 className="font-mono text-sm tracking-widest">
              SEARCH RESULTS ({results.length})
            </h3>
          </div>

          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-serif text-amber-800 mb-2">
                No attempts found for "{query}"
              </p>
              <p className="font-mono text-sm text-amber-600">
                Try a partial callsign or check spelling
              </p>
            </div>
          ) : (
            <div className="divide-y divide-amber-200">
              {Object.entries(grouped).map(([callsign, attempts]) => (
                <div key={callsign} className="px-6 py-4">
                  <h4 className="font-mono text-lg font-bold text-amber-900 mb-3">
                    {callsign}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full font-mono text-sm">
                      <thead>
                        <tr className="text-amber-600 text-left border-b border-amber-200">
                          <th className="pr-4 pb-2">Date</th>
                          <th className="pr-4 pb-2">Score</th>
                          <th className="pr-4 pb-2">Copy</th>
                          <th className="pr-4 pb-2">Passed</th>
                          <th className="pr-4 pb-2">Status</th>
                          <th className="pr-4 pb-2">Cert #</th>
                          <th className="pb-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attempts.map((item) => (
                          <tr key={item.id} className="text-amber-800">
                            <td className="pr-4 py-2">
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                            <td className="pr-4">
                              {item.questions_correct}/10
                            </td>
                            <td className="pr-4">{item.copy_chars}</td>
                            <td className="pr-4">
                              {item.passed ? "Yes" : "No"}
                            </td>
                            <td className="pr-4">
                              <span
                                className={`text-xs px-2 py-0.5 ${
                                  item.validation_status === "approved"
                                    ? "bg-green-100 text-green-800"
                                    : item.validation_status === "rejected"
                                      ? "bg-red-100 text-red-800"
                                      : item.validation_status === "pending"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {item.validation_status || "—"}
                              </span>
                            </td>
                            <td className="pr-4">
                              {item.certificate_number ? (
                                <a
                                  href={`/api/certificate/${item.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-600 hover:text-amber-800 underline"
                                >
                                  #{item.certificate_number}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {item.validation_status === "pending" && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleApprove(item.id)}
                                    className="text-xs bg-green-600 text-white px-2 py-1 hover:bg-green-700"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(item.id)}
                                    className="text-xs bg-red-600 text-white px-2 py-1 hover:bg-red-700"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {item.admin_note && (
                                <span
                                  className="text-xs text-amber-600 ml-2"
                                  title={item.admin_note}
                                >
                                  [note]
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Email Template Editor Component
function EmailTemplateEditor() {
  const { adminFetch } = useAdminAuth();
  const [subject, setSubject] = useState("");
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
        setSubject(data.subject || "");
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
        body: JSON.stringify({ subject, template }),
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
        <p className="font-mono text-xs text-amber-700">
          Available placeholders: {"{callsign}"}, {"{member_number}"}, {"{nickname}"}
        </p>
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-2">
            Subject Line
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border-2 border-amber-300 px-4 py-3 font-mono text-sm
                     focus:border-amber-500 focus:outline-none"
            placeholder="Enter email subject..."
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-2">
            Email Body
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

// Admin Settings Page
export function AdminSettings() {
  const { adminFetch } = useAdminAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await adminFetch(`${API_BASE}/api/admin/settings`);
        if (!response.ok) throw new Error("Failed to fetch settings");
        const data = await response.json();
        setSettings(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  const configItems = settings
    ? [
        { label: "Database", value: settings.database_url },
        { label: "Listen Address", value: settings.listen_addr },
        { label: "Static Directory", value: settings.static_dir },
        { label: "Log Level", value: settings.log_level },
        {
          label: "QRZ Integration",
          value: settings.qrz_enabled ? "Enabled" : "Disabled",
          status: settings.qrz_enabled,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">
            CURRENT CONFIGURATION
          </h3>
        </div>
        <div className="divide-y divide-amber-200">
          {configItems.map((item) => (
            <div
              key={item.label}
              className="px-6 py-4 flex items-center justify-between"
            >
              <span className="font-mono text-sm text-amber-700">
                {item.label}
              </span>
              <span className="font-mono text-sm text-amber-900">
                {item.status !== undefined ? (
                  <span
                    className={`px-2 py-1 text-xs ${item.status ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                  >
                    {item.value}
                  </span>
                ) : (
                  item.value
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-amber-100 border-l-4 border-amber-600 p-4">
        <p className="font-serif text-amber-800 text-sm">
          <strong>Note:</strong> Settings are configured via{" "}
          <code className="bg-amber-200 px-1">config.toml</code> or environment
          variables. Changes require a server restart.
        </p>
      </div>
      <EmailTemplateEditor />
    </div>
  );
}
