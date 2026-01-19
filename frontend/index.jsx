import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom";

import { App } from "./app.jsx";
import { AdminAuthProvider } from "./admin-auth.jsx";
import { AdminLogin } from "./admin-auth.jsx";
import { useAdminAuth } from "./admin-auth.jsx";
import { AdminLayout } from "./admin-layout.jsx";
import { AdminDashboard, AdminQueue, AdminApproved } from "./admin-queue.jsx";
import { AdminSearch, AdminSettings } from "./admin-settings.jsx";
import { TestManager, QuestionEditor } from "./admin-tests.jsx";

function AdminApp() {
  const { isAuthenticated } = useAdminAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/admin/")) {
        const page = hash.replace("#/admin/", "");
        if (
          ["dashboard", "queue", "approved", "search", "tests", "settings"].includes(
            page,
          )
        ) {
          setCurrentPage(page);
        }
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigateTo = (page) => {
    window.location.hash = `/admin/${page}`;
    setCurrentPage(page);
  };

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  let content;
  switch (currentPage) {
    case "dashboard":
      content = <AdminDashboard onNavigate={navigateTo} />;
      break;
    case "queue":
      content = <AdminQueue onPendingCountChange={setPendingCount} />;
      break;
    case "approved":
      content = <AdminApproved />;
      break;
    case "search":
      content = <AdminSearch />;
      break;
    case "tests":
      content = <TestManager />;
      break;
    case "settings":
      content = <AdminSettings />;
      break;
    default:
      content = <AdminDashboard onNavigate={navigateTo} />;
  }

  return (
    <AdminLayout currentPage={currentPage} pendingCount={pendingCount}>
      {content}
    </AdminLayout>
  );
}

function MainApp() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");

  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <AdminApp />
      </AdminAuthProvider>
    );
  }

  return <App />;
}

const root = createRoot(document.getElementById("root"));
root.render(<MainApp />);
