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
  const [user, setUser] = useState<{ email?: string } | null>(null);
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
  user: { email?: string };
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
    ]).then(async ([total, contactable, campaignQuery]) => {
      if (cancelled) return;
      if (total.error || contactable.error || campaignQuery.error)
        setError("Some workspace data could not be loaded.");
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
          {["Overview", "Campaigns", "Contacts", "Reports"].map((item, i) => (
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
              ) : (
                <BarChart3 size={18} />
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
          <div className="profile">
            <div className="avatar">
              {(user.email?.[0] ?? "M").toUpperCase()}
            </div>
            <div>
              <strong>{user.email?.split("@")[0]}</strong>
              <small>Authenticated user</small>
            </div>
            <ChevronDown size={16} />
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
            onExport={() =>
              downloadCsv(
                `${selectedBrand?.name}-campaign-report.csv`,
                ["Campaign", "Channel", "Sent", "Delivered", "Opens", "Clicks", "Sent date"],
                campaigns.map((campaign) => [campaign.campaign_name, campaign.channel, campaign.reported_sent, campaign.reported_delivered, campaign.reported_opens, campaign.reported_clicks, campaign.sent_at_utc]),
              )
            }
          />
        )}
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
    </main>
  );
}

function Overview({
  brand,
  campaigns,
  loading,
  onCampaigns,
  onExport,
}: {
  brand: Brand;
  campaigns: Campaign[];
  loading: boolean;
  onCampaigns: () => void;
  onExport: () => void;
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
              <h3>Campaign activity</h3>
              <p>
                {campaigns.length
                  ? "Latest campaigns in this workspace"
                  : "Create your first campaign to see activity"}
              </p>
            </div>
            <button className="small-select">
              Latest <ChevronDown size={14} />
            </button>
          </div>
          <div className="chart activity-chart">
            {campaigns
              .slice(0, 12)
              .reverse()
              .map((item) => (
                <i
                  key={item.id}
                  style={{
                    height: `${Math.max(12, Math.min(92, item.reported_sent ? (item.reported_delivered / item.reported_sent) * 100 : 12))}%`,
                    background: brand.accent,
                  }}
                  title={`${item.campaign_name}: ${item.reported_delivered} delivered`}
                />
              ))}
          </div>
          <div className="chart-caption">
            <span>
              <i className="legend" style={{ background: brand.accent }} />{" "}
              Delivery rate by campaign
            </span>
            <span>{campaigns.length} total</span>
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
}: {
  campaigns: Campaign[];
  loading: boolean;
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
  onExport,
}: {
  campaigns: Campaign[];
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  onCreate: () => void;
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
          <CampaignRows campaigns={campaigns} loading={loading} />
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
