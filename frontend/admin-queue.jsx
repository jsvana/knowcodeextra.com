import React, { useState, useEffect } from "react";
import { API_BASE } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";
import { Toast } from "./admin-layout.jsx";

export function AdminDashboard({ onNavigate }) {
  const { adminFetch } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/stats`);
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const handleFocus = () => fetchStats();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 p-6 text-center">
        <p className="text-red-800 font-mono mb-4">{error}</p>
        <button
          onClick={fetchStats}
          className="bg-red-600 text-white px-4 py-2 font-mono text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const statCards = [
    {
      label: "Pending",
      value: stats.pending_count,
      highlight: stats.pending_count > 0,
    },
    { label: "Approved Today", value: stats.approved_today },
    { label: "Total Certificates", value: stats.total_certificates },
    { label: "Rejections", value: stats.rejected_count },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white border-2 p-6 shadow-sm ${
              card.highlight
                ? "border-amber-500 bg-amber-50"
                : "border-amber-300"
            }`}
          >
            <p className="font-mono text-xs text-amber-600 mb-1">
              {card.label.toUpperCase()}
            </p>
            <p className="font-serif text-3xl font-bold text-amber-900">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {stats.pending_count > 0 && (
        <div className="bg-amber-100 border-2 border-amber-400 p-4 flex items-center justify-between">
          <p className="font-serif text-amber-800">
            You have <strong>{stats.pending_count}</strong> attempt(s) awaiting
            review
          </p>
          <button
            onClick={() => onNavigate("queue")}
            className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800"
          >
            Review Queue
          </button>
        </div>
      )}

      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">RECENT ACTIVITY</h3>
        </div>
        <div className="divide-y divide-amber-200">
          {stats.recent_activity.length === 0 ? (
            <p className="px-6 py-8 text-center text-amber-600 font-serif italic">
              No recent activity
            </p>
          ) : (
            stats.recent_activity.map((item) => (
              <div
                key={item.id}
                className="px-6 py-4 flex items-center justify-between"
              >
                <div>
                  <span className="font-mono text-amber-900 font-bold">
                    {item.callsign}
                  </span>
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 font-mono ${
                      item.action === "approved"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {item.action}
                  </span>
                </div>
                <span className="font-mono text-xs text-amber-600">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Attempts */}
      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">RECENT ATTEMPTS</h3>
        </div>
        <div className="divide-y divide-amber-200">
          {!stats.recent_attempts || stats.recent_attempts.length === 0 ? (
            <p className="px-6 py-8 text-center text-amber-600 font-serif italic">
              No recent attempts
            </p>
          ) : (
            stats.recent_attempts.map((item) => (
              <div
                key={item.id}
                className={`px-6 py-4 flex items-center justify-between ${!item.passed ? "opacity-60" : ""}`}
              >
                <div>
                  <span className="font-mono text-amber-900 font-bold">
                    {item.callsign}
                  </span>
                  <span className="ml-2 font-mono text-sm text-amber-600">
                    {item.questions_correct}/10
                  </span>
                  <span className="ml-2 font-mono text-sm text-amber-600">
                    {item.consecutive_correct ?? "—"} consecutive
                  </span>
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 font-mono ${
                      item.passed
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {item.passed ? "passed" : "failed"}
                  </span>
                </div>
                <span className="font-mono text-xs text-amber-600">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Admin Queue Page
export function AdminQueue({ onPendingCountChange }) {
  const { adminFetch } = useAdminAuth();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCallsign, setExpandedCallsign] = useState(null);
  const [history, setHistory] = useState({});
  const [toast, setToast] = useState(null);
  const [rejectModal, setRejectModal] = useState({
    isOpen: false,
    attemptId: null,
  });
  const [rejectNote, setRejectNote] = useState("");

  const isPassing = (item) => {
    return (
      item.questions_correct >= 7 || (item.consecutive_correct ?? 0) >= 100
    );
  };

  const fetchQueue = async () => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue`);
      if (!response.ok) throw new Error("Failed to fetch queue");
      const data = await response.json();
      setQueue(data);
      onPendingCountChange?.(data.length);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (callsign) => {
    if (history[callsign]) return;
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/queue/${callsign}/history`,
      );
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setHistory((prev) => ({ ...prev, [callsign]: data }));
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleApprove = async (attemptId) => {
    // Optimistic update
    const item = queue.find((q) => q.id === attemptId);
    setQueue((prev) => prev.filter((q) => q.id !== attemptId));

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
      onPendingCountChange?.(queue.length - 1);
    } catch (err) {
      // Rollback
      setQueue((prev) =>
        [...prev, item].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at),
        ),
      );
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleReject = async () => {
    const attemptId = rejectModal.attemptId;
    const item = queue.find((q) => q.id === attemptId);
    setQueue((prev) => prev.filter((q) => q.id !== attemptId));
    setRejectModal({ isOpen: false, attemptId: null });

    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/queue/${attemptId}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ note: rejectNote || null }),
        },
      );
      if (!response.ok) throw new Error("Failed to reject");
      setToast({ message: "Rejected", type: "success" });
      setRejectNote("");
      onPendingCountChange?.(queue.length - 1);
    } catch (err) {
      setQueue((prev) =>
        [...prev, item].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at),
        ),
      );
      setToast({ message: err.message, type: "error" });
    }
  };

  const toggleHistory = (callsign) => {
    if (expandedCallsign === callsign) {
      setExpandedCallsign(null);
    } else {
      setExpandedCallsign(callsign);
      fetchHistory(callsign);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const formatRelativeTime = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">
            PENDING VALIDATION
          </h3>
        </div>

        {queue.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-serif text-xl text-amber-800 mb-2">
              No pending attempts
            </p>
            <p className="font-mono text-sm text-amber-600">
              You're all caught up!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-amber-200">
            {queue.map((item) => (
              <div key={item.id}>
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <button
                      onClick={() => toggleHistory(item.callsign)}
                      className="font-mono text-lg font-bold text-amber-900 hover:text-amber-700"
                    >
                      {item.callsign}
                      <span className="ml-2 text-xs text-amber-500">
                        {expandedCallsign === item.callsign ? "▼" : "▶"}
                      </span>
                    </button>
                    <div className="flex gap-4 mt-1 font-mono text-sm text-amber-600">
                      <span>{item.questions_correct}/10</span>
                      <span>
                        {item.consecutive_correct ?? item.copy_chars}{" "}
                        consecutive
                      </span>
                      <span>{formatRelativeTime(item.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isPassing(item) ? (
                      <>
                        <button
                          onClick={() => handleApprove(item.id)}
                          className="bg-green-600 text-white px-4 py-2 font-mono text-sm hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            setRejectModal({ isOpen: true, attemptId: item.id })
                          }
                          className="bg-red-600 text-white px-4 py-2 font-mono text-sm hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="font-mono text-sm text-amber-500 italic">
                        Not passing
                      </span>
                    )}
                  </div>
                </div>

                {/* History panel */}
                {expandedCallsign === item.callsign &&
                  history[item.callsign] && (
                    <div className="bg-amber-50 px-6 py-4 border-t border-amber-200">
                      <h4 className="font-mono text-xs text-amber-700 mb-2">
                        HISTORY FOR {item.callsign}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full font-mono text-sm">
                          <thead>
                            <tr className="text-amber-600 text-left">
                              <th className="pr-4">Date</th>
                              <th className="pr-4">Score</th>
                              <th className="pr-4">Copy</th>
                              <th className="pr-4">Passed</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history[item.callsign].map((h) => (
                              <tr key={h.id} className="text-amber-800">
                                <td className="pr-4 py-1">
                                  {new Date(h.created_at).toLocaleDateString()}
                                </td>
                                <td className="pr-4">
                                  {h.questions_correct}/10
                                </td>
                                <td className="pr-4">{h.copy_chars}</td>
                                <td className="pr-4">
                                  {h.passed ? "Yes" : "No"}
                                </td>
                                <td>{h.validation_status || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setRejectModal({ isOpen: false, attemptId: null })}
          />
          <div className="relative bg-amber-50 border-4 border-amber-800 shadow-2xl max-w-md w-full p-8">
            <h2 className="font-serif text-2xl font-bold text-amber-900 mb-4">
              Reject Attempt
            </h2>
            <div className="mb-4">
              <label className="font-mono text-xs text-amber-700 block mb-1">
                NOTE (OPTIONAL)
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="w-full border-2 border-amber-300 bg-white p-3 font-mono text-sm h-24 focus:border-amber-500 focus:outline-none"
                placeholder="Reason for rejection..."
              />
            </div>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() =>
                  setRejectModal({ isOpen: false, attemptId: null })
                }
                className="px-4 py-2 font-mono text-sm border-2 border-amber-300 text-amber-800 hover:border-amber-500"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 font-mono text-sm bg-red-600 text-white hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Admin Approved Page
export function AdminApproved() {
  const { adminFetch } = useAdminAuth();
  const [data, setData] = useState({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null); // null = all, false = not reached out, true = reached out
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [emailModal, setEmailModal] = useState({ isOpen: false, member: null });
  const [generatedEmail, setGeneratedEmail] = useState(null);
  const [generating, setGenerating] = useState(false);

  const fetchApproved = async (page = 1) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/admin/approved?page=${page}&per_page=25`;
      if (filter !== null) url += `&reached_out=${filter}`;
      const response = await adminFetch(url);
      if (!response.ok) throw new Error("Failed to fetch");
      const result = await response.json();
      setData(result);
      setSelected(new Set());
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkReachedOut = async () => {
    if (selected.size === 0) return;

    const ids = Array.from(selected);
    // Optimistic update
    setData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        ids.includes(item.id) ? { ...item, reached_out: true } : item,
      ),
    }));
    setSelected(new Set());

    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/approved/mark-reached-out`,
        {
          method: "POST",
          body: JSON.stringify({ ids }),
        },
      );
      if (!response.ok) throw new Error("Failed to mark");
      const result = await response.json();
      setToast({
        message: `Marked ${result.count} as reached out`,
        type: "success",
      });
    } catch (err) {
      fetchApproved(data.page); // Rollback by refetching
      setToast({ message: err.message, type: "error" });
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  };

  const copyEmail = (email) => {
    navigator.clipboard.writeText(email);
    setToast({ message: "Email copied", type: "success" });
  };

  const generateEmail = async (member) => {
    setEmailModal({ isOpen: true, member });
    setGenerating(true);
    setGeneratedEmail(null);
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/email/generate`,
        {
          method: "POST",
          body: JSON.stringify({ member_id: member.id }),
        },
      );
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

  useEffect(() => {
    fetchApproved(1);
  }, [filter]);

  const totalPages = Math.ceil(data.total / data.per_page);

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Actions bar */}
      <div className="bg-white border-2 border-amber-300 p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleMarkReachedOut}
            disabled={selected.size === 0}
            className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800 disabled:opacity-50"
          >
            Mark Selected as Reached Out
          </button>
          <span className="font-mono text-sm text-amber-600">
            {selected.size} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-amber-600">Filter:</span>
          <select
            value={filter === null ? "all" : filter.toString()}
            onChange={(e) =>
              setFilter(
                e.target.value === "all" ? null : e.target.value === "true",
              )
            }
            className="border-2 border-amber-300 px-3 py-1 font-mono text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="all">All</option>
            <option value="false">Not Reached Out</option>
            <option value="true">Reached Out</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border-2 border-amber-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-amber-900 text-amber-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      data.items.length > 0 &&
                      selected.size === data.items.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">
                  CALLSIGN
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">
                  EMAIL
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">
                  CERT #
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">
                  APPROVED
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">
                  REACHED OUT
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center font-mono text-amber-600"
                  >
                    Loading...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center font-serif italic text-amber-600"
                  >
                    No approved attempts
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr
                    key={item.id}
                    className={item.reached_out ? "opacity-50" : ""}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-900">
                      {item.callsign}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-amber-700">
                          {item.email || "Not found"}
                        </span>
                        {item.email && (
                          <button
                            onClick={() => copyEmail(item.email)}
                            className="text-amber-500 hover:text-amber-700"
                            title="Copy email"
                          >
                            📋
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/api/certificate/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-amber-600 hover:text-amber-800 underline"
                      >
                        #{item.certificate_number}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {item.validated_at
                        ? new Date(item.validated_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 font-mono ${
                          item.reached_out
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.reached_out ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => generateEmail(item)}
                        className="text-xs bg-amber-600 text-white px-2 py-1 hover:bg-amber-700"
                      >
                        Email
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-amber-200 flex items-center justify-between">
            <span className="font-mono text-sm text-amber-600">
              Showing {(data.page - 1) * data.per_page + 1}-
              {Math.min(data.page * data.per_page, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchApproved(data.page - 1)}
                disabled={data.page <= 1}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => fetchApproved(data.page + 1)}
                disabled={data.page >= totalPages}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

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
                    SUBJECT
                  </label>
                  <div className="bg-amber-50 border border-amber-200 p-3 font-mono text-sm">
                    {generatedEmail.subject}
                  </div>
                </div>
                <div>
                  <label className="font-mono text-xs text-amber-600 block mb-1">
                    EMAIL BODY
                  </label>
                  <pre className="bg-amber-50 border border-amber-200 p-4 font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {generatedEmail.email}
                  </pre>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {generatedEmail.recipient_email && (
                    <button
                      onClick={() => {
                        const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(generatedEmail.recipient_email)}&su=${encodeURIComponent(generatedEmail.subject)}&body=${encodeURIComponent(generatedEmail.email)}`;
                        window.open(gmailUrl, "_blank");
                      }}
                      className="bg-blue-600 text-white px-4 py-2 font-mono text-sm hover:bg-blue-700"
                    >
                      Open in Gmail
                    </button>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedEmail.subject);
                      setToast({
                        message: "Subject copied to clipboard",
                        type: "success",
                      });
                    }}
                    className="bg-amber-700 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-600"
                  >
                    Copy Subject
                  </button>
                  <button
                    onClick={copyGeneratedEmail}
                    className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800"
                  >
                    Copy Body
                  </button>
                  <button
                    onClick={() =>
                      setEmailModal({ isOpen: false, member: null })
                    }
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
    </div>
  );
}
