import { useCallback, useEffect, useRef, useState } from "react";

// Maintenance screen. The server's switch is GET {apiBase}/maintenance/status
// ({ status: 1 } working, { status: 0, message } under maintenance; set from Postman).
// The page stays mounted underneath, so an open form is still there when the site comes back.
// It shows when:
//   - the status check says status 0 (checked on load, every 60 s, and when the tab is focused), or
//   - any API call answers 503 { code: "MAINTENANCE" }.
// While it shows, the status is checked every 15 s and the screen goes away by itself at status 1.
// Same component in dms/src/components/MaintenanceGate.jsx (keep them in step).

const CHECK_MS = 60 * 1000;
const RECHECK_MS = 15 * 1000;

export default function MaintenanceGate({ apiBase = "/api", children }) {
  const [state, setState] = useState({ on: false, message: "" });
  const [checking, setChecking] = useState(false);
  const nativeFetch = useRef(window.fetch.bind(window));

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await nativeFetch.current(`${apiBase}/maintenance/status`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setState({ on: Number(body.status) === 0, message: body.message || "" });
    } catch (error) {
      // Server unreachable: leave the current state alone.
    } finally {
      setChecking(false);
    }
  }, [apiBase]);

  // Any API call that comes back 503 + X-Maintenance shows the screen straight away.
  // Wraps whatever window.fetch is at this point (the login refresh wrapper included).
  useEffect(() => {
    const previous = window.fetch;
    const wrapped = async (...args) => {
      const response = await previous(...args);
      // Read the body's code, not only the X-Maintenance header: a cross-origin API hides custom headers.
      if (response.status === 503) {
        response.clone().json()
          .then((body) => {
            if (body?.code === "MAINTENANCE") setState({ on: true, message: body.message || body.error || "" });
          })
          .catch(() => {});
      }
      return response;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = previous;
    };
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, state.on ? RECHECK_MS : CHECK_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [check, state.on]);

  return (
    <>
      {children}
      {state.on && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="maintenance-title"
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-50 px-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <h1 id="maintenance-title" className="m-0 text-xl font-semibold text-slate-900">
              Server under maintenance
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {state.message || "The server is under maintenance. Please try again after some time."}
            </p>
            <p className="mt-4 text-xs text-slate-400">This screen closes by itself when the server is back.</p>
            <button
              type="button"
              onClick={check}
              disabled={checking}
              className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {checking ? "Checking..." : "Check again"}
            </button>
            <p className="mt-6 text-xs text-slate-400">© {new Date().getFullYear()} EduNextG India LLP</p>
          </div>
        </div>
      )}
    </>
  );
}
