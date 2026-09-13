"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  Download,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Plus,
  Search,
  Settings as SettingsIcon,
  Users,
  X,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

type Brand = {
  id: string;
  name: string;
  country: string;
  accent: string;
  customers: number;
  contactable: number;
};
type Campaign = {
  id: string;
  campaign_name: string;
  channel: string;
  reported_sent: number;
  reported_delivered: number;
  reported_opens: number;
  reported_clicks: number;
  sent_at_utc: string | null;
};
type Contact = {
  id: string;
  external_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string | null;
  consent_marketing: boolean;
  signup_at: string | null;
};
type SignupPoint = { label: string; count: number };

const fallbackBrands: Brand[] = [
  {
    id: "kilele",
    name: "Kilele Rides",
    country: "Kenya",
    accent: "#ff6542",
    customers: 0,
    contactable: 0,
  },
  {
    id: "karoo",
    name: "Karoo Coaches",
    country: "South Africa",
    accent: "#3a8bff",
    customers: 0,
    contactable: 0,
  },
  {
    id: "marrakech",
    name: "Marrakech Express",
    country: "Morocco",
    accent: "#a97bff",
    customers: 0,
    contactable: 0,
  },
];
const number = new Intl.NumberFormat("en-US");
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "Not sent";
function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null>>,
) {
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Home() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const supabase = useMemo(() => createBrowserClient(), []);
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUser(data.user))
      .finally(() => setAuthLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null),
    );
    return () => listener.subscription.unsubscribe();
  }, [supabase]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setAuthError(error.message);
    else setUser(data.user);
  }
  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
  }
  if (authLoading || !user)
    return (
      <AuthScreen
        loading={authLoading}
        email={email}
        password={password}
        error={authError}
        setEmail={setEmail}
        setPassword={setPassword}
        signIn={signIn}
        google={google}
      />
    );
  return <Portal user={user} supabase={supabase} />;
}

function Portal({
  user,
  supabase,
}: {
  user: { id: string; email?: string };
  supabase: ReturnType<typeof createBrowserClient>;
}) {
  const [brands, setBrands] = useState<Brand[]>(fallbackBrands);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [tab, setTab] = useState("Overview");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignQuery, setCampaignQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendCampaignId, setSendCampaignId] = useState("");
  const [memberRole, setMemberRole] = useState<"owner" | "analyst" | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendCount, setSendCount] = useState<number | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [signupSeries, setSignupSeries] = useState<SignupPoint[]>([]);
  const selectedBrand =
    brands.find((brand) => brand.id === selectedBrandId) ?? brands[0];
  const filteredCampaigns = campaigns.filter((campaign) =>
    `${campaign.campaign_name} ${campaign.channel}`
      .toLowerCase()
      .includes(campaignQuery.toLowerCase().trim()),
  );

  useEffect(() => {
    supabase
      .from("brands")
      .select("id,name,country,accent")
      .order("name")
      .then(({ data, error: queryError }) => {
        if (queryError || !data?.length) {
          setError(queryError?.message ?? "No brand workspaces are available.");
          setLoading(false);
          return;
        }
        setBrands(
          data.map((brand) => ({ ...brand, customers: 0, contactable: 0 })),
        );
        setSelectedBrandId(data[0].id);
      });
  }, [supabase]);
  useEffect(() => {
    if (!selectedBrand?.id) return;
    supabase.from("brand_members").select("role").eq("user_id", user.id).eq("brand_id", selectedBrand.id).maybeSingle().then(({ data }) => setMemberRole((data?.role as "owner" | "analyst" | null) ?? null));
  }, [selectedBrand?.id, supabase, user.id]);
  useEffect(() => {
    if (!selectedBrand?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", selectedBrand.id),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", selectedBrand.id)
        .eq("consent_marketing", true)
        .is("deleted_at", null)
        .is("suppressed_until", null),
      supabase
        .from("campaigns")
        .select(
          "id,campaign_name,channel,reported_sent,reported_delivered,reported_opens,reported_clicks,sent_at_utc",
        )
        .eq("brand_id", selectedBrand.id)
        .order("sent_at_utc", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("contacts")
        .select("signup_at")
        .eq("brand_id", selectedBrand.id)
        .gte("signup_at", new Date(Date.now() - 29 * 86400000).toISOString())
        .not("signup_at", "is", null)
        .limit(100000),
    ]).then(async ([total, contactable, campaignQuery, signups]) => {
      if (cancelled) return;
      if (total.error || contactable.error || campaignQuery.error || signups.error)
        setError("Some workspace data could not be loaded.");
      const points = Array.from({ length: 30 }, (_, index) => {
        const date = new Date(Date.now() - (29 - index) * 86400000);
        return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString("en", { month: "short", day: "numeric" }), count: 0 };
      });
      for (const signup of signups.data ?? []) {
        const point = points.find((item) => item.key === String(signup.signup_at).slice(0, 10));
        if (point) point.count += 1;
      }
      setSignupSeries(points.map(({ label, count }) => ({ label, count })));
      setBrands((current) =>
        current.map((brand) =>
          brand.id === selectedBrand.id
            ? {
                ...brand,
                customers: total.count ?? 0,
                contactable: contactable.count ?? 0,
              }
            : brand,
        ),
      );
      setCampaigns((campaignQuery.data ?? []) as Campaign[]);
      await loadContacts(selectedBrand.id, contactQuery);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBrand?.id, supabase]);
  async function loadContacts(brandId: string, query: string) {
    let request = supabase
      .from("contacts")
      .select(
        "id,external_id,full_name,email,phone,city,status,consent_marketing,signup_at",
      )
      .eq("brand_id", brandId)
      .order("signup_at", { ascending: false, nullsFirst: false })
      .limit(40);
    if (query.trim()) {
      const value = query.trim().replace(/[,()]/g, " ");
      request = request.or(
        `full_name.ilike.%${value}%,email.ilike.%${value}%,external_id.ilike.%${value}%`,
      );
    }
    const { data } = await request;
    setContacts((data ?? []) as Contact[]);
  }
  useEffect(() => {
    if (selectedBrand?.id && tab === "Contacts")
      loadContacts(selectedBrand.id, contactQuery);
  }, [contactQuery, tab, selectedBrand?.id]);
  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBrand) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const channel = String(form.get("channel") ?? "Email");
    if (!name) return;
    const { data, error: insertError } = await supabase
      .from("campaigns")
      .insert({
        brand_id: selectedBrand.id,
        external_id: `portal-${Date.now()}`,
        campaign_name: name,
        channel,
        target_country: selectedBrand.country,
      })
      .select(
        "id,campaign_name,channel,reported_sent,reported_delivered,reported_opens,reported_clicks,sent_at_utc",
      )
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCampaigns((current) => [data as Campaign, ...current]);
    setShowCreate(false);
    setTab("Campaigns");
  }
  async function sendCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const campaign = campaigns.find((item) => item.id === sendCampaignId);
    if (!selectedBrand || !campaign || memberRole !== "owner") return;
    setSendLoading(true);
    setError("");
    const { data: recipients, error: recipientError } = await supabase.from("contacts").select("external_id,email,phone").eq("brand_id", selectedBrand.id).eq("consent_marketing", true).is("deleted_at", null).is("suppressed_until", null);
    if (recipientError || !recipients?.length) {
      setError(recipientError?.message ?? "No contactable recipients are available.");
      setSendLoading(false);
      return;
    }
    const idempotencyKey = `${selectedBrand.id}:${campaign.id}:${user.id}`;
    const response = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrand.id, brandName: selectedBrand.name, campaignId: campaign.id, campaignName: campaign.campaign_name, idempotencyKey, approvedAt: new Date().toISOString(), recipients }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error ?? "The campaign could not be sent.");
    else setError(`Send recorded: ${payload.replayed ? "existing batch reused" : "provider accepted the batch"}.`);
    setSendLoading(false);
    setShowSend(false);
  }
  async function prepareSend(campaignId: string) {
    if (memberRole !== "owner" || !selectedBrand) return;
    const { count, error: countError } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("brand_id", selectedBrand.id).eq("consent_marketing", true).is("deleted_at", null).is("suppressed_until", null);
    if (countError) { setError(countError.message); return; }
    setSendCampaignId(campaignId);
    setSendCount(count ?? 0);
    setShowSend(true);
  }
  async function shareCampaign(campaignId: string) {
    if (memberRole !== "owner") return;
    const password = window.prompt("Set a password for this share link (8+ characters):") ?? "";
    if (password.length < 8) { setError("Share-link passwords must be at least 8 characters."); return; }
    setShareLoading(true);
    const response = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrand.id, campaignId, password }) });
    const payload = await response.json().catch(() => ({}));
    setShareLoading(false);
    if (!response.ok) setError(payload.error ?? "Could not create share link.");
    else window.prompt("Copy this protected results link:", `${window.location.origin}/share/${payload.token}`);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brandmark">
          <span>V</span>
          <div>
            velocity<span className="muted">growth</span>
          </div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav>
          {["Overview", "Campaigns", "Contacts", "Reports", "Settings"].map((item, i) => (
            <button
              key={item}
              className={tab === item ? "nav active" : "nav"}
              onClick={() => setTab(item)}
            >
              {i === 0 ? (
                <LayoutDashboard size={18} />
              ) : i === 1 ? (
                <Megaphone size={18} />
              ) : i === 2 ? (
                <Users size={18} />
              ) : i === 3 ? (
                <BarChart3 size={18} />
              ) : (
                <SettingsIcon size={18} />
              )}{" "}
              {item}
            </button>
          ))}
        </nav>
        <div className="side-label brand-label">BRANDS</div>
        {brands.map((brand) => (
          <button
            key={brand.id}
            className={
              selectedBrand?.id === brand.id
                ? "brand-row selected"
                : "brand-row"
            }
            onClick={() => {
              setSelectedBrandId(brand.id);
              setTab("Overview");
            }}
          >
            <span className="dot" style={{ background: brand.accent }} />
            <span>{brand.name}</span>
            <span className="country">{brand.country}</span>
          </button>
        ))}
        <div className="sidebar-bottom">
          <button className="help">
            <CircleHelp size={17} /> Help centre
          </button>
          <div style={{ position: "relative" }}>
            <button className="profile" style={{ cursor: "pointer", width: "100%", border: 0, background: "transparent" }} onClick={() => setProfileMenu((open) => !open)} aria-expanded={profileMenu}>
              <div className="avatar">{(user.email?.[0] ?? "M").toUpperCase()}</div>
              <div><strong>{user.email?.split("@")[0]}</strong><small>Authenticated user</small></div>
              <ChevronDown size={16} />
            </button>
            {profileMenu && <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 10, boxShadow: "0 12px 30px #17212b18", zIndex: 3 }}><small style={{ display: "block", color: "var(--muted)", padding: "4px 6px 8px", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</small><button className="ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => supabase.auth.signOut()}><LogOut size={14} /> Sign out</button></div>}
          </div>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              CLIENT PORTAL / {selectedBrand?.name.toUpperCase()}
            </div>
            <h1>{tab}</h1>
          </div>
          <div className="top-actions">
            <button className="outline" onClick={() => supabase.auth.signOut()}>
              <LogOut size={16} /> Sign out
            </button>
            <button className="primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New campaign
            </button>
          </div>
        </header>
        <div className="brand-banner">
          <div className="brand-title">
            <span
              className="large-dot"
              style={{ background: selectedBrand?.accent }}
            />
            <div>
              <h2>{selectedBrand?.name}</h2>
              <p>{selectedBrand?.country} · Live workspace</p>
            </div>
          </div>
          <span className="live-badge">
            <i /> Connected to Supabase
          </span>
        </div>
        {error && <div className="notice error">{error}</div>}
        {tab === "Overview" && (
          <Overview
            brand={selectedBrand}
            campaigns={campaigns}
            loading={loading}
            onCampaigns={() => setTab("Campaigns")}
            signupSeries={signupSeries}
            onExport={() =>
              downloadCsv(
                `${selectedBrand?.name}-campaign-report.csv`,
                ["Campaign", "Channel", "Sent", "Delivered", "Opens", "Clicks", "Sent date"],
                campaigns.map((campaign) => [campaign.campaign_name, campaign.channel, campaign.reported_sent, campaign.reported_delivered, campaign.reported_opens, campaign.reported_clicks, campaign.sent_at_utc]),
              )
            }
          />
        )}
        {tab === "Campaigns" && (
          <CampaignTable
            campaigns={filteredCampaigns}
            query={campaignQuery}
            setQuery={setCampaignQuery}
            loading={loading}
            onCreate={() => setShowCreate(true)}
            canSend={memberRole === "owner"}
            onSend={prepareSend}
            onShare={shareCampaign}
            shareLoading={shareLoading}
            onExport={() =>
              downloadCsv(
                `${selectedBrand?.name}-campaigns.csv`,
                ["Campaign", "Channel", "Sent", "Delivered", "Opens", "Clicks", "Sent date"],
                filteredCampaigns.map((campaign) => [campaign.campaign_name, campaign.channel, campaign.reported_sent, campaign.reported_delivered, campaign.reported_opens, campaign.reported_clicks, campaign.sent_at_utc]),
              )
            }
          />
        )}
        {tab === "Contacts" && (
          <Contacts
            brand={selectedBrand}
            contacts={contacts}
            query={contactQuery}
            setQuery={setContactQuery}
            loading={loading}
            onExport={() =>
              downloadCsv(
                `${selectedBrand?.name}-contacts.csv`,
                [
                  "Name",
                  "Email",
                  "Phone",
                  "City",
                  "Status",
                  "Marketing consent",
                  "Signup date",
                ],
                contacts.map((contact) => [
                  contact.full_name,
                  contact.email,
                  contact.phone,
                  contact.city,
                  contact.status,
                  contact.consent_marketing,
                  contact.signup_at,
                ]),
              )
            }
          />
        )}
        {tab === "Reports" && (
          <Overview
            brand={selectedBrand}
            campaigns={campaigns}
            loading={loading}
            onCampaigns={() => setTab("Campaigns")}
            signupSeries={signupSeries}
            onExport={() =>
              downloadCsv(
                `${selectedBrand?.name}-campaign-report.csv`,
                ["Campaign", "Channel", "Sent", "Delivered", "Opens", "Clicks", "Sent date"],
                campaigns.map((campaign) => [campaign.campaign_name, campaign.channel, campaign.reported_sent, campaign.reported_delivered, campaign.reported_opens, campaign.reported_clicks, campaign.sent_at_utc]),
              )
            }
          />
        )}
        {tab === "Settings" && <SettingsPage brand={selectedBrand} user={user} />}
      </section>
      {showCreate && (
        <div className="modal-backdrop">
          <form className="modal create-modal" onSubmit={createCampaign}>
            <button
              type="button"
              className="close"
              onClick={() => setShowCreate(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">{selectedBrand?.name.toUpperCase()}</div>
            <h2>New campaign</h2>
            <p>
              Create a campaign workspace, then approve recipients before
              sending.
            </p>
            <label>
              Campaign name
              <input
                name="name"
                placeholder="e.g. Summer routes"
                autoFocus
                required
              />
            </label>
            <label>
              Channel
              <select name="channel" defaultValue="Email">
                <option>Email</option>
                <option>SMS</option>
              </select>
            </label>
            <button className="primary full">
              <Plus size={16} /> Create campaign
            </button>
          </form>
        </div>
      )}
      {showSend && (
        <div className="modal-backdrop">
          <form className="modal create-modal" onSubmit={sendCampaign}>
            <button type="button" className="close" onClick={() => setShowSend(false)}><X /></button>
            <span className="pill">OWNER ACTION</span>
            <h2>Confirm campaign send</h2>
            <p>This sends to every current contactable recipient. The batch is idempotent and safely recorded before the provider request.</p>
            <label>Campaign<select value={sendCampaignId} onChange={(event) => setSendCampaignId(event.target.value)} required>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.campaign_name}</option>)}</select></label>
            <div className="send-confirmation"><strong>{sendCount === null ? "Calculating recipients…" : `${number.format(sendCount)} recipients will receive this campaign`}</strong><small>Marketing consent is required and deleted or suppressed contacts are excluded.</small></div>
            <div className="form-actions"><button type="button" className="ghost" onClick={() => setShowSend(false)}>Cancel</button><button className="primary" type="submit" disabled={sendLoading || !sendCount}>{sendLoading ? "Sending…" : "Confirm and send"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

function SettingsPage({ brand, user }: { brand: Brand; user: { email?: string } }) {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(`velocity-settings-${user.email ?? "user"}`);
    if (!raw) return;
    try {
      const preferences = JSON.parse(raw) as { emailNotifications?: boolean; weeklyDigest?: boolean };
      if (typeof preferences.emailNotifications === "boolean") setEmailNotifications(preferences.emailNotifications);
      if (typeof preferences.weeklyDigest === "boolean") setWeeklyDigest(preferences.weeklyDigest);
    } catch {
      window.localStorage.removeItem(`velocity-settings-${user.email ?? "user"}`);
    }
  }, [user.email]);

  function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    window.localStorage.setItem(`velocity-settings-${user.email ?? "user"}`, JSON.stringify({ emailNotifications, weeklyDigest }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  return (
    <div className="page settings-page">
      <style>{`.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.settings-card{min-height:240px}.setting-detail{display:flex;align-items:center;gap:12px;border-top:1px solid #e7ebef;padding:17px 0}.setting-detail:first-of-type{border-top:0;padding-top:0}.setting-detail strong,.setting-detail small{display:block}.setting-detail strong{font-size:13px}.setting-detail small{color:#7d8994;font-size:11px;margin-top:4px}.setting-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#fff0ec;color:#ff6542}.toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid #e7ebef;padding:17px 0;cursor:pointer}.toggle-row:first-of-type{border-top:0;padding-top:0}.toggle-row strong,.toggle-row small{display:block}.toggle-row strong{font-size:13px}.toggle-row small{color:#7d8994;font-size:11px;margin-top:4px}.toggle-row input{appearance:none;width:38px;height:22px;border-radius:999px;background:#d0d5dd;position:relative;flex:none;cursor:pointer;transition:background .2s}.toggle-row input:after{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #17212b33;transition:transform .2s}.toggle-row input:checked{background:#ff6542}.toggle-row input:checked:after{transform:translateX(16px)}.settings-actions{display:flex;align-items:center;gap:12px;margin-top:12px}.saved-message{color:#41966f;font-size:11px}@media(max-width:800px){.settings-grid{grid-template-columns:1fr}}`}</style>
      <div className="welcome"><div><span className="pill">WORKSPACE SETTINGS</span><h2>Settings</h2><p>Manage your account and preferences for this client workspace.</p></div></div>
      <div className="settings-grid">
        <section className="card settings-card">
          <div className="card-head"><div><h3>Account</h3><p>Your authenticated portal identity.</p></div></div>
          <div className="setting-detail"><span className="setting-icon"><Users size={17} /></span><div><strong>{user.email ?? "Authenticated user"}</strong><small>Signed in with your secure account</small></div></div>
          <div className="setting-detail"><span className="setting-icon"><Megaphone size={17} /></span><div><strong>{brand.name}</strong><small>{brand.country} · Current workspace</small></div></div>
        </section>
        <form className="card settings-card" onSubmit={savePreferences}>
          <div className="card-head"><div><h3>Notifications</h3><p>Choose which updates you want to receive.</p></div></div>
          <label className="toggle-row"><span><strong>Campaign updates</strong><small>Receive delivery and campaign status updates.</small></span><input type="checkbox" checked={emailNotifications} onChange={(event) => setEmailNotifications(event.target.checked)} /></label>
          <label className="toggle-row"><span><strong>Weekly performance digest</strong><small>Get a summary of workspace activity each week.</small></span><input type="checkbox" checked={weeklyDigest} onChange={(event) => setWeeklyDigest(event.target.checked)} /></label>
          <div className="settings-actions"><button className="primary" type="submit">Save preferences</button>{saved && <span className="saved-message">Preferences saved</span>}</div>
        </form>
      </div>
    </div>
  );
}

function Overview({
  brand,
  campaigns,
  loading,
  onCampaigns,
  onExport,
  signupSeries = [],
}: {
  brand: Brand;
  campaigns: Campaign[];
  loading: boolean;
  onCampaigns: () => void;
  onExport: () => void;
  signupSeries?: SignupPoint[];
}) {
  const delivered = campaigns.reduce(
    (sum, item) => sum + item.reported_delivered,
    0,
  );
  const sent = campaigns.reduce((sum, item) => sum + item.reported_sent, 0);
  const rate = sent ? Math.round((delivered / sent) * 1000) / 10 : 0;
  return (
    <div className="page">
      <div className="welcome">
        <div>
          <span className="pill">LIVE DATA</span>
          <h2>
            Good morning, Mohamed <span>✦</span>
          </h2>
          <p>Real-time performance for {brand.name}.</p>
        </div>
        <button className="ghost" onClick={onExport}>
          <Download size={16} /> Export report
        </button>
      </div>
      <div className="metrics">
        <Metric
          label="Total customers"
          value={loading ? "—" : number.format(brand.customers)}
          note="Synced from contacts"
        />
        <Metric
          label="Contactable audience"
          value={loading ? "—" : number.format(brand.contactable)}
          note="Consent and suppression checked"
        />
        <Metric
          label="Campaigns"
          value={loading ? "—" : number.format(campaigns.length)}
          note="In this workspace"
        />
        <Metric
          label="Delivery rate"
          value={loading ? "—" : `${rate}%`}
          note="Reported provider delivery"
        />
      </div>
      <div className="grid">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <h3>Signups per day</h3>
              <p>Customer signups across the last 30 days</p>
            </div>
            <button className="small-select">
              Latest <ChevronDown size={14} />
            </button>
          </div>
          <div className="chart activity-chart">
            {signupSeries.map((item) => (
                <i
                  key={item.label}
                  style={{
                    height: `${Math.max(8, Math.min(92, signupSeries.reduce((max, point) => Math.max(max, point.count), 1) ? (item.count / signupSeries.reduce((max, point) => Math.max(max, point.count), 1)) * 92 : 8))}%`,
                    background: brand.accent,
                  }}
                  title={`${item.label}: ${item.count} signups`}
                />
              ))}
          </div>
          <div className="chart-caption">
            <span>
              <i className="legend" style={{ background: brand.accent }} />{" "}
              Daily signups
            </span>
            <span>{signupSeries.reduce((sum, item) => sum + item.count, 0)} total</span>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Audience health</h3>
              <p>Based on your live contact records</p>
            </div>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: `conic-gradient(${brand.accent} 0 ${brand.customers ? (brand.contactable / brand.customers) * 100 : 0}%, #edf0f3 0 100%)`,
              }}
            >
              <div>
                <strong>
                  {brand.customers
                    ? Math.round((brand.contactable / brand.customers) * 100)
                    : 0}
                  %
                </strong>
                <small>contactable</small>
              </div>
            </div>
            <div className="health-list">
              <div>
                <b className="dot green" /> Contactable{" "}
                <strong>{number.format(brand.contactable)}</strong>
              </div>
              <div>
                <b className="dot red" /> Suppressed{" "}
                <strong>
                  {number.format(
                    Math.max(0, brand.customers - brand.contactable),
                  )}
                </strong>
              </div>
            </div>
          </div>
        </section>
      </div>
      <section className="card">
        <div className="card-head">
          <div>
            <h3>Recent campaigns</h3>
            <p>Latest performance from Supabase</p>
          </div>
          <button className="link" onClick={onCampaigns}>
            View all campaigns →
          </button>
        </div>
        <CampaignRows campaigns={campaigns.slice(0, 5)} loading={loading} />
      </section>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function CampaignRows({
  campaigns,
  loading,
  canSend = false,
  onSend,
  onShare,
  shareLoading = false,
}: {
  campaigns: Campaign[];
  loading: boolean;
  canSend?: boolean;
  onSend?: (campaignId: string) => void;
  onShare?: (campaignId: string) => void;
  shareLoading?: boolean;
}) {
  if (loading)
    return <div className="empty-state">Loading campaign performance…</div>;
  if (!campaigns.length)
    return (
      <div className="empty-state">
        No campaigns yet. Create one to start building your workspace.
      </div>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>CAMPAIGN</th>
            <th>CHANNEL</th>
            <th>SENT</th>
            <th>DELIVERED</th>
            <th>OPEN RATE</th>
            <th>STATUS</th>
            {canSend && <th>ACTION</th>}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td>
                <b>{campaign.campaign_name}</b>
                <small>{formatDate(campaign.sent_at_utc)}</small>
              </td>
              <td>{campaign.channel}</td>
              <td>{number.format(campaign.reported_sent)}</td>
              <td>{number.format(campaign.reported_delivered)}</td>
              <td>
                {campaign.reported_delivered
                  ? `${Math.round((campaign.reported_opens / campaign.reported_delivered) * 100)}%`
                  : "—"}
              </td>
              <td>
                <span className="status">
                  {campaign.sent_at_utc ? "Delivered" : "Draft"}
                </span>
              </td>
              {canSend && <td><button className="link" onClick={() => onSend?.(campaign.id)}>Send</button><button className="link" onClick={() => onShare?.(campaign.id)} disabled={shareLoading}>Share</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CampaignTable({
  campaigns,
  query,
  setQuery,
  loading,
  onCreate,
  canSend,
  onSend,
  onShare,
  shareLoading,
  onExport,
}: {
  campaigns: Campaign[];
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  onCreate: () => void;
  canSend: boolean;
  onSend: (campaignId: string) => void;
  onShare: (campaignId: string) => void;
  shareLoading: boolean;
  onExport: () => void;
}) {
  return (
    <div className="page">
      <div className="welcome">
        <div>
          <span className="pill">CAMPAIGN LIBRARY</span>
          <h2>Campaign performance</h2>
          <p>Review and prepare campaigns for this brand.</p>
        </div>
        <div className="action-row"><button className="ghost" onClick={onExport}><Download size={16} /> Export campaigns</button><button className="primary" onClick={onCreate}><Plus size={16} /> New campaign</button></div>
      </div>
      <section className="card">
        <div className="searchbar campaign-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by campaign name or channel" /><span>{campaigns.length} shown</span></div>
        {query && campaigns.length === 0 ? (
          <div className="empty-state">No campaigns match “{query}”.</div>
        ) : (
          <CampaignRows campaigns={campaigns} loading={loading} canSend={canSend} onSend={onSend} onShare={onShare} shareLoading={shareLoading} />
        )}
      </section>
    </div>
  );
}
function Contacts({
  brand,
  contacts,
  query,
  setQuery,
  loading,
  onExport,
}: {
  brand: Brand;
  contacts: Contact[];
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  onExport: () => void;
}) {
  return (
    <div className="page">
      <div className="welcome">
        <div>
          <span className="pill">AUDIENCE</span>
          <h2>{number.format(brand.customers)} contacts</h2>
          <p>Search the live audience for {brand.name}.</p>
        </div>
        <button className="ghost" onClick={onExport}>
          <Download size={16} /> Export contacts
        </button>
      </div>
      <section className="card">
        <div className="searchbar">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, or ID"
          />
          <span>{loading ? "Loading…" : `${contacts.length} shown`}</span>
        </div>
        {loading ? (
          <div className="empty-state">Loading contacts…</div>
        ) : !contacts.length ? (
          <div className="empty-state">No contacts match “{query}”.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CONTACT</th>
                  <th>LOCATION</th>
                  <th>STATUS</th>
                  <th>MARKETING CONSENT</th>
                  <th>LAST ACTIVITY</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <b>{contact.full_name || "Unnamed contact"}</b>
                      <small>
                        {contact.email || contact.phone || contact.external_id}
                      </small>
                    </td>
                    <td>{contact.city || brand.country}</td>
                    <td>
                      <span
                        className={
                          contact.status?.toLowerCase().includes("bounce")
                            ? "status danger"
                            : "status"
                        }
                      >
                        {contact.status || "Active"}
                      </span>
                    </td>
                    <td>
                      {contact.consent_marketing ? "Opted in" : "Not opted in"}
                    </td>
                    <td>{formatDate(contact.signup_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
function AuthScreen({
  loading,
  email,
  password,
  error,
  setEmail,
  setPassword,
  signIn,
  google,
}: {
  loading: boolean;
  email: string;
  password: string;
  error: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  signIn: (event: React.FormEvent) => void;
  google: () => void;
}) {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark auth-brand">
          <span>V</span>
          <div>
            velocity<span className="muted">growth</span>
          </div>
        </div>
        <div className="eyebrow">CLIENT CAMPAIGN PORTAL</div>
        <h1>{loading ? "Loading workspace" : "Welcome back"}</h1>
        <p>
          {loading
            ? "Checking your secure session…"
            : "Sign in to access your brand workspace."}
        </p>
        {!loading && (
          <form onSubmit={signIn}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary full">Sign in</button>
            <div className="or">or</div>
            <button type="button" className="google" onClick={google}>
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
