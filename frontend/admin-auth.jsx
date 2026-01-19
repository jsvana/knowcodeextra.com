import React, { useState, useEffect } from "react";
import { API_BASE, TelegraphKey } from "./shared.jsx";

// Admin Auth Context
export const AdminAuthContext = React.createContext(null);

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (username, password) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Login failed");
      }

      const data = await response.json();
      setToken(data.token);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
  };

  const adminFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      logout();
      throw new Error("Session expired");
    }

    return response;
  };

  return (
    <AdminAuthContext.Provider
      value={{
        token,
        login,
        logout,
        adminFetch,
        isLoading,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = React.useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}

// Admin Login Page
export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const { login, isLoading } = useAdminAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white border-4 border-amber-800 shadow-2xl max-w-md w-full p-8 relative">
        <div className="text-center mb-8">
          <TelegraphKey className="w-16 h-8 text-amber-800 mx-auto mb-4" />
          <h1
            className="font-serif text-3xl font-bold text-amber-900"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Admin Portal
          </h1>
          <p className="font-mono text-xs text-amber-600 mt-2">
            KNOW CODE EXTRA
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 p-3 text-red-800 font-mono text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">
              USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono
                       focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono
                       focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-amber-900 text-amber-50 px-6 py-4 font-mono tracking-widest
                     hover:bg-amber-800 transition-all disabled:opacity-50"
          >
            {isLoading ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <a
            href="/"
            className="font-mono text-sm text-amber-600 hover:text-amber-800"
          >
            &larr; Return to main site
          </a>
        </div>
      </div>
    </div>
  );
}
