"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
type Row = Record<string, any>;
const PAGE = 40;
function csv(name: string, rows: Row[]) {
  if (!rows.length) return;
  const fields = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const data = [fields, ...rows.map((r) => fields.map((k) => r[k]))]
    .map((r) => r.map(cell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + data], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Home() {
  const db = useMemo(() => createBrowserClient(), []);
  const [user, setUser] = useState<Row | null>(null),
    [authReady, setAuthReady] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [brands, setBrands] = useState<Row[]>([]),
    [members, setMembers] = useState<Row[]>([]),
    [brandId, setBrandId] = useState(""),
    [accessReady, setAccessReady] = useState(false);
  const [tab, setTab] = useState("Overview"),
    [rows, setRows] = useState<Row[]>([]),
    [stats, setStats] = useState<Row>({}),
    [count, setCount] = useState(0),
    [page, setPage] = useState(0),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [menu, setMenu] = useState(false),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Row | null>(null),
    [recipientPage, setRecipientPage] = useState(0),
    [sharing, setSharing] = useState<Row | null>(null),
    [sharePassword, setSharePassword] = useState(""),
    [shareUrl, setShareUrl] = useState(""),
    [creating, setCreating] = useState(false);
  const brand = brands.find((b) => b.id === brandId),
    owner = members.some((m) => m.brand_id === brandId && m.role === "owner");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}`);
      return;
    }
    if (params.has("auth_error")) setError("Google sign-in could not be completed. Please try again.");
    db.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthReady(true);
    });
    const { data } = db.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [db]);
  useEffect(() => {
    let cancelled = false;
    setAccessReady(false);
    setBrands([]);
    setMembers([]);
    setBrandId("");
    if (!user) return;
    Promise.all([
      db.from("brands").select("id,name,country,accent").order("name"),
      db.from("brand_members").select("brand_id,role").eq("user_id", user.id),
    ]).then(([b, m]) => {
      if (cancelled) return;
      if (b.error || m.error)
        setError(b.error?.message ?? m.error?.message ?? "Access unavailable");
      setBrands(b.data ?? []);
      setMembers(m.data ?? []);
      setBrandId(b.data?.[0]?.id ?? "");
      setAccessReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, db]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const timer = setInterval(() => setRevision((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  function tableRequest(offset: number, size: number) {
    const contacts = tab === "Contacts",
      imports = tab === "Imports";
    let req = db
      .from(
        contacts
          ? "contact_eligibility"
          : imports
            ? "import_runs"
            : "campaign_results",
      )
      .select(
        contacts
          ? "id,external_id,full_name,email,phone,country,city,status,consent_marketing,signup_at,eligible"
          : imports
            ? "id,source_file,rows_seen,rows_imported,rows_skipped,errors,created_at"
            : "*",
        { count: "exact" },
      )
      .eq("brand_id", brandId);
    if (search && !imports) {
      const safe = search.replace(/[%_,().]/g, " ");
      req = contacts
        ? req.or(
            `full_name.ilike.%${safe}%,email.ilike.%${safe}%,external_id.ilike.%${safe}%`,
          )
        : req.ilike("campaign_name", `%${safe}%`);
    }
    return req
      .order(imports ? "created_at" : "id", { ascending: !imports })
      .range(offset, offset + size - 1);
  }
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      db.rpc("workspace_stats", { target: brandId }),
      tableRequest(page * PAGE, PAGE),
    ])
      .then(([s, r]) => {
        if (cancelled) return;
        if (s.error || r.error) {
          setError(
            s.error?.message ?? r.error?.message ?? "Unable to load data",
          );
          setRows([]);
          setStats({});
        } else {
          setStats(s.data ?? {});
          setRows(r.data ?? []);
          setCount(r.count ?? 0);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, tab, page, search, revision, db]);
  async function api(path: string, body: Row) {
    const {
      data: { session },
    } = await db.auth.getSession();
    const r = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: string) {
    setTab(next);
    setPage(0);
    setQuery("");
    setSearch("");
    setRows([]);
    setPreview(null);
    setSharing(null);
    setMenu(false);
  }
  async function signOut() {
    const { error: e } = await db.auth.signOut();
    if (e) setError(e.message);
    else setUser(null);
  }
  async function exportRows() {
    await action(async () => {
      let all: Row[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: e } = await tableRequest(offset, 500);
        if (e) throw e;
        all = all.concat(data ?? []);
        if ((data?.length ?? 0) < 500) break;
      }
      if (!all.length) throw new Error("No matching rows to export");
      csv(`${brand?.name}-${tab.toLowerCase()}.csv`, all);
      setNotice(`Exported ${all.length.toLocaleString()} matching rows.`);
    });
  }
  if (!authReady)
    return (
      <main className="auth-screen">
        <div className="auth-card">Checking session…</div>
      </main>
    );
  if (!user)
    return (
      <main className="auth-screen">
        <form
          className="auth-card"
          onSubmit={(e) => {
            e.preventDefault();
            action(async () => {
              const { error: e } = await db.auth.signInWithPassword({
                email,
                password,
              });
              if (e) throw e;
            });
          }}
        >
          <div className="eyebrow">VELOCITY GROWTH</div>
          <h1>Welcome back</h1>
          <p>Sign in to your brand workspace.</p>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            Sign in
          </button>
          <div className="or">or</div>
          <button
            type="button"
            className="google"
            onClick={() =>
              action(async () => {
                const { error: e } = await db.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin },
                });
                if (e) throw e;
              })
            }
          >
            Continue with Google
          </button>
          <p className="auth-note">
            Access is limited to the six assigned team members. Contact your
            administrator for access.
          </p>
        </form>
      </main>
    );
  if (!accessReady)
    return (
      <main className="auth-screen">
        <div className="auth-card">Checking workspace access…</div>
      </main>
    );
  if (!brands.length)
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <h1>Access not assigned</h1>
          <p>Your account has no brand membership.</p>
          <button className="primary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brandmark">
          <span>V</span>velocity growth
        </div>
        <nav aria-label="Workspace">
          {["Overview", "Campaigns", "Contacts", "Imports", "Settings"].map(
            (t) => (
              <button
                key={t}
                className={tab === t ? "nav active" : "nav"}
                onClick={() => navigate(t)}
              >
                {t}
              </button>
            ),
          )}
        </nav>
        <div className="side-label brand-label">YOUR WORKSPACE</div>
        {brands.map((b) => (
          <button
            className="brand-row"
            key={b.id}
            onClick={() => {
              setBrandId(b.id);
              navigate("Overview");
            }}
          >
            <span className="dot" style={{ background: b.accent }} />
            {b.name}
          </button>
        ))}
        <div className="sidebar-bottom">
          <button
            className="nav"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {user.email?.split("@")[0]} {menu ? "▴" : "▾"}
          </button>
          {menu && (
            <div className="account-menu">
              <p>{user.email}</p>
              <button className="nav" onClick={() => navigate("Settings")}>
                Settings
              </button>
              <button className="nav" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              {brand?.name} / {owner ? "OWNER" : "ANALYST"}
            </div>
            <h1>{tab}</h1>
          </div>
          <button className="outline" onClick={signOut}>
            Sign out
          </button>
        </header>
        <nav className="mobile-nav" aria-label="Mobile workspace">
          {["Overview", "Campaigns", "Contacts", "Imports", "Settings"].map(
            (t) => (
              <button
                key={t}
                className={tab === t ? "nav active" : "nav"}
                onClick={() => navigate(t)}
              >
                {t}
              </button>
            ),
          )}
        </nav>
        <div className="page">
          {error && (
            <div role="alert" className="error">
              {error}
              <button
                className="link"
                onClick={() => setRevision((v) => v + 1)}
              >
                Retry loading
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="success-notice">
              {notice}
            </p>
          )}
          {tab === "Settings" ? (
            <section className="card">
              <h2>Account and access</h2>
              <p>{user.email}</p>
              <p>
                {brand?.name} · {brand?.country}
              </p>
              <p>
                Role:{" "}
                {owner
                  ? "Owner — may approve sends and publish results"
                  : "Analyst — read-only access"}
              </p>
              <p>
                Email/password and Google sign-in are supported for assigned
                users. Notification delivery is not configured.
              </p>
              <button className="outline" onClick={signOut}>
                Sign out
              </button>
            </section>
          ) : (
            <>
              {tab === "Overview" && (
                <>
                  <div className="metrics">
                    <div className="metric">
                      <span>Total customers</span>
                      <strong>
                        {loading ? "…" : (stats.total?.toLocaleString() ?? "—")}
                      </strong>
                      <small>
                        One valid imported row per brand + external ID,
                        including archived contacts
                      </small>
                    </div>
                    <div className="metric">
                      <span>Contactable customers</span>
                      <strong>
                        {loading
                          ? "…"
                          : (stats.contactable?.toLocaleString() ?? "—")}
                      </strong>
                      <small>
                        Active, opted-in, not deleted or currently suppressed;
                        bounce, complaint and unsubscribe events exclude contact
                      </small>
                    </div>
                  </div>
                  <section className="card">
                    <h2>Signups per day</h2>
                    <p>
                      Last 30 calendar days in UTC, including today. Counts use
                      signup time.
                    </p>
                    <div className="signup-chart">
                      {(stats.signups ?? []).map((p: Row) => (
                        <div key={p.day} title={`${p.day}: ${p.count}`}>
                          <i
                            style={{
                              height: `${Number(p.count) ? Math.max(2, (Number(p.count) / Math.max(1, ...stats.signups.map((s: Row) => Number(s.count)))) * 120) : 0}px`,
                            }}
                          />
                          <small>{String(p.day).slice(5)}</small>
                        </div>
                      ))}
                    </div>
                    <details>
                      <summary>View daily counts</summary>
                      {(stats.signups ?? []).map((p: Row) => (
                        <p key={p.day}>
                          {p.day}: {p.count}
                        </p>
                      ))}
                    </details>
                  </section>
                </>
              )}
              <div className="welcome">
                <div>
                  <h2>
                    {tab === "Overview"
                      ? "Campaign performance"
                      : tab === "Imports"
                        ? "Import history"
                        : tab}
                  </h2>
                  <p>{count.toLocaleString()} matching records</p>
                </div>
                <div className="action-row">
                  {tab !== "Imports" && (
                    <button
                      className="ghost"
                      disabled={busy || loading}
                      onClick={exportRows}
                    >
                      Export {tab === "Contacts" ? "contacts" : "campaigns"}
                    </button>
                  )}
                  {tab === "Campaigns" && owner && (
                    <button
                      className="primary"
                      onClick={() => setCreating(true)}
                    >
                      New campaign
                    </button>
                  )}
                </div>
              </div>
              {["Contacts", "Campaigns"].includes(tab) && (
                <label className="searchbar">
                  Search
                  <input
                    aria-label={`Search ${tab.toLowerCase()}`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      tab === "Contacts"
                        ? "Name, email or external ID"
                        : "Campaign name"
                    }
                  />
                </label>
              )}
              {loading ? (
                <p role="status">Loading…</p>
              ) : !rows.length ? (
                <div className="empty-state">No records match this view.</div>
              ) : (
                <section className="card table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {(tab === "Contacts"
                          ? ["Contact", "Status", "Contactable", "Signup"]
                          : tab === "Imports"
                            ? [
                                "File",
                                "Seen / applied / skipped",
                                "Diagnostics",
                                "Imported",
                              ]
                            : [
                                "Campaign",
                                "Sent",
                                "Delivered",
                                "Bounced",
                                "Opens",
                                "Clicks",
                                "State",
                                "Actions",
                              ]
                        ).map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          {tab === "Contacts" ? (
                            <>
                              <td>
                                <b>{r.full_name || "Unnamed contact"}</b>
                                <small>{r.email || r.phone}</small>
                                <small>{r.external_id}</small>
                              </td>
                              <td>{r.status || "Unknown"}</td>
                              <td>
                                {r.eligible
                                  ? "Yes (channel eligibility checked at send)"
                                  : "No"}
                              </td>
                              <td>
                                {r.signup_at
                                  ? new Date(r.signup_at).toLocaleDateString()
                                  : "Unknown"}
                              </td>
                            </>
                          ) : tab === "Imports" ? (
                            <>
                              <td>{r.source_file}</td>
                              <td>
                                {r.rows_seen} / {r.rows_imported} /{" "}
                                {r.rows_skipped}
                              </td>
                              <td>
                                <details>
                                  <summary>
                                    {r.errors?.length ?? 0} issues
                                  </summary>
                                  <pre>{JSON.stringify(r.errors, null, 2)}</pre>
                                </details>
                              </td>
                              <td>{new Date(r.created_at).toLocaleString()}</td>
                            </>
                          ) : (
                            <>
                              <td>
                                <b>{r.campaign_name}</b>
                                <small>
                                  {r.channel} ·{" "}
                                  {r.sent_at_utc
                                    ? new Date(
                                        r.sent_at_utc,
                                      ).toLocaleDateString()
                                    : "Draft"}
                                </small>
                                <small>{r.metric_basis}</small>
                              </td>
                              <td>{r.reported_sent}</td>
                              <td>{r.reported_delivered}</td>
                              <td>{r.reported_bounced}</td>
                              <td>{r.reported_opens}</td>
                              <td>{r.reported_clicks}</td>
                              <td>
                                {r.dispatch_state ??
                                  (r.sent_at_utc ? "Imported" : "Draft")}
                                <small>
                                  {r.approved_count != null
                                    ? `Approved: ${r.approved_count}; rejected: ${r.rejected_count}`
                                    : ""}
                                </small>
                                <small>{r.last_error}</small>
                                <small>
                                  {r.last_polled_at
                                    ? `Last sync: ${new Date(r.last_polled_at).toLocaleString()}`
                                    : ""}
                                </small>
                                {r.dispatch_id && (
                                  <details>
                                    <summary>Approval record</summary>
                                    <code>{r.dispatch_id}</code>
                                    <button
                                      className="link"
                                      onClick={() =>
                                        action(async () => {
                                          const { data, error: e } = await db
                                            .from("dispatches")
                                            .select(
                                              "recipients,report_warnings",
                                            )
                                            .eq("id", r.dispatch_id)
                                            .single();
                                          if (e) throw e;
                                          csv(
                                            "approved-recipients.csv",
                                            data.recipients,
                                          );
                                          setNotice(
                                            `Provider diagnostics: ${JSON.stringify(data.report_warnings)}`,
                                          );
                                        })
                                      }
                                    >
                                      Export approved audience
                                    </button>
                                  </details>
                                )}
                              </td>
                              <td>
                                {owner ? (
                                  <div className="action-row">
                                    <button
                                      className="outline"
                                      disabled={busy || !!r.dispatch_id}
                                      onClick={() =>
                                        action(async () => {
                                          const data = await api("/api/send", {
                                            action: "preview",
                                            brandId,
                                            campaignId: r.id,
                                          });
                                          setPreview(data);
                                          setRecipientPage(0);
                                        })
                                      }
                                    >
                                      Preview send
                                    </button>
                                    <button
                                      className="outline"
                                      disabled={busy}
                                      onClick={() => {
                                        setSharing(r);
                                        setShareUrl("");
                                        setSharePassword("");
                                      }}
                                    >
                                      Share results
                                    </button>
                                  </div>
                                ) : (
                                  "Read only"
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              <div className="pagination">
                <button
                  className="outline"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} of {Math.max(1, Math.ceil(count / PAGE))}
                </span>
                <button
                  className="outline"
                  disabled={(page + 1) * PAGE >= count || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
              {tab === "Imports" && (
                <p>
                  Imports run from the supplied seed files using the documented
                  importer. Repeated rows are upserted by brand and external ID;
                  malformed rows and normalization warnings appear here.
                </p>
              )}
            </>
          )}
        </div>
      </section>
      {preview && (
        <div className="modal-backdrop">
          <section
            className="modal wide-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Approve campaign"
          >
            <h2>{preview.campaign_name}</h2>
            <p>
              <b>{preview.recipient_count.toLocaleString()} recipients</b> in
              this frozen audience. Duplicated destinations are removed; channel
              and campaign country filters apply. Preview expires after 15
              minutes.
            </p>
            <div className="table-wrap">
              <table>
                <tbody>
                  {preview.recipients
                    .slice(recipientPage * 20, (recipientPage + 1) * 20)
                    .map((r: Row) => (
                      <tr key={r.external_id}>
                        <td>
                          {r.full_name}
                          <small>{r.external_id}</small>
                        </td>
                        <td>{r.email || r.phone}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                disabled={!recipientPage}
                onClick={() => setRecipientPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {recipientPage + 1}/{Math.ceil(preview.recipient_count / 20)}
              </span>
              <button
                disabled={(recipientPage + 1) * 20 >= preview.recipient_count}
                onClick={() => setRecipientPage((p) => p + 1)}
              >
                Next
              </button>
              <button
                onClick={() =>
                  csv("preview-recipients.csv", preview.recipients)
                }
              >
                Export audience
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="action-row">
              <button
                className="ghost"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const result = await api("/api/send", {
                      action: "approve",
                      previewId: preview.id,
                      count: preview.recipient_count,
                    });
                    setPreview(null);
                    setNotice(
                      `Approved. Delivery record ${result.id}. Progress refreshes automatically.`,
                    );
                    setRevision((v) => v + 1);
                  })
                }
              >
                {busy ? "Approving…" : "Approve exact audience"}
              </button>
            </div>
          </section>
        </div>
      )}
      {sharing && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Share results"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                const data = await api("/api/share", {
                  brandId,
                  campaignId: sharing.id,
                  password: sharePassword,
                });
                setShareUrl(`${window.location.origin}/share/${data.token}`);
              });
            }}
          >
            <h2>Share campaign results</h2>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p>
              {sharing.campaign_name}. Only this campaign’s aggregate results
              are exposed.
            </p>
            <label>
              Password (8+ characters)
              <input
                type="password"
                minLength={8}
                maxLength={256}
                required
                value={sharePassword}
                onChange={(e) => setSharePassword(e.target.value)}
              />
            </label>
            {shareUrl ? (
              <label>
                Copy this link
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            ) : (
              <button className="primary full" disabled={busy}>
                Create protected link
              </button>
            )}
            <button
              type="button"
              className="ghost full"
              onClick={() => setSharing(null)}
            >
              Close
            </button>
          </form>
        </div>
      )}
      {creating && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              action(async () => {
                const name = String(form.get("name")).trim();
                if (!name || name.length > 120)
                  throw new Error("Name must be 1–120 characters");
                const { error: e } = await db
                  .from("campaigns")
                  .insert({
                    brand_id: brandId,
                    external_id: crypto.randomUUID(),
                    campaign_name: name,
                    channel: form.get("channel"),
                  });
                if (e) throw e;
                setCreating(false);
                setRevision((v) => v + 1);
              });
            }}
          >
            <h2>New campaign</h2>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <label>
              Name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Channel
              <select name="channel">
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </label>
            <button className="primary full" disabled={busy}>
              Create draft
            </button>
            <button
              type="button"
              className="ghost full"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
