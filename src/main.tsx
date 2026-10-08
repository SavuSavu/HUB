import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Layers, LockKeyhole } from "lucide-react";
import { validAccessConfig, verifyPassword } from "./access";
import "./style.css";
const Dashboard = React.lazy(() => import("./App"));
function AccessGate() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const hash = import.meta.env.VITE_ACCESS_HASH ?? "";
  const salt = import.meta.env.VITE_ACCESS_SALT ?? "";
  const configured = validAccessConfig(hash, salt);
  const lock = () => {
    navigator.serviceWorker?.controller?.postMessage({
      type: "CANCEL_PREFETCH",
    });
    setUnlocked(false);
    setPassword("");
    setError("");
  };
  if (unlocked)
    return (
      <React.Suspense
        fallback={
          <div className="access-screen" role="status">
            Opening HUB…
          </div>
        }
      >
        <Dashboard onLock={lock} />
      </React.Suspense>
    );
  return (
    <div className="access-screen">
      <section className="access-card" aria-label="HUB login">
        <div className="brand">
          <span className="brand-icon">
            <Layers size={23} />
          </span>
          HUB<span className="brand-dot">.</span>
        </div>
        <div className="access-symbol">
          <LockKeyhole size={28} />
        </div>
        <p className="eyebrow">INVITATION ONLY</p>
        <h1>Welcome to HUB.</h1>
        <p className="access-intro">
          Enter the access password to open your watch universe.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !configured) return;
            if (Date.now() < retryAt) {
              setError("Please wait a few seconds before trying again.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              if (await verifyPassword(password, hash, salt)) {
                setPassword("");
                setFailures(0);
                setRetryAt(0);
                setUnlocked(true);
              } else {
                const attempts = failures + 1;
                setFailures(attempts);
                setRetryAt(Date.now() + Math.min(30_000, attempts * 1000));
                setError("Incorrect access password.");
                setPassword("");
              }
            } catch {
              setError(
                "Unable to verify access. Use a browser with Web Crypto on HTTPS or localhost.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="access-password">Access password</label>
          <input
            id="access-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={!configured || busy}
          />
          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}
          {!configured && (
            <p className="access-error" role="alert">
              Access has not been configured by the owner.
            </p>
          )}
          <button
            className="primary"
            type="submit"
            disabled={!configured || busy}
          >
            {busy ? "Checking access…" : "Log in"}
          </button>
        </form>
        <p className="access-footnote">
          Private entry for invited viewers. Ask the owner for access.
        </p>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccessGate />
  </React.StrictMode>,
);
