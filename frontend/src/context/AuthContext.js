import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const AUTH_KEYS = {
  token: "auth_token",
  refreshToken: "auth_refresh_token",
  user: "auth_user",
  remember: "auth_remember",
};

const API_BASE = "https://bawarchee.eunextg.co/api";

const getStorage = () => {
  const remember = localStorage.getItem(AUTH_KEYS.remember) === "true";
  return remember ? localStorage : sessionStorage;
};

const getStoredValue = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);

const clearAuthStorage = () => {
  [localStorage, sessionStorage].forEach((storage) => {
    storage.removeItem(AUTH_KEYS.token);
    storage.removeItem(AUTH_KEYS.refreshToken);
    storage.removeItem(AUTH_KEYS.user);
  });
  localStorage.removeItem(AUTH_KEYS.remember);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const storedToken = getStoredValue(AUTH_KEYS.token);
    const storedUser = getStoredValue(AUTH_KEYS.user);
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsReady(true);

    // Setup Global Fetch Interceptor
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      let [resource, config] = args;
      const url = typeof resource === "string" ? resource : resource?.url || "";

      const currentToken = getStoredValue(AUTH_KEYS.token);
      if (url.includes(API_BASE) && !url.includes("/api/auth/")) {
        config = config || {};
        config.headers = config.headers || {};
        if (currentToken) {
          config.headers["Authorization"] = `Bearer ${currentToken}`;
        }
      }

      const response = await originalFetch(resource, config);

      if (response.status === 401 && currentToken && url.includes(API_BASE) && !url.includes("/api/auth/")) {
        const storedRefreshToken = getStoredValue(AUTH_KEYS.refreshToken);
        if (storedRefreshToken) {
          const refreshResponse = await originalFetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: storedRefreshToken }),
          });

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            const storage = getStorage();
            storage.setItem(AUTH_KEYS.token, refreshData.token);
            setToken(refreshData.token);

            const retryConfig = {
              ...(config || {}),
              headers: {
                ...((config && config.headers) || {}),
                Authorization: `Bearer ${refreshData.token}`,
              },
            };
            return originalFetch(resource, retryConfig);
          }
        }
      }

      if (response.status === 401 || response.status === 403) {
        if (currentToken) {
          setUser(null);
          setToken(null);
          clearAuthStorage();
          window.location.href = "/authentication/sign-in";
        }
      }

      return response;
    };

    return () => {
      // Restore original fetch when context unmounts
      window.fetch = originalFetch;
    };
  }, []);

  const login = (userData, authToken, refreshToken, rememberMe = false) => {
    setUser(userData);
    setToken(authToken);
    clearAuthStorage();
    localStorage.setItem(AUTH_KEYS.remember, rememberMe ? "true" : "false");
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(AUTH_KEYS.token, authToken);
    storage.setItem(AUTH_KEYS.refreshToken, refreshToken);
    storage.setItem(AUTH_KEYS.user, JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearAuthStorage();
  };

  useEffect(() => {
    let inactivityTimer;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      const rememberMe = localStorage.getItem(AUTH_KEYS.remember) === "true";
      if (rememberMe) return;
      inactivityTimer = setTimeout(() => {
        if (getStoredValue(AUTH_KEYS.token)) {
          logout();
          window.location.href = "/authentication/sign-in";
        }
      }, 7 * 60 * 60 * 1000);
    };

    if (token) {
      window.addEventListener("mousemove", resetTimer);
      window.addEventListener("keypress", resetTimer);
      window.addEventListener("scroll", resetTimer);
      window.addEventListener("click", resetTimer);
      resetTimer();
    }

    return () => {
      clearTimeout(inactivityTimer);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keypress", resetTimer);
      window.removeEventListener("scroll", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
