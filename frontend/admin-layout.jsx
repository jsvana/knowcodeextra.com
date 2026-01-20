import React, { useState, useEffect } from "react";
import { useAdminAuth } from "./admin-auth.jsx";

export function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === "success" ? "bg-green-600" : "bg-red-600";

  return (
    <div
      className={`fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 shadow-lg font-mono text-sm z-50`}
    >
      {message}
    </div>
  );
}

// Admin Layout with Sidebar
export function AdminLayout({ children, currentPage, pendingCount = 0 }) {
  const { logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "queue", label: "Queue", icon: "📋", badge: pendingCount },
    { id: "approved", label: "Approved", icon: "✓" },
    { id: "attempts", label: "All Attempts", icon: "📄" },
    { id: "search", label: "Search", icon: "🔍" },
    { id: "tests", label: "Tests", icon: "📝" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div className="min-h-screen bg-amber-50 flex">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 bg-amber-900 text-amber-50 p-2"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {/* Sidebar */}
      <div
        className={`
        fixed md:static inset-y-0 left-0 z-40
        w-64 bg-amber-900 text-amber-50 transform transition-transform
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
      >
        <div className="p-6 border-b border-amber-800">
          <h1 className="font-serif text-xl font-bold">Admin Portal</h1>
          <p className="font-mono text-xs text-amber-400 mt-1">
            KNOW CODE EXTRA
          </p>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#/admin/${item.id}`}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors
                ${
                  currentPage === item.id
                    ? "bg-amber-800 text-amber-50"
                    : "text-amber-300 hover:bg-amber-800 hover:text-amber-50"
                }
              `}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-amber-800">
          <button
            onClick={logout}
            className="w-full px-4 py-2 font-mono text-sm text-amber-300 hover:text-amber-50 hover:bg-amber-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 md:ml-0">
        <header className="bg-white border-b border-amber-200 px-6 py-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold text-amber-900 capitalize ml-12 md:ml-0">
            {currentPage}
          </h2>
        </header>
        <main className="p-6">{children}</main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
