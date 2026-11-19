// Sign in: Tailwind CSS (no MUI). Captcha, email OTP step, remember me and the landing page per
// role are unchanged.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "context/AuthContext";

// PageLayout tells the app this is a full-screen page (no sidebar / top bar).
import PageLayout from "examples/LayoutContainers/PageLayout";
import { Icon } from "components/tw";

const COMPANY_NAME = "Bawarchee Food Packaging";
const inputClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15";
const labelClass = "mb-1.5 block text-[12.5px] font-semibold text-slate-700";
const primaryButton = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

const FEATURES = [
  ["inventory_2", "Stock & outlets", "Purchase, stock and outlet routes in one place."],
  ["local_shipping", "Sales & delivery", "Invoices, packing and delivery tracked live."],
  ["payments", "Collections", "Cash, online, cheque and credit dues at a glance."],
];

function Basic() {
  const [rememberMe, setRememberMe] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // Added for show/hide
  const [captcha, setCaptcha] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(null); // { otpSessionId, email, expiresAt, resendAt }
  const [otp, setOtp] = useState("");
  const [otpInfo, setOtpInfo] = useState("");
  const [now, setNow] = useState(Date.now());
  const navigate = useNavigate();
  const { login } = useAuth();

  const API = `${process.env.REACT_APP_API_URL}/auth`;

  const handleSetRememberMe = () => setRememberMe(!rememberMe);

  const fetchCaptcha = useCallback(async () => {
    try {
      const response = await fetch(`${API}/captcha`);
      if (response.ok) {
        const data = await response.json();
        setCaptcha(data);
        setCaptchaAnswer("");
      } else {
        setCaptcha(null);
      }
    } catch (err) {
      console.error("Error fetching CAPTCHA:", err);
      setCaptcha(null);
    }
  }, [API]);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  // Tick once a second while the OTP screen is open (expiry + resend timers).
  useEffect(() => {
    if (!otpStep) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [otpStep]);

  const otpSecondsLeft = otpStep ? Math.max(0, Math.ceil((otpStep.expiresAt - now) / 1000)) : 0;
  const resendSecondsLeft = otpStep ? Math.max(0, Math.ceil((otpStep.resendAt - now) / 1000)) : 0;
  const formatTimer = (seconds) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const startOtpStep = (data) => {
    const startedAt = Date.now();
    setOtpStep({
      otpSessionId: data.otpSessionId || otpStep?.otpSessionId,
      email: data.email,
      expiresAt: startedAt + (data.expiresInSeconds || 600) * 1000,
      resendAt: startedAt + (data.resendAfterSeconds || 60) * 1000,
    });
    setNow(startedAt);
    setOtp("");
  };

  const leaveOtpStep = () => {
    setOtpStep(null);
    setOtp("");
    setOtpInfo("");
    setError("");
    setPassword("");
    fetchCaptcha();
  };

  const finishLogin = (data) => {
    // Distributors stay signed in (even after closing the browser) until 1 day without use.
    login(data.user, data.token, data.refreshToken, rememberMe || data.user?.role === "distributor");
    // Distributor / CNF logins go to the Distributor Portal (a separate app at /distributor/).
    if (data.user?.role === "distributor") {
      window.location.replace("/distributor/");
      return;
    }
    const permissions = Array.isArray(data.user?.permissions) ? data.user.permissions : [];
    const destination =
      data.user?.role === "staff"
        ? "/purchase-requisition"
        : data.user?.role === "admin" || permissions.includes("dashboard")
          ? "/dashboard"
          : permissions.includes("dms") && permissions.includes("add_seller")
            ? "/add-seller"
            : permissions.includes("dms") && permissions.includes("add_item")
              ? "/add-item"
              : permissions.includes("dms") && permissions.includes("item_list")
                ? "/dms-stock"
                : permissions.includes("update_payment")
                  ? "/update-payment"
                  : permissions.includes("bank_deposit")
                    ? "/bank-deposit"
                    : permissions.includes("out_bill")
                      ? "/out-bill"
                      : permissions.includes("requisition_approval")
                        ? "/requisition-approvals"
                      : permissions.includes("add_outlet")
                        ? "/add-outlet"
                        : permissions.includes("add_sales")
                          ? "/add-sales"
                          : "/welcome";
    navigate(destination, { replace: true });
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setOtpInfo("");
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit OTP sent to your email.");
      return;
    }
    if (otpSecondsLeft <= 0) {
      setError("OTP has expired. Request a new one.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API}/login/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpSessionId: otpStep.otpSessionId, otp: otp.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        finishLogin(data);
        return;
      }
      setError(data.error || "Invalid OTP");
      if (/sign in again/i.test(data.error || "")) {
        setOtpStep(null);
        setPassword("");
        fetchCaptcha();
      }
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpStep || resendSecondsLeft > 0) return;
    setError("");
    setOtpInfo("");
    setLoading(true);
    try {
      const response = await fetch(`${API}/login/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpSessionId: otpStep.otpSessionId }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        startOtpStep(data);
        setOtpInfo(`A new OTP has been sent to ${data.email}.`);
      } else {
        setError(data.error || "Could not resend OTP.");
        if (/sign in again/i.test(data.error || "")) {
          setOtpStep(null);
          setPassword("");
          fetchCaptcha();
        }
      }
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!captcha?.captchaId || !captchaAnswer.trim()) {
      setError("Please solve the CAPTCHA.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          captchaId: captcha.captchaId,
          captchaAnswer,
          rememberMe,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.otpRequired) {
          startOtpStep(data);
          setOtpInfo(`We sent a 6-digit OTP to ${data.email}.`);
          return;
        }
        finishLogin(data);
      } else {
        const err = await response.json().catch(() => ({}));
        setError(err.error || "Invalid login credentials");
        fetchCaptcha();
      }
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout background="white">
      <div className="grid min-h-dvh grid-cols-1 bg-slate-50 font-[Poppins,Roboto,sans-serif] lg:grid-cols-[1.1fr_1fr]">
        {/* Brand panel */}
        <aside className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="pointer-events-none absolute -right-32 -top-32 size-[420px] rounded-full bg-blue-600/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-24 size-[380px] rounded-full bg-sky-500/20 blur-3xl" />

          <div className="relative">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.2em] text-blue-300">Sales ERP</p>
            <p className="m-0 mt-1 text-[22px] font-bold">{COMPANY_NAME}</p>
          </div>

          <div className="relative max-w-xl">
            <h1 className="m-0 text-[40px] font-bold leading-[1.12] tracking-tight xl:text-[46px]">
              Every sale, delivery and collection, <span className="text-blue-400">in one place.</span>
            </h1>
            <p className="m-0 mt-4 text-[15px] leading-relaxed text-slate-300">
              A secure workspace for your team to keep stock, outlets, invoicing, delivery, collections and reports in step.
            </p>
            <ul className="m-0 mt-8 list-none space-y-3 p-0">
              {FEATURES.map(([icon, title, text]) => (
                <li key={title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><Icon name={icon} /></span>
                  <span>
                    <span className="block text-[14px] font-semibold">{title}</span>
                    <span className="block text-[13px] text-slate-400">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-center justify-between text-[12px] text-slate-500">
            <span>© {new Date().getFullYear()} EduNextG India LLP. Authorized access only.</span>
            <span className="inline-flex items-center gap-1"><Icon name="lock" className="text-[15px]" />Protected connection</span>
          </div>
        </aside>

        {/* Form */}
        <main className="flex items-center justify-center bg-white p-6 sm:p-10">
          <div className="w-full max-w-[420px]">
            <div className="mb-6 lg:hidden">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">Sales ERP</p>
              <p className="m-0 mt-0.5 text-[19px] font-bold text-slate-900">{COMPANY_NAME}</p>
            </div>

            <div>
              {otpStep ? (
                <form onSubmit={handleVerifyOtp}>
                  <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon name="mark_email_read" className="text-[24px]" /></span>
                  <h2 className="m-0 text-[24px] font-bold text-slate-900">Check your email</h2>
                  <p className="m-0 mt-1.5 text-[13.5px] text-slate-500">
                    Enter the 6-digit code sent to <b className="text-slate-800">{otpStep.email}</b>.
                  </p>

                  <label htmlFor="otp" className={`${labelClass} mt-6`}>One-time password</label>
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                  <input
                    id="otp" type="text" inputMode="numeric" maxLength={6} placeholder="••••••" autoFocus required autoComplete="one-time-code"
                    className={`${inputClass} h-14 text-center font-mono text-[24px] tracking-[0.6em]`}
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <div className="mt-2 flex items-center justify-between text-[12.5px]">
                    <span className={`inline-flex items-center gap-1 font-medium ${otpSecondsLeft > 0 ? "text-slate-500" : "text-red-600"}`}>
                      <Icon name="schedule" className="text-[15px]" />
                      {otpSecondsLeft > 0 ? `Expires in ${formatTimer(otpSecondsLeft)}` : "OTP expired"}
                    </span>
                    <button
                      type="button" onClick={handleResendOtp} disabled={loading || resendSecondsLeft > 0}
                      className="font-semibold text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {resendSecondsLeft > 0 ? `Resend in ${resendSecondsLeft}s` : "Resend OTP"}
                    </button>
                  </div>

                  {otpInfo && !error && (
                    <p role="status" className="m-0 mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
                      <Icon name="check_circle" className="text-[18px]" />{otpInfo}
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="m-0 mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
                      <Icon name="error_outline" className="text-[18px]" />{error}
                    </p>
                  )}

                  <button type="submit" className={`${primaryButton} mt-6`} disabled={loading || otpSecondsLeft <= 0}>
                    {loading ? "Verifying..." : "Verify & sign in"}
                  </button>
                  <button type="button" onClick={leaveOtpStep} disabled={loading} className="mt-3 inline-flex w-full items-center justify-center gap-1 text-[13px] font-semibold text-slate-600 hover:text-slate-900">
                    <Icon name="arrow_back" className="text-[17px]" />Back to sign in
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit}>
                  <h2 className="m-0 text-[26px] font-bold text-slate-900">Welcome back</h2>
                  <p className="m-0 mt-1.5 text-[13.5px] text-slate-500">Sign in with your assigned account to continue.</p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="account-id" className={labelClass}>Account ID</label>
                      <div className="relative">
                        <Icon name="person" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[19px] text-slate-400" />
                        <input
                          id="account-id" type="text" required autoComplete="username" placeholder="Email, staff ID, delivery ID, or login ID"
                          className={`${inputClass} pl-10`} value={email} onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="password" className={labelClass}>Password</label>
                      <div className="relative">
                        <Icon name="lock" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[19px] text-slate-400" />
                        <input
                          id="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Enter your password"
                          className={`${inputClass} pl-10 pr-11`} value={password} onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-[19px]" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
                        <Icon name="verified_user" className="text-[17px] text-blue-600" />Security verification
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex h-11 grow select-none items-center justify-center rounded-xl border border-dashed border-slate-400 bg-[repeating-linear-gradient(135deg,#fff,#fff_8px,#f1f5f9_8px,#f1f5f9_16px)] font-mono text-[20px] font-bold tracking-[0.25em] text-slate-900">
                          {captcha?.question || "......"}
                        </div>
                        <button
                          type="button" onClick={fetchCaptcha} aria-label="Refresh security code" title="New code"
                          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-blue-600 transition hover:bg-blue-50"
                        >
                          <Icon name="refresh" />
                        </button>
                      </div>
                      <input
                        type="text" required autoComplete="off" placeholder="Enter the code shown above" aria-label="Security code"
                        className={`${inputClass} mt-2`} value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)}
                        onPaste={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()}
                      />
                    </div>
                  </div>

                  {error && (
                    <p role="alert" className="m-0 mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
                      <Icon name="error_outline" className="text-[18px]" />{error}
                    </p>
                  )}

                  <label className="mt-4 flex w-fit cursor-pointer select-none items-center gap-2.5 text-[13px] text-slate-600">
                    <span className="relative inline-flex items-center">
                      <input type="checkbox" className="peer sr-only" checked={rememberMe} onChange={handleSetRememberMe} />
                      <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40" />
                      <span className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                    </span>
                    Remember me
                  </label>

                  <button type="submit" className={`${primaryButton} mt-5`} disabled={loading}>
                    {loading ? "Signing in..." : <>Sign in<Icon name="arrow_forward" className="text-[18px]" /></>}
                  </button>

                  <p className="m-0 mt-5 border-t border-slate-100 pt-4 text-center text-[12.5px] text-slate-500">
                    Having trouble signing in? Contact your system administrator.
                  </p>
                </form>
              )}
            </div>

            <p className="m-0 mt-5 text-center text-[12px] text-slate-400 lg:hidden">© {new Date().getFullYear()} EduNextG India LLP. Authorized access only.</p>
          </div>
        </main>
      </div>
    </PageLayout>
  );
}

export default Basic;
