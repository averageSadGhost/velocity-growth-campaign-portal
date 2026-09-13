'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronDown, CircleHelp, Download, LayoutDashboard, LogOut, Megaphone, Search, Send, Users } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase'

type Brand = { id: string; name: string; country: string; accent: string; customers: string; contactable: string; trend: number[] }
const brands: Brand[] = [
  { id: 'kilele', name: 'Kilele Rides', country: 'Kenya', accent: '#ff6542', customers: '38,420', contactable: '31,206', trend: [22, 31, 28, 37, 44, 49, 56] },
  { id: 'karoo', name: 'Karoo Coaches', country: 'South Africa', accent: '#3a8bff', customers: '5,592', contactable: '4,771', trend: [18, 21, 29, 25, 34, 38, 43] },
  { id: 'marrakech', name: 'Marrakech Express', country: 'Morocco', accent: '#a97bff', customers: '834', contactable: '612', trend: [8, 12, 10, 16, 20, 18, 26] }
]
const campaigns = [
  { name: 'Ramadan Routes', brand: 'Kilele Rides', channel: 'Email', sent: '31,205', delivered: '29,641', opens: '12,403', clicks: '4,881', status: 'Delivered', color: '#ff6542' },
  { name: 'Weekend Flash Sale', brand: 'Karoo Coaches', channel: 'Email', sent: '3,600', delivered: '3,446', opens: '1,800', clicks: '500', status: 'Delivered', color: '#3a8bff' },
  { name: 'Campagne 2', brand: 'Marrakech Express', channel: 'SMS', sent: '772', delivered: '733', opens: '268', clicks: '42', status: 'Delivered', color: '#a97bff' }
]

export default function Home() {
  const [selectedBrand, setSelectedBrand] = useState(brands[0])
  const [tab, setTab] = useState('Overview')
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const supabase = useMemo(() => createBrowserClient(), [])

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)) }, [supabase])
  async function signIn(e: React.FormEvent) { e.preventDefault(); setAuthError(''); const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setAuthError(error.message); else { setUser(data.user); setAuthOpen(false) } }
  async function google() { const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (error) setAuthError(error.message) }

  return <main className="shell">
    <aside className="sidebar">
      <div className="brandmark"><span>V</span><div>velocity<span className="muted">growth</span></div></div>
      <div className="side-label">WORKSPACE</div>
      <nav>{['Overview', 'Campaigns', 'Contacts', 'Reports'].map((item, i) => <button key={item} className={tab === item ? 'nav active' : 'nav'} onClick={() => setTab(item)}>{i === 0 ? <LayoutDashboard size={18}/> : i === 1 ? <Megaphone size={18}/> : i === 2 ? <Users size={18}/> : <BarChart3 size={18}/>} {item}</button>)}</nav>
      <div className="side-label brand-label">BRANDS</div>
      {brands.map((brand) => <button key={brand.id} className={selectedBrand.id === brand.id ? 'brand-row selected' : 'brand-row'} onClick={() => setSelectedBrand(brand)}><span className="dot" style={{ background: brand.accent }}/><span>{brand.name}</span><span className="country">{brand.country}</span></button>)}
      <div className="sidebar-bottom"><button className="help"><CircleHelp size={17}/> Help centre</button><div className="profile"><div className="avatar">MA</div><div><strong>{user?.email?.split('@')[0] ?? 'Mohamed Ali'}</strong><small>{user ? 'Authenticated user' : 'Preview workspace'}</small></div><ChevronDown size={16}/></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div><div className="eyebrow">CLIENT PORTAL / {selectedBrand.name.toUpperCase()}</div><h1>{tab}</h1></div><div className="top-actions"><button className="icon-btn"><Search size={19}/></button>{user ? <button className="outline" onClick={() => supabase.auth.signOut().then(() => setUser(null))}><LogOut size={16}/> Sign out</button> : <button className="outline" onClick={() => setAuthOpen(true)}>Sign in</button>}<button className="primary"><Send size={16}/> New campaign</button></div></header>
      <div className="brand-banner"><div className="brand-title"><span className="large-dot" style={{background: selectedBrand.accent}}/><div><h2>{selectedBrand.name}</h2><p>{selectedBrand.country} · All campaigns</p></div></div><button className="selector">{selectedBrand.name}<ChevronDown size={16}/></button></div>
      {tab === 'Overview' && <Overview brand={selectedBrand}/>} {tab === 'Campaigns' && <CampaignTable/>} {tab === 'Contacts' && <Contacts brand={selectedBrand}/>} {tab === 'Reports' && <Overview brand={selectedBrand}/>} 
    </section>
    {authOpen && <div className="modal-backdrop"><form className="modal" onSubmit={signIn}><button type="button" className="close" onClick={() => setAuthOpen(false)}>×</button><div className="eyebrow">VELOCITY GROWTH</div><h2>Welcome back</h2><p>Sign in to your brand workspace.</p><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{authError && <div className="error">{authError}</div>}<button className="primary full">Sign in</button><div className="or">or</div><button type="button" className="google" onClick={google}>Continue with Google</button></form></div>}
  </main>
}

function Overview({ brand }: { brand: Brand }) { return <div className="page"><div className="welcome"><div><span className="pill">LIVE DATA</span><h2>Good morning, Mohamed <span>✦</span></h2><p>Here’s how {brand.name} is performing across the last 30 days.</p></div><button className="ghost"><Download size={16}/> Export report</button></div><div className="metrics"><Metric label="Total customers" value={brand.customers} note="+4.8% vs last month"/><Metric label="Contactable audience" value={brand.contactable} note="81.2% of total customers"/><Metric label="Campaigns sent" value="28" note="+6 this month"/><Metric label="Avg. delivery rate" value="94.6%" note="+1.2% vs last month"/></div><div className="grid"><section className="card chart-card"><div className="card-head"><div><h3>Signups over time</h3><p>Last 30 days · all sources</p></div><button className="small-select">Last 30 days <ChevronDown size={14}/></button></div><div className="chart"><div className="yaxis"><span>60</span><span>40</span><span>20</span><span>0</span></div><div className="bars">{brand.trend.concat([32, 46, 39, 48, 56, 51, 59, 42, 44, 37, 53, 47, 62, 52, 55, 49, 58, 63, 48, 55, 61, 57, 66, 60, 70]).map((n,i) => <i key={i} style={{height: `${n}%`, background: brand.accent}}/> )}</div></div><div className="chart-caption"><span><i className="legend" style={{background: brand.accent}}/> New signups</span><span>Peak: 70 signups</span></div></section><section className="card"><div className="card-head"><div><h3>Audience health</h3><p>Based on latest provider events</p></div></div><div className="donut-wrap"><div className="donut" style={{background: `conic-gradient(${brand.accent} 0 81%, #edf0f3 81% 100%)`}}><div><strong>81%</strong><small>contactable</small></div></div><div className="health-list"><div><b className="dot green"/> Active <strong>76.4%</strong></div><div><b className="dot red"/> Bounced <strong>8.7%</strong></div><div><b className="dot grey"/> Unsubscribed <strong>6.4%</strong></div></div></div></section></div><section className="card"><div className="card-head"><div><h3>Recent campaigns</h3><p>Performance across your latest sends</p></div><button className="link" onClick={() => {}}>View all campaigns →</button></div><CampaignRows/></section></div> }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }
function CampaignRows() { return <div className="table-wrap"><table><thead><tr><th>CAMPAIGN</th><th>CHANNEL</th><th>SENT</th><th>DELIVERED</th><th>OPEN RATE</th><th>STATUS</th></tr></thead><tbody>{campaigns.map(c => <tr key={c.name}><td><span className="dot" style={{background:c.color}}/> <b>{c.name}</b><small>{c.brand}</small></td><td>{c.channel}</td><td>{c.sent}</td><td>{c.delivered}</td><td>{Math.round(Number(c.opens.replace(',','')) / Number(c.delivered.replace(',','')) * 100)}%</td><td><span className="status">{c.status}</span></td></tr>)}</tbody></table></div> }
function CampaignTable() { return <div className="page"><div className="welcome"><div><span className="pill">CAMPAIGN LIBRARY</span><h2>Campaign performance</h2><p>Review delivery and engagement across every brand.</p></div><button className="primary"><Send size={16}/> New campaign</button></div><section className="card"><CampaignRows/></section></div> }
function Contacts({ brand }: { brand: Brand }) { return <div className="page"><div className="welcome"><div><span className="pill">AUDIENCE</span><h2>{brand.customers} contacts</h2><p>Only consented and unsuppressed contacts can receive campaigns.</p></div><button className="ghost"><Download size={16}/> Export contacts</button></div><section className="card"><div className="searchbar"><Search size={17}/><input placeholder="Search by name, email, or ID"/><span>Showing a representative sample</span></div><div className="table-wrap"><table><thead><tr><th>CONTACT</th><th>LOCATION</th><th>STATUS</th><th>MARKETING CONSENT</th><th>LAST ACTIVITY</th></tr></thead><tbody>{['Amina Achieng','Johan Wafula','Layla Bennani','Simon Kamau','James Berrada'].map((name,i) => <tr key={name}><td><b>{name}</b><small>contact-{String(i+1).padStart(5,'0')}@vg-eval.test</small></td><td>{brand.country}</td><td><span className={i===3?'status danger':'status'}>{i===3?'Bounced':'Active'}</span></td><td>{i===3?'Suppressed':'Opted in'}</td><td>Today</td></tr>)}</tbody></table></div></section></div> }
