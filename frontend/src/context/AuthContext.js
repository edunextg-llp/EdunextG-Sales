import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const AUTH_KEYS = {
  token: "auth_token",
  refreshToken: "auth_refresh_token",
  user: "auth_user",
  remember: "auth_remember",
};

const API_BASE = "https://bawarchee.edunextg.co/api";

const getStorage = () => {
  const remember = localStorage.getItem(AUTH_KEYS.remember) === "true";
  return remember ? localStorage : sessionStorage;
};

const getStoredValue = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);

// Read the expiry time (ms) from a JWT without verifying it. Returns 0 if unreadable.
const getTokenExpiry = (jwtToken) => {
  try {
    const payload = jwtToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)).exp || 0) * 1000;
  } catch (error) {
    return 0;
  }
};

// Renew the access token this long before it expires, so requests never hit a 401.
const REFRESH_BEFORE_EXPIRY_MS = 60 * 1000;

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

    // One shared refresh at a time: when many requests start together they all
    // wait for the same new token instead of each calling /auth/refresh.
    let refreshInFlight = null;
    const refreshAccessToken = () => {
      if (!refreshInFlight) {
        refreshInFlight = (async () => {
          const storedRefreshToken = getStoredValue(AUTH_KEYS.refreshToken);
          if (!storedRefreshToken) return null;
          const refreshResponse = await originalFetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: storedRefreshToken }),
          });
          if (!refreshResponse.ok) return null;
          const refreshData = await refreshResponse.json();
          getStorage().setItem(AUTH_KEYS.token, refreshData.token);
          setToken(refreshData.token);
          // Permissions may have been changed by the admin since login:
          // update the menu without asking the user to log in again.
          if (Array.isArray(refreshData.user?.permissions)) {
            const storedUser = getStoredValue(AUTH_KEYS.user);
            if (storedUser) {
              const nextUser = { ...JSON.parse(storedUser), permissions: refreshData.user.permissions };
              getStorage().setItem(AUTH_KEYS.user, JSON.stringify(nextUser));
              setUser(nextUser);
            }
          }
          return refreshData.token;
        })()
          .catch(() => null)
          .finally(() => {
            refreshInFlight = null;
          });
      }
      return refreshInFlight;
    };

    window.fetch = async function (...args) {
      let [resource, config] = args;
      const url = typeof resource === "string" ? resource : resource?.url || "";

      let currentToken = getStoredValue(AUTH_KEYS.token);
      const isApiCall = url.includes(API_BASE) && !url.includes("/api/auth/");

      // Renew the token shortly before it expires instead of waiting for a 401.
      if (isApiCall && currentToken) {
        const expiresAt = getTokenExpiry(currentToken);
        if (expiresAt && expiresAt - Date.now() < REFRESH_BEFORE_EXPIRY_MS) {
          const freshToken = await refreshAccessToken();
          if (freshToken) currentToken = freshToken;
        }
      }
      if (url.includes(API_BASE) && !url.includes("/api/auth/")) {
        config = config || {};
        config.headers = config.headers || {};
        if (currentToken) {
          config.headers["Authorization"] = `Bearer ${currentToken}`;
        }
      }

      const response = await originalFetch(resource, config);

      if (response.status === 401 && currentToken && isApiCall) {
        const freshToken = await refreshAccessToken();
        if (freshToken) {
          const retryConfig = {
            ...(config || {}),
            headers: {
              ...((config && config.headers) || {}),
              Authorization: `Bearer ${freshToken}`,
            },
          };
          return originalFetch(resource, retryConfig);
        }
      }

      // A 403 means the signed-in user is not allowed to use a particular
      // endpoint. It is not evidence that their session is invalid, so keep
      // them signed in and let the page handle the permission error.
      if (response.status === 401) {
        if (currentToken) {
          setUser(null);
          setToken(null);
          clearAuthStorage();
          window.location.href = "/authentication/sign-in";
        }
      }

      return response;
    };

    // Reloading the page picks up permission changes straight away.
    if (getStoredValue(AUTH_KEYS.token) && getStoredValue(AUTH_KEYS.refreshToken)) {
      void refreshAccessToken();
    }

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
