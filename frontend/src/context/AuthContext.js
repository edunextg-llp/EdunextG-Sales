import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const AUTH_KEYS = {
  token: "auth_token",
  refreshToken: "auth_refresh_token",
  user: "auth_user",
  remember: "auth_remember",
  lastActivity: "auth_last_activity",
};

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 10 * 1000;
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart", "click"];

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
  localStorage.removeItem(AUTH_KEYS.lastActivity);
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

  // Auto logout after 5 minutes with no mouse, keyboard, touch or scroll activity.
  // Applies to every login (admin and users), including "Remember me".
  // The last activity time is shared through localStorage, so working in one
  // tab keeps the other open tabs signed in too.
  useEffect(() => {
    if (!token) return undefined;

    const markActive = () => {
      const now = Date.now();
      const last = Number(localStorage.getItem(AUTH_KEYS.lastActivity)) || 0;
      // Write at most once every few seconds; mousemove fires constantly.
      if (now - last > ACTIVITY_WRITE_INTERVAL_MS) {
        localStorage.setItem(AUTH_KEYS.lastActivity, String(now));
      }
    };

    const checkIdle = () => {
      if (!getStoredValue(AUTH_KEYS.token)) return;
      const last = Number(localStorage.getItem(AUTH_KEYS.lastActivity)) || Date.now();
      if (Date.now() - last >= INACTIVITY_LIMIT_MS) {
        logout();
        window.location.href = "/authentication/sign-in";
      }
    };

    // Keep an existing time (e.g. after a page reload) so idle time still counts;
    // a fresh login has none, so it starts now.
    if (!localStorage.getItem(AUTH_KEYS.lastActivity)) {
      localStorage.setItem(AUTH_KEYS.lastActivity, String(Date.now()));
    }
    checkIdle();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    // Re-check as soon as the tab comes back (e.g. after the laptop was asleep).
    document.addEventListener("visibilitychange", checkIdle);
    const timer = setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      document.removeEventListener("visibilitychange", checkIdle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
