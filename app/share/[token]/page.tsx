"use client";

import { FormEvent, useEffect, useState } from "react";

export default function SharedCampaignResults({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    params.then(({ token: value }) => setToken(value));
  }, [params]);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) setError(payload.error ?? "Unable to unlock results");
      else setResult(payload.campaign);
    } catch {
      setError("Unable to reach results. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark auth-brand">
          <span>V</span>
          <div>
            velocity<span className="muted">growth</span>
          </div>
        </div>
        {result ? (
          <>
            <div className="eyebrow">SHARED CAMPAIGN RESULTS</div>
            <h1>{result.campaign_name}</h1>
            <p>
              {result.channel} ·{" "}
              {result.sent_at_utc
                ? new Date(result.sent_at_utc).toLocaleDateString()
                : "Not sent"}
            </p>
            <p>{result.metric_basis}</p>
            <div className="metrics">
              <div className="metric">
                <span>Sent</span>
                <strong>{result.reported_sent}</strong>
              </div>
              <div className="metric">
                <span>Delivered</span>
                <strong>{result.reported_delivered}</strong>
              </div>
              <div className="metric">
                <span>Opens</span>
                <strong>{result.reported_opens}</strong>
              </div>
              <div className="metric">
                <span>Clicks</span>
                <strong>{result.reported_clicks}</strong>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow">PROTECTED RESULTS</div>
            <h1>Enter password</h1>
            <p>This campaign report is shared securely by Velocity Growth.</p>
            <form onSubmit={unlock}>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error && <div className="error">{error}</div>}
              <button className="primary full" type="submit" disabled={busy}>
                {busy ? "Loading…" : "View results"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
