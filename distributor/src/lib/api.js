// Shared sign-in with the main site. Distributors sign in on the main site's sign-in page
// (/authentication/sign-in); it stores the session in this origin's browser storage and
// this app reads the same keys (as the DMS app does). Keep these keys in sync with
// frontend/src/context/AuthContext.js.
const AUTH_KEYS = {
  token: "auth_token",
  refreshToken: "auth_refresh_token",
  user: "auth_user",
  remember: "auth_remember",
  lastActivity: "auth_last_activity",
};

export const SIGN_IN_URL = "/authentication/sign-in";

// Distributors are logged out only after 1 day without activity (not the main site's
// 5 minutes). Keep in step with frontend/src/context/AuthContext.js.
const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart", "click"];

const getStoredValue = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);
const getStorage = () => (localStorage.getItem(AUTH_KEYS.remember) === "true" ? localStorage : sessionStorage);

export const getToken = () => getStoredValue(AUTH_KEYS.token);

export const getUser = () => {
  try {
    return JSON.parse(getStoredValue(AUTH_KEYS.user) || "null");
  } catch {
    return null;
  }
};

// Ends the shared session (main site too) and goes to the sign-in page.
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
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      getStorage().setItem(AUTH_KEYS.token, data.token);
      // A new 1-day refresh token each time: the session lasts while the portal is used.
      if (data.refreshToken) getStorage().setItem(AUTH_KEYS.refreshToken, data.refreshToken);
      return data.token;
    })()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

// Calls the Distributor Portal API (/api/distributor) with the shared token, renewing it
// once on a 401. If it can't be renewed, the session has ended: back to sign-in.
export async function api(path, { method = "GET", body, signal } = {}) {
  const request = (token) =>
    fetch(`/api/distributor${path}`, {
      method,
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let res;
  try {
    res = await request(getToken());
    if (res.status === 401) {
      const fresh = await refreshAccessToken();
      if (!fresh) {
        logout();
        throw new Error("Your session has ended. Please sign in again.");
      }
      res = await request(fresh);
    }
  } catch (err) {
    if (err.name === "AbortError" || err.message.startsWith("Your session")) throw err;
    throw new Error("Can't reach the server. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

// Idle logout after 1 day; the last-activity time is shared with the main site through localStorage.
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
  if (!localStorage.getItem(AUTH_KEYS.lastActivity)) localStorage.setItem(AUTH_KEYS.lastActivity, String(Date.now()));
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
