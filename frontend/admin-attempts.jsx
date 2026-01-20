import React, { useState, useEffect } from "react";
import { API_BASE } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";
import { Toast } from "./admin-layout.jsx";

export function AdminAllAttempts() {
  const { adminFetch } = useAdminAuth();
  const [data, setData] = useState({ items: [], total: 0, page: 1, per_page: 25 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({
    passed: null,
    callsign: "",
    dateFrom: "",
    dateTo: "",
  });
  const [expandedId, setExpandedId] = useState(null);

  const fetchAttempts = async (page = 1) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/admin/attempts?page=${page}&per_page=25`;
      if (filters.passed !== null) url += `&passed=${filters.passed}`;
      if (filters.callsign) url += `&callsign=${encodeURIComponent(filters.callsign)}`;
      if (filters.dateFrom) url += `&date_from=${filters.dateFrom}`;
      if (filters.dateTo) url += `&date_to=${filters.dateTo}`;

      const response = await adminFetch(url);
      if (!response.ok) throw new Error("Failed to fetch attempts");
      const result = await response.json();
      setData(result);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts(1);
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

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

      {/* Filters */}
      <div className="bg-white border-2 border-amber-300 p-4 mb-4 grid grid-cols-4 gap-4">
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">STATUS</label>
          <select
            value={filters.passed === null ? "all" : filters.passed.toString()}
            onChange={(e) => handleFilterChange("passed", e.target.value === "all" ? null : e.target.value === "true")}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          >
            <option value="all">All</option>
            <option value="true">Passed</option>
            <option value="false">Failed</option>
          </select>
        </div>
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">CALLSIGN</label>
          <input
            type="text"
            value={filters.callsign}
            onChange={(e) => handleFilterChange("callsign", e.target.value.toUpperCase())}
            placeholder="Search..."
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">FROM DATE</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-600 block mb-1">TO DATE</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border-2 border-amber-300 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-amber-900 text-amber-50">
            <tr>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CALLSIGN</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">DATE</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">QUESTIONS</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CONSECUTIVE</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">PASSED</th>
              <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center font-mono text-amber-600">
                  Loading...
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center font-serif italic text-amber-600">
                  No attempts found
                </td>
              </tr>
            ) : (
              data.items.map((item) => (
                <React.Fragment key={item.id}>
                  <tr
                    className={`cursor-pointer hover:bg-amber-50 ${!item.passed ? "opacity-60" : ""}`}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-amber-900">
                      {item.callsign}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {item.questions_correct}/10
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {item.consecutive_correct ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 font-mono ${item.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {item.passed ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 font-mono ${
                        item.validation_status === "approved" ? "bg-green-100 text-green-800" :
                        item.validation_status === "rejected" ? "bg-red-100 text-red-800" :
                        item.validation_status === "pending" ? "bg-amber-100 text-amber-800" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {item.validation_status || "-"}
                      </span>
                    </td>
                  </tr>
                  {expandedId === item.id && item.copy_text && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 bg-amber-50 border-t border-amber-200">
                        <h4 className="font-mono text-xs text-amber-700 mb-2">COPY TEXT</h4>
                        <pre className="font-mono text-sm text-amber-800 whitespace-pre-wrap bg-white p-3 border border-amber-200">
                          {item.copy_text}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-amber-200 flex items-center justify-between">
            <span className="font-mono text-sm text-amber-600">
              Showing {(data.page - 1) * data.per_page + 1}-{Math.min(data.page * data.per_page, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchAttempts(data.page - 1)}
                disabled={data.page <= 1}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => fetchAttempts(data.page + 1)}
                disabled={data.page >= totalPages}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
