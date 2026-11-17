import { useEffect, useRef, useState } from "react";
import { MdTab } from "react-icons/md";

// Only one Sales & Purchase tab works at a time (per browser). A new tab asks the open ones
// over a BroadcastChannel; if one answers, the new tab shows "already open" instead of the
// app. "Use this tab" takes over: the old tab then shows the same notice.
// The main site's sidebar link also reuses the open tab (window name below), so clicking it
// again focuses that tab instead of opening another one.
// This is a browser-side rule, not a security boundary: all tabs share the same login.

export const DMS_WINDOW_NAME = "edunextg-sales-purchase";
const CHANNEL = "dms-single-tab";
const ANSWER_WAIT_MS = 400;

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function SingleTabGuard({ children }) {
  // "checking" -> "active" | "blocked"
  const [state, setState] = useState(typeof BroadcastChannel === "undefined" ? "active" : "checking");
  const stateRef = useRef(state);
  stateRef.current = state;
  const channelRef = useRef(null);
  const idRef = useRef(newId());

  useEffect(() => {
    window.name = DMS_WINDOW_NAME;
    if (typeof BroadcastChannel === "undefined") return undefined;

    const channel = new BroadcastChannel(CHANNEL);
    channelRef.current = channel;
    const me = idRef.current;

    channel.onmessage = ({ data }) => {
      if (!data || data.from === me) return;
      if (data.type === "hello" && stateRef.current === "active") {
        channel.postMessage({ type: "here", from: me, to: data.from });
      } else if (data.type === "here" && data.to === me && stateRef.current === "checking") {
        setState("blocked");
      } else if (data.type === "takeover" && stateRef.current === "active") {
        setState("blocked");
      }
    };

    channel.postMessage({ type: "hello", from: me });
    const timer = setTimeout(() => {
      if (stateRef.current === "checking") setState("active");
    }, ANSWER_WAIT_MS);

    return () => {
      clearTimeout(timer);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const useHere = () => {
    channelRef.current?.postMessage({ type: "takeover", from: idRef.current });
    setState("active");
  };

  if (state === "active") return children;
  if (state === "checking") return null;

  return (
    <div data-theme="dms" className="flex min-h-screen items-center justify-center bg-base-200 p-6">
      <div className="max-w-md rounded-box border border-base-300 bg-base-100 p-6 text-center">
        <MdTab size={36} className="mx-auto text-primary" />
        <h1 className="mt-3 text-lg font-semibold">Sales &amp; Purchase is open in another tab</h1>
        <p className="mt-1 text-sm text-base-content/70">
          Only one Sales &amp; Purchase tab can be used at a time. Close this tab, or use it here and the other tab
          will stop.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.close()}>
            Close this tab
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={useHere}>
            Use this tab
          </button>
        </div>
      </div>
    </div>
  );
}
