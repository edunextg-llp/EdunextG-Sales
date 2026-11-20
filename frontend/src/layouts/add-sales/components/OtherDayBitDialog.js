// Other-day bit / other-date approval popup: Tailwind CSS (no MUI). Request, refresh and own-permission logic unchanged.
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Badge, Icon, Modal, Notice, btn, fieldClass } from "components/tw";

const API = process.env.REACT_APP_API_URL;

export const BIT_TIME_ZONE = "Asia/Kolkata";

export const todayDayName = () =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: BIT_TIME_ZONE }).format(new Date());

// Today's date in India as YYYY-MM-DD.
export const todayDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// CNF outlets have no weekday, so on today's date they are always billable.
export const isTodaysBit = (outletDay, today = todayDayName()) => {
  const day = String(outletDay || "").trim().toLowerCase();
  if (!day) return true; // unknown day: let the server decide
  return day === "cnf" || day === String(today).toLowerCase();
};

const STATUS = {
  pending: { label: "Waiting for admin approval", color: "amber" },
  approved: { label: "Approved — you can add the sale", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  used: { label: "Approval already used", color: "slate" },
};

/**
 * Shown when Add Sales is blocked because an outlet belongs to another day's bit.
 * The user sends a request; once admin approves every outlet, "Add Sales" retries the save.
 * With the "Own Permission (Other-Day Bit)" permission the user can instead give a reason and
 * add the sale straight away (no admin approval); admin sees it under Other-day requests.
 */
function OtherDayBitDialog({
  open, staffId, saleDate, todayDay, reason, outlets, initialRequests, onClose, onRetry, retrying, canOwnPermission, onOwnPermission,
}) {
  const [requests, setRequests] = useState([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [ownMode, setOwnMode] = useState(false);
  const [ownNote, setOwnNote] = useState("");

  useEffect(() => {
    if (open) {
      setRequests(initialRequests || []);
      setNote("");
      setError("");
      setOwnMode(Boolean(canOwnPermission));
      setOwnNote("");
    }
  }, [open, initialRequests, canOwnPermission]);

  const addOnOwnPermission = async () => {
    const text = ownNote.trim();
    if (!text) {
      setError("Enter the reason for adding this sale on your own permission.");
      return;
    }
    setError("");
    await onOwnPermission(text);
  };

  const requestByOutlet = useMemo(() => {
    const map = new Map();
    requests.forEach((request) => map.set(Number(request.outlet_id), request));
    return map;
  }, [requests]);

  const states = outlets.map((outlet) => requestByOutlet.get(Number(outlet.outletId))?.status || "none");
  const allApproved = states.length > 0 && states.every((status) => status === "approved");
  const anyPending = states.some((status) => status === "pending");
  const needsRequest = states.some((status) => ["none", "rejected", "used"].includes(status));

  const refresh = async () => {
    if (!staffId || !outlets.length) return;
    try {
      const params = new URLSearchParams({
        staffId: String(staffId),
        saleDate,
        outletIds: outlets.map((outlet) => outlet.outletId).join(","),
      });
      const response = await fetch(`${API}/staff/other-day-requests?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) setRequests(data.requests || []);
    } catch (err) {
      console.error("Error loading other-day bit requests:", err);
    }
  };

  // While waiting for admin, check every 15 seconds.
  useEffect(() => {
    if (!open || !anyPending) return undefined;
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anyPending, staffId, saleDate, outlets]);

  const sendRequest = async () => {
    const reason = note.trim();
    if (!reason) {
      setError("Reason for request is required.");
      return;
    }
    const outletIds = outlets
      .filter((outlet) => {
        const status = requestByOutlet.get(Number(outlet.outletId))?.status;
        return !status || ["rejected", "used"].includes(status);
      })
      .map((outlet) => outlet.outletId);

    setSending(true);
    setError("");
    try {
      const response = await fetch(`${API}/staff/other-day-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, saleDate, outletIds, note: reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send the request.");
      setRequests((prev) => {
        const merged = new Map(prev.map((request) => [Number(request.outlet_id), request]));
        (data.requests || []).forEach((request) => merged.set(Number(request.outlet_id), request));
        return [...merged.values()];
      });
      setNote("");
    } catch (err) {
      setError(err.message || "Unable to send the request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open} onClose={onClose} locked={sending || retrying} size="lg"
      title={`${ownMode ? "Add on Your Own Permission" : "Admin Approval Required"} — ${reason === "other_date" ? "Other Date" : "Other Day Bit"}`}
      actions={(
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={btn.ghost} onClick={onClose} disabled={sending || retrying}>Close</button>
          {ownMode ? (
            <button type="button" className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} onClick={addOnOwnPermission} disabled={retrying || !ownNote.trim()}>
              <Icon name="verified_user" className="text-[17px]" />{retrying ? "Saving..." : "Add Sales on My Permission"}
            </button>
          ) : null}
          {!ownMode && anyPending && (
            <button type="button" className={btn.outline} onClick={refresh} disabled={sending || retrying}>
              <Icon name="refresh" className="text-[17px]" />Check Status
            </button>
          )}
          {!ownMode && needsRequest && (
            <button type="button" className={btn.primary} onClick={sendRequest} disabled={sending || retrying || !note.trim()}>
              <Icon name="send" className="text-[17px]" />{sending ? "Sending..." : "Send Request"}
            </button>
          )}
          {!ownMode && (
            <button type="button" className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} onClick={onRetry} disabled={retrying || !allApproved}>
              <Icon name={allApproved ? "check_circle" : "lock"} className="text-[17px]" />{retrying ? "Saving..." : "Add Sales"}
            </button>
          )}
        </div>
      )}
    >
      {canOwnPermission && (
        <div className="mb-4 inline-flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="How to add">
          <button type="button" role="tab" aria-selected={ownMode} onClick={() => { setOwnMode(true); setError(""); }} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${ownMode ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <Icon name="verified_user" className="text-[16px]" />Own permission
          </button>
          <button type="button" role="tab" aria-selected={!ownMode} onClick={() => { setOwnMode(false); setError(""); }} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${!ownMode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <Icon name="send" className="text-[16px]" />Ask admin instead
          </button>
        </div>
      )}
      {ownMode && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
          <p className="m-0 text-[13px] font-bold text-emerald-800">You can add this sale without admin approval.</p>
          <p className="m-0 mb-2.5 mt-0.5 text-[12px] text-slate-600">Give the reason below. Admin can see every sale added on own permission (Other-day requests, Own permission).</p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your reason *</span>
            <textarea
              rows={2} className={`${fieldClass} h-auto py-2`} value={ownNote}
              placeholder="e.g. Outlet was closed on its bit day, delivery requested today"
              onChange={(event) => {
                setOwnNote(event.target.value);
                setError("");
              }}
            />
          </label>
        </div>
      )}
      <p className="m-0 mb-4 text-[13px] text-slate-600">
        {reason === "other_date" ? (
          <>
            You can add sales directly only for <strong>today&apos;s date</strong> ({todayDate()}). This entry is for{" "}
            <strong>{saleDate}</strong>, so send a request to admin. Once it is approved, you can add the
            sale for these outlets on {saleDate}.
          </>
        ) : (
          <>
            Today is <strong>{todayDay || todayDayName()}</strong>. You can add sales directly only for
            today&apos;s bit. The outlets below belong to another day&apos;s bit, so send a request to
            admin. Once it is approved, you can add the sale for these outlets on {saleDate}.
          </>
        )}
      </p>

      <div className="space-y-2">
        {outlets.map((outlet) => {
          const request = requestByOutlet.get(Number(outlet.outletId));
          const statusInfo = request ? STATUS[request.status] : null;
          return (
            <div key={outlet.outletId} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block text-[13px] font-bold text-slate-900">{outlet.outletName}</span>
                  <span className="block text-[12px] text-slate-500">ERP: {outlet.outletErpId || "—"} · Bit: {outlet.outletDay || "—"}</span>
                </div>
                {statusInfo && <Badge tone={statusInfo.color}>{statusInfo.label}</Badge>}
              </div>
              {request?.status === "rejected" && request.review_note && (
                <p className="m-0 mt-1 text-[12px] font-medium text-red-700">Admin: {request.review_note}</p>
              )}
            </div>
          );
        })}
      </div>

      {needsRequest && !ownMode && (
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reason for request *</span>
          <textarea
            rows={2} className={`${fieldClass} h-auto py-2`} value={note}
            placeholder="e.g. Outlet was closed on its bit day, delivery requested today"
            onChange={(event) => {
              setNote(event.target.value);
              setError("");
            }}
          />
        </label>
      )}
      {error && <Notice tone="error" className="mt-3">{error}</Notice>}
    </Modal>
  );
}

OtherDayBitDialog.defaultProps = {
  todayDay: "",
  reason: "other_day",
  initialRequests: [],
  retrying: false,
  canOwnPermission: false,
  onOwnPermission: async () => {},
};

OtherDayBitDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  staffId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  saleDate: PropTypes.string.isRequired,
  todayDay: PropTypes.string,
  reason: PropTypes.string,
  outlets: PropTypes.arrayOf(PropTypes.object).isRequired,
  initialRequests: PropTypes.arrayOf(PropTypes.object),
  onClose: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
  retrying: PropTypes.bool,
  canOwnPermission: PropTypes.bool,
  onOwnPermission: PropTypes.func,
};

export default OtherDayBitDialog;
