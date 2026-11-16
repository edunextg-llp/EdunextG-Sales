// Shared authentication with the main site.
// The main site (frontend/) handles sign-in and stores the session in this
// origin's browser storage; the DMS app reads the same keys. Keep these keys in
// sync with frontend/src/context/AuthContext.js.
const AUTH_KEYS = {
  token: "auth_token",
  refreshToken: "auth_refresh_token",
  user: "auth_user",
  remember: "auth_remember",
  lastActivity: "auth_last_activity",
};

export const API_BASE = "/api";
export const SIGN_IN_URL = "/authentication/sign-in";
export const MAIN_SITE_URL = "/dashboard";

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000; // same as the main site
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart", "click"];

const getStoredValue = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);
const getStorage = () => (localStorage.getItem(AUTH_KEYS.remember) === "true" ? localStorage : sessionStorage);

export const getToken = () => getStoredValue(AUTH_KEYS.token);

export const getUser = () => {
  try {
    return JSON.parse(getStoredValue(AUTH_KEYS.user) || "null");
  } catch (error) {
    return null;
  }
};

export const logout = () => {
  [localStorage, sessionStorage].forEach((storage) => {
    storage.removeItem(AUTH_KEYS.token);
    storage.removeItem(AUTH_KEYS.refreshToken);
    storage.removeItem(AUTH_KEYS.user);
  });
  localStorage.removeItem(AUTH_KEYS.remember);
  localStorage.removeItem(AUTH_KEYS.lastActivity);
  window.location.href = SIGN_IN_URL;
};

let refreshInFlight = null;
const refreshAccessToken = () => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getStoredValue(AUTH_KEYS.refreshToken);
      if (!refreshToken) return null;
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      getStorage().setItem(AUTH_KEYS.token, data.token);
      if (Array.isArray(data.user?.permissions)) {
        const user = getUser();
        if (user) {
          getStorage().setItem(AUTH_KEYS.user, JSON.stringify({ ...user, permissions: data.user.permissions }));
        }
      }
      return data.token;
    })()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

// fetch() for backend calls: adds the Bearer token and renews it on a 401.
// Usage: apiFetch("/dms/items")  ->  GET /api/dms/items
export const apiFetch = async (path, options = {}) => {
  const withToken = (token) => ({
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const url = `${API_BASE}${path}`;
  let response = await fetch(url, withToken(getToken()));
  if (response.status === 401) {
    const freshToken = await refreshAccessToken();
    if (!freshToken) {
      logout();
      return response;
    }
    response = await fetch(url, withToken(freshToken));
  }
  return response;
};

// Same idle rule as the main site. The last-activity time is shared through
// localStorage, so activity in either site keeps the session alive.
export const startIdleWatch = () => {
  const markActive = () => {
    const now = Date.now();
    const last = Number(localStorage.getItem(AUTH_KEYS.lastActivity)) || 0;
    if (now - last > ACTIVITY_WRITE_INTERVAL_MS) localStorage.setItem(AUTH_KEYS.lastActivity, String(now));
  };
  const checkIdle = () => {
    if (!getToken()) return;
    const last = Number(localStorage.getItem(AUTH_KEYS.lastActivity)) || Date.now();
    if (Date.now() - last >= INACTIVITY_LIMIT_MS) logout();
  };
  if (!localStorage.getItem(AUTH_KEYS.lastActivity)) {
    localStorage.setItem(AUTH_KEYS.lastActivity, String(Date.now()));
  }
  checkIdle();
  ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
  document.addEventListener("visibilitychange", checkIdle);
  const timer = setInterval(checkIdle, 10 * 1000);
  return () => {
    clearInterval(timer);
    ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
    document.removeEventListener("visibilitychange", checkIdle);
  };
};
