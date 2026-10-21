import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = async (path, { method = 'GET', body } = {}) => {
  const t = localStorage.getItem('t');
  const r = await fetch(API_BASE + '/api' + path, { 
    method, 
    headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, 
    body: body && JSON.stringify(body) 
  });
  let j = {};
  try { j = await r.json(); } catch (e) { }
  if (r.status === 401 && t) { localStorage.clear(); location.reload(); }
  if (!r.ok) throw new Error(j.error || `Server error (${r.status} ${r.statusText})`);
  return j;
};

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const fd = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const alertErr = e => alert(e.message);
const COL = ['#b4c4e8', '#d6a8e4', '#ecd3b0', '#b6efc8', '#f3b5c9'];
const LABEL = { open: 'Awaiting reply', replied: 'Replied', closed: 'Closed' };
const Pill = ({ s }) => <span className={'pill ' + s}>{(LABEL[s] || s)}</span>;
function useLoad(path) {
  const [d, set] = useState(null);
  const load = () => api(path).then(set).catch(alertErr);
  useEffect(() => { load(); }, [path]);
  return [d, load];
}

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('u') || 'null'));
  const [tab, setTab] = useState(() => user?.role === 'admin' ? 'Dashboard' : user?.role === 'staff' ? 'Check-in' : 'Events');
  if (!user) return <Login onAuth={(t, u) => { localStorage.setItem('t', t); localStorage.setItem('u', JSON.stringify(u)); setUser(u); setTab(u.role === 'admin' ? 'Dashboard' : u.role === 'staff' ? 'Check-in' : 'Events'); }} />;
  
  const admin = user.role === 'admin';
  const staff = user.role === 'staff';
  const tabs = admin ? ['Dashboard', 'Events', 'Categories', 'Bookings', 'Messages', 'Check-in', 'Users'] : staff ? ['Check-in'] : ['Events', 'My bookings', 'Contact'];
  const Page = { Dashboard, Events: admin ? AdminEvents : Browse, Categories, Bookings, Messages, 'Check-in': Checkin, Users, 'My bookings': MyBookings, Contact }[tab];
  
  return <>
    <nav><span className="brand"><span className="logo" />Eventure</span>
      {tabs.map(t => <a key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</a>)}
      <span className="sp" /><span style={{ color: 'var(--mute)' }}>Hi, {user.name.split(' ')[0]} ({user.role})</span>
      <button className="btn sm" onClick={() => { localStorage.clear(); setUser(null); }}>Log out</button></nav>
    <main><Page go={setTab} /></main></>;
}

function Login({ onAuth }) {
  const [reg, setReg] = useState(false), [f, setF] = useState({}), [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => { e.preventDefault(); try { const r = await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body: f }); onAuth(r.token, r.user); } catch (x) { setErr(x.message); } };
  return <form className="card auth" onSubmit={submit}>
    <div className="brand"><span className="logo" />Eventure</div><h1>{reg ? 'Create your account' : 'Sign in'}</h1>
    {reg && <><label>Name</label><input onChange={set('name')} /><label>Phone</label><input onChange={set('phone')} /></>}
    <label>Email</label><input type="email" onChange={set('email')} /><label>Password</label><input type="password" onChange={set('password')} />
    {err && <p className="err">{err}</p>}
    <div className="row"><button className="btn fill" style={{ flex: 1 }}>{reg ? 'Create account' : 'Sign in'}</button></div>
    <a style={{ color: 'var(--pri)', cursor: 'pointer' }} onClick={() => { setReg(!reg); setErr(''); }}>{reg ? 'I already have an account' : 'New here? Create an account'}</a>
    <p className="sub" style={{ marginTop: 14 }}>Demo Accounts:<br />Admin: admin@events.com / admin123<br />Staff: staff@events.com / staff123<br />User: user@events.com / user123</p></form>;
}

function Dashboard({ go }) {
  const [s] = useLoad('/stats'); if (!s) return null;
  const cards = [['Upcoming events', s.upcoming, s.totalEvents + ' total'], ['Pending bookings', s.pending, 'awaiting your review'],
    ['Open messages', s.openMessages, 'waiting for a reply'], ['Approved bookings', s.approved, 'confirmed attendees'], ['Revenue (approved)', fmt(s.revenue), s.users + ' registered users']];
  return <><h1>Welcome back</h1><p className="sub">Here’s what’s happening across your events.</p>
    <div className="grid">{cards.map(c => <div key={c[0]} className="card stat"><div className="l">{c[0]}</div><div className="num">{c[1]}</div><div className="s">{c[2]}</div></div>)}</div>
    <div className="row">{[['Manage events', 'Events'], ['Manage categories', 'Categories'], ['Approve bookings', 'Bookings'], ['Read messages', 'Messages'], ['Check-in scanner', 'Check-in'], ['Manage users', 'Users']].map(t => <button key={t[1]} className="tool" onClick={() => go(t[1])}>{t[0]}</button>)}</div>
    <h2>Analytics</h2><p className="sub">Based on approved bookings only.</p>
    <div className="charts">
      <div className="card"><h3>Revenue over time</h3><ResponsiveContainer height={220}><LineChart data={s.byDate}><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line dataKey="revenue" stroke="#a45fc2" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
      <div className="card pie"><h3>Bookings by category</h3><ResponsiveContainer height={220}><PieChart><Pie data={s.byCategory} dataKey="value" innerRadius={50} outerRadius={80}>{s.byCategory.map((_, i) => <Cell key={i} fill={COL[i % 5]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div>
    <div className="card"><h3>Check-in rate by event</h3><ResponsiveContainer height={220}><BarChart data={s.checkin}><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip itemStyle={{ color: 'var(--pri)' }} /><Legend /><Bar dataKey="checked" name="Checked in" fill="#2f9e5f" /><Bar dataKey="total" name="Booked" fill="#e1d3ee" /></BarChart></ResponsiveContainer></div></>;
}

function AdminEvents() {
  const [events, reload] = useLoad('/events'), [cats] = useLoad('/categories'), [form, setForm] = useState(null), [att, setAtt] = useState(null), [errs, setErrs] = useState({});
  if (!events || !cats) return null;
  const set = k => e => { setForm({ ...form, [k]: e.target.value }); setErrs({ ...errs, [k]: undefined }); };
  const openForm = f => { setErrs({}); setForm(f); };
  const validate = () => {
    const x = {};
    if (!form.name?.trim()) x.name = 'Please enter the event name.';
    if (!form.date) x.date = 'Please choose a date.';
    if (!(+form.capacity > 0)) x.capacity = 'Please enter the number of seats.';
    if (form.image_url?.trim() && !/^https?:\/\/\S+$/i.test(form.image_url.trim())) x.image_url = 'The image link must start with http:// or https://';
    setErrs(x); return !Object.keys(x).length;
  };
  const Err = ({ k }) => errs[k] ? <div className="err">{errs[k]}</div> : null;
  const save = async () => { if (!validate()) return; try { await api(form.id ? '/events/' + form.id : '/events', { method: form.id ? 'PUT' : 'POST', body: form }); setForm(null); reload(); } catch (e) { alertErr(e); } };
  const del = async id => { if (confirm('Delete this event and its bookings?')) { await api('/events/' + id, { method: 'DELETE' }).catch(alertErr); reload(); } };
  const show = async e => setAtt({ e, list: await api(`/events/${e.id}/attendees`) });
  return <><h1>Events</h1><p className="sub">Create, edit and retire events.</p>
    <button className="btn fill" onClick={() => openForm({ category_id: cats[0]?.id, date: '', time: '', name: '', price: '', capacity: '', venue: '', image_url: '', description: '', custom_question: '', gallery: '' })}>Add event</button><div className="row" />
    {form && <div className="card" style={{ marginBottom: 14 }}><div className="form">
      <div><label>Name</label><input className={errs.name ? 'bad-in' : ''} value={form.name} onChange={set('name')} /><Err k="name" /></div>
      <div><label>Category</label><select value={form.category_id} onChange={set('category_id')}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label>Date</label><input type="date" className={errs.date ? 'bad-in' : ''} value={form.date} onChange={set('date')} /><Err k="date" /></div>
      <div><label>Price (₹)</label><input type="number" value={form.price} onChange={set('price')} /></div>
      <div><label>Start time</label><input type="time" value={form.time || ''} onChange={set('time')} /></div>
      <div><label>Seats</label><input type="number" className={errs.capacity ? 'bad-in' : ''} value={form.capacity} onChange={set('capacity')} /><Err k="capacity" /></div>
      <div><label>Venue</label><input value={form.venue || ''} placeholder="e.g. Palace Grounds, Bengaluru" onChange={set('venue')} /></div>
      <div style={{ gridColumn: '1 / -1' }}><label>Cover image link</label><input className={errs.image_url ? 'bad-in' : ''} value={form.image_url || ''} placeholder="https://…" onChange={set('image_url')} /><Err k="image_url" /></div>
      <div style={{ gridColumn: '1 / -1' }}><label>Photo Gallery URLs (comma-separated links)</label><input value={form.gallery || ''} placeholder="https://img1.jpg, https://img2.jpg" onChange={set('gallery')} /></div>
      <div style={{ gridColumn: '1 / -1' }}><label>Custom Question during registration (optional)</label><input value={form.custom_question || ''} placeholder="e.g. T-Shirt Size or Dietary Restrictions" onChange={set('custom_question')} /></div>
      <div style={{ gridColumn: '1 / -1' }}><label>Description</label><textarea rows="3" value={form.description || ''} onChange={set('description')} /></div></div>
      <button className="btn fill" onClick={save}>Save event</button> <button className="btn" onClick={() => setForm(null)}>Cancel</button></div>}
    {att && <div className="card" style={{ marginBottom: 14 }}><h3>Attendees: {att.e.name}</h3>{att.list.length ? att.list.map(b => <div key={b.id}>{b.user_name}, {b.seats} seat(s) {b.checked_in ? <Pill s="approved" /> : null}</div>) : <p className="sub">No approved attendees yet.</p>}<button className="btn sm" onClick={() => setAtt(null)}>Close</button></div>}
    <div className="wrap"><table><thead><tr><th>EVENT</th><th>CATEGORY</th><th>DATE</th><th>PRICE</th><th>SEATS LEFT</th><th /></tr></thead><tbody>
      {events.map(e => <tr key={e.id}><td>{e.name}</td><td>{e.category}</td><td>{fd(e.date)}</td><td>{fmt(e.price)}</td><td>{e.seats_left}/{e.capacity}</td>
        <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => show(e)}>Attendees</button> <button className="btn sm" onClick={() => openForm(e)}>Edit</button> <button className="btn sm bad" onClick={() => del(e.id)}>Delete</button></td></tr>)}</tbody></table></div></>;
}

function Categories() {
  const [cats, reload] = useLoad('/categories'), [name, setName] = useState('');
  if (!cats) return null;
  const add = async () => { await api('/categories', { method: 'POST', body: { name } }).catch(alertErr); setName(''); reload(); };
  const del = async id => { await api('/categories/' + id, { method: 'DELETE' }).catch(alertErr); reload(); };
  return <><h1>Categories</h1><p className="sub">Group events so people can find them.</p>
    <div className="row"><input style={{ maxWidth: 260 }} placeholder="New category name" value={name} onChange={e => setName(e.target.value)} /><button className="btn fill" onClick={add}>Add category</button></div>
    <div className="wrap"><table><thead><tr><th>CATEGORY</th><th>EVENTS</th><th /></tr></thead><tbody>{cats.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.events}</td><td><button className="btn sm bad" onClick={() => del(c.id)}>Delete</button></td></tr>)}</tbody></table></div></>;
}

function Bookings() {
  const [rows, reload] = useLoad('/bookings'), [filt, setFilt] = useState('pending');
  if (!rows) return null;
  const list = rows.filter(b => filt === 'all' || b.status === filt);
  const set = async (id, status) => { await api(`/bookings/${id}/status`, { method: 'PATCH', body: { status } }).catch(alertErr); reload(); };
  const csv = () => {
    const t = [['Ref', 'User', 'Email', 'Event', 'Seats', 'Amount', 'Payment', 'Status'], ...rows.map(b => [b.ref, b.user_name, b.user_email, b.event_name, b.seats, b.amount, b.payment, b.status])].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([t], { type: 'text/csv' })), download: 'bookings.csv' }).click();
  };
  return <><h1>Bookings</h1><p className="sub">Review and approve or reject user booking requests.</p>
    <div className="row">{['all', 'pending', 'approved', 'rejected', 'cancelled'].map(f => <button key={f} className={'chip ' + (f === filt ? 'on' : '')} onClick={() => setFilt(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}<span className="sp" /><button className="btn sm" onClick={csv}>Export CSV</button></div>
    <div className="wrap"><table><thead><tr><th>REF</th><th>USER</th><th>EVENT</th><th>CUSTOM ANSWER</th><th>GUESTS</th><th>DATE</th><th>SEATS</th><th>AMOUNT</th><th>STATUS</th><th /></tr></thead><tbody>
      {list.map(b => <tr key={b.id}><td className="ref">{b.ref}</td><td>{b.user_name}<small>{b.user_email}</small></td><td>{b.event_name}</td>
        <td>{b.custom_answer || '—'}</td>
        <td>{b.guests?.length ? b.guests.map(g => g.name).join(', ') : 'Primary Buyer Only'}</td>
        <td>{fd(b.event_date)}</td><td>{b.seats}</td><td>{fmt(b.amount)}</td><td><Pill s={b.status} /></td>
        <td style={{ whiteSpace: 'nowrap' }}>{b.status === 'pending' && <><button className="btn sm fill" onClick={() => set(b.id, 'approved')}>Approve</button> <button className="btn sm bad" onClick={() => set(b.id, 'rejected')}>Reject</button></>}</td></tr>)}
      {!list.length && <tr><td colSpan="10">No bookings in this view.</td></tr>}</tbody></table></div></>;
}

function Scanner({ onCode, onClose }) {
  useEffect(() => {
    const s = new Html5Qrcode('reader'); let done = false;
    s.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, txt => { if (!done) { done = true; onCode(txt); } }, () => { })
      .catch(e => { alert('Couldn’t open the camera: ' + e); onClose(); });
    return () => { s.stop().then(() => s.clear()).catch(() => { }); };
  }, []);
  return <div id="reader" style={{ maxWidth: 320, margin: '12px auto' }} />;
}

function Checkin() {
  const [code, setCode] = useState(''), [t, setT] = useState(null), [err, setErr] = useState(''), [scan, setScan] = useState(false);
  const look = async (c = code) => { try { setErr(''); setT(await api('/tickets/' + encodeURIComponent(c.trim()))); } catch (e) { setT(null); setErr(e.message); } };
  const doIn = async () => { await api(`/tickets/${t.ref}/checkin`, { method: 'POST' }).catch(alertErr); look(t.ref); };
  const got = c => { setScan(false); setCode(c); look(c); };
  return <><h1>Check-in</h1><p className="sub">Scan a ticket’s QR with the camera, or type or paste the code. A USB barcode scanner works too.</p>
    <div className="card"><label>Ticket code</label><input value={code} placeholder="EVT-…" onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && look()} />
      <div className="row"><button className="btn fill" style={{ flex: 1 }} onClick={() => look()}>Look up ticket</button><button className="btn" onClick={() => setScan(!scan)}>{scan ? 'Close camera' : 'Scan with camera'}</button></div>
      {scan && <Scanner onCode={got} onClose={() => setScan(false)} />}
      {err && <div className="msg">{err}</div>}
      {t && <div className="msg"><b>{t.user_name}</b>, {t.event_name}, {t.seats} seat(s) <Pill s={t.status} />
        <div style={{ marginTop: 8 }}>{t.status !== 'approved' ? 'This ticket isn’t approved, so it can’t be checked in.' : t.checked_in ? 'Already checked in.' : <button className="btn sm fill" onClick={doIn}>Check in</button>}</div></div>}</div></>;
}

function Users() {
  const [users, reload] = useLoad('/users'); if (!users) return null;
  const del = async id => { if (confirm('Remove this user and their bookings?')) { await api('/users/' + id, { method: 'DELETE' }).catch(alertErr); reload(); } };
  return <><h1>Users</h1><p className="sub">Everyone registered to book events.</p>
    <div className="wrap"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>PHONE</th><th>BOOKINGS</th><th>JOINED</th><th /></tr></thead><tbody>
      {users.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.phone}</td><td>{u.bookings}</td><td>{fd(u.created)}</td><td><button className="btn sm bad" onClick={() => del(u.id)}>Remove</button></td></tr>)}</tbody></table></div></>;
}

const evId = () => { const m = location.hash.match(/^#\/event\/(\d+)/); return m ? +m[1] : null; };

function EventMap({ venue }) {
  if (!venue) return null;
  const encoded = encodeURIComponent(venue);
  const mapSrc = `https://maps.google.com/maps?q=${encoded}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
  return (
    <div className="map-container">
      <iframe title="Venue Map" src={mapSrc} loading="lazy" allowFullScreen />
    </div>
  );
}

function EventCalendar({ events }) {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', margin: '0 0 10px' }}>
        <button className="btn sm" onClick={prevMonth}>← Prev</button>
        <h3 style={{ margin: 0 }}>{monthNames[month]} {year}</h3>
        <button className="btn sm" onClick={nextMonth}>Next →</button>
      </div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="calendar-day-header">{d}</div>
        ))}
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div key={'empty-' + i} className="calendar-day-cell" style={{ background: 'transparent', border: 'none' }} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const dayEvents = events.filter(e => e.date === dateStr);

          return (
            <div key={dayNum} className="calendar-day-cell">
              <span className="calendar-date-num">{dayNum}</span>
              {dayEvents.map(e => (
                <div 
                  key={e.id} 
                  className="calendar-event-badge" 
                  title={e.name}
                  onClick={() => { location.hash = '/event/' + e.id; }}
                >
                  {e.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Browse({ go }) {
  const [events] = useLoad('/events'), [cats] = useLoad('/categories');
  const [favs, setFavs] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState(''), [cat, setCat] = useState('all'), [sort, setSort] = useState('date'), [sel, setSel] = useState(evId);

  useEffect(() => {
    api('/favorites').then(setFavs).catch(() => {});
  }, []);

  const toggleFav = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await api('/favorites/toggle', { method: 'POST', body: { eventId: id } });
      setFavs(prev => res.favorited ? [...prev, id] : prev.filter(x => x !== id));
    } catch (err) {
      alertErr(err);
    }
  };

  useEffect(() => { const f = () => { setSel(evId()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  if (!events || !cats) return null;
  if (sel) return <EventPage e={events.find(x => x.id === sel)} msg={msg} setMsg={setMsg} go={go} />;

  const term = q.trim().toLowerCase();
  const list = events.filter(e => {
    const matchCat = cat === 'all' || e.category_id === cat;
    const matchTerm = !term || [e.name, e.venue, e.description, e.category].some(x => (x || '').toLowerCase().includes(term));
    const matchFav = viewMode !== 'favorites' || favs.includes(e.id);
    return matchCat && matchTerm && matchFav;
  }).sort((a, b) => sort === 'price' ? a.price - b.price : a.date.localeCompare(b.date));

  return <><h1>Upcoming events</h1><p className="sub">Pick an event to see the details and request your seats.</p>{msg && <div className="msg">{msg}</div>}
    <div className="row">
      <input className="search" type="search" placeholder="Search events, venues…" value={q} onChange={e => setQ(e.target.value)} />
      <select className="sort" value={sort} onChange={e => setSort(e.target.value)}>
        <option value="date">Soonest first</option>
        <option value="price">Price: low to high</option>
      </select>
      <button className={'chip ' + (viewMode === 'grid' ? 'on' : '')} onClick={() => setViewMode('grid')}>Grid</button>
      <button className={'chip ' + (viewMode === 'calendar' ? 'on' : '')} onClick={() => setViewMode('calendar')}>Calendar View</button>
      <button className={'chip ' + (viewMode === 'favorites' ? 'on' : '')} onClick={() => setViewMode('favorites')}>♥ Wishlist ({favs.length})</button>
    </div>
    <div className="row" style={{ marginTop: 0 }}>{[{ id: 'all', name: 'All' }, ...cats].map(c => <button key={c.id} className={'chip ' + (c.id === cat ? 'on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}</div>

    {viewMode === 'calendar' ? (
      <EventCalendar events={list} />
    ) : (
      <>
        {!list.length && <div className="msg">No events match your criteria.</div>}
        <div className="grid evgrid" style={{ marginTop: 14 }}>{list.map(e => <div key={e.id} className="card ev" onClick={() => { location.hash = '/event/' + e.id; }}>
          <div className="cover" style={e.image_url ? { backgroundImage: `url("${e.image_url}")` } : undefined}>{!e.image_url && <span>{e.name[0]}</span>}</div>
          <div className="evbody">
            <div className="row" style={{ margin: 0, justifyContent: 'space-between' }}>
              <span className="tag">{e.category}</span>
              <button className={'fav-btn ' + (favs.includes(e.id) ? 'active' : '')} onClick={x => toggleFav(x, e.id)}>♥</button>
            </div>
            <h3 style={{ margin: '6px 0 2px' }}>{e.name}</h3>
            <p className="sub" style={{ margin: '0 0 6px' }}>
              {fd(e.date)}{e.time ? ' · ' + e.time : ''}{e.venue ? ' · ' + e.venue : ''}
              {e.avg_rating > 0 && ` · ★ ${e.avg_rating.toFixed(1)} (${e.review_count})`}
            </p>
            {e.description && <p className="desc">{e.description}</p>}
            <div style={{ marginTop: 'auto' }}><b>{fmt(e.price)}</b> per seat · {e.seats_left ? e.seats_left + ' left' : 'Sold out'}</div>
            <div className="row"><button className="btn sm fill">View details</button></div></div></div>)}</div>
      </>
    )}
  </>;
}

function EventPage({ e, msg, setMsg, go }) {
  const [b, setB] = useState({ seats: 1, pay: 'upi' });
  const [guests, setGuests] = useState([]);
  const [customAns, setCustomAns] = useState('');
  const [promo, setPromo] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoErr, setPromoErr] = useState('');

  const [reviews, reloadReviews] = useLoad(e ? `/events/${e.id}/reviews` : null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [revMsg, setRevMsg] = useState('');

  const back = <a className="back" onClick={() => { location.hash = ''; }}>← All events</a>;
  if (!e) return <>{back}<div className="msg">This event could not be found. It may have been removed.</div></>;

  const handleSeatsChange = val => {
    const num = Math.max(1, +val || 1);
    setB({ ...b, seats: num });
    const count = num - 1;
    setGuests(prev => {
      if (prev.length < count) {
        return [...prev, ...Array.from({ length: count - prev.length }, () => ({ name: '', email: '' }))];
      }
      return prev.slice(0, count);
    });
  };

  const updateGuest = (idx, field, val) => {
    setGuests(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const applyPromo = async () => {
    try {
      setPromoErr('');
      const subtotal = e.price * (+b.seats || 1);
      const res = await api('/promo/validate', { method: 'POST', body: { code: promo, amount: subtotal } });
      setDiscount(res.discount);
    } catch (err) {
      setDiscount(0);
      setPromoErr(err.message);
    }
  };

  const request = async () => {
    try {
      const r = await api('/bookings', { method: 'POST', body: { eventId: e.id, seats: b.seats, payment: b.pay, guests, custom_answer: customAns, discount } });
      setMsg(`Request sent. Your ticket code is ${r.ref}. It’s valid once the organiser approves it.`);
    } catch (x) {
      alertErr(x);
    }
  };

  const submitReview = async () => {
    try {
      await api(`/events/${e.id}/reviews`, { method: 'POST', body: { rating, comment } });
      setRevMsg('Thank you for submitting your review!');
      setComment('');
      if (reloadReviews) reloadReviews();
    } catch (err) {
      alertErr(err);
    }
  };

  const joinWaitlist = async () => {
    try {
      await api('/waitlist', { method: 'POST', body: { eventId: e.id, seats: b.seats } });
      setMsg('You have been added to the waitlist. We will notify you if seats free up!');
    } catch (x) {
      alertErr(x);
    }
  };

  const subtotal = e.price * (+b.seats || 1);
  const finalPrice = Math.max(0, subtotal - discount);
  const galleryImgs = (e.gallery || '').split(',').map(s => s.trim()).filter(Boolean);

  return <>{back}
    <div className="card ev detail">
      <div className="cover big" style={e.image_url ? { backgroundImage: `url("${e.image_url}")` } : undefined}>{!e.image_url && <span>{e.name[0]}</span>}</div>
      <div className="detailbody">
        <div className="detailmain"><span className="tag">{e.category}</span>
          <h1 style={{ margin: '8px 0 2px' }}>{e.name}</h1>
          {e.avg_rating > 0 && <p style={{ color: 'var(--warn)', fontWeight: 600, margin: '0 0 12px' }}>★ {e.avg_rating.toFixed(1)} / 5.0 ({e.review_count} reviews)</p>}
          <div className="meta"><div><small>Date</small>{fd(e.date)}</div><div><small>Time</small>{e.time || 'To be announced'}</div><div><small>Venue</small>{e.venue || 'To be announced'}</div></div>
          
          <h3>About this event</h3>
          <p className="about">{e.description || 'No description has been added yet.'}</p>
          
          <h3>Venue Location</h3>
          <p className="sub" style={{ margin: 0 }}>{e.venue || 'Venue details to be announced'}</p>
          <EventMap venue={e.venue} />

          {galleryImgs.length > 0 && (
            <>
              <h3>Event Highlights & Gallery</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginTop: 8 }}>
                {galleryImgs.map((url, i) => (
                  <img key={i} src={url} alt="Gallery highlight" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />
                ))}
              </div>
            </>
          )}

          <h3 style={{ marginTop: 24 }}>Attendee Ratings & Reviews</h3>
          {revMsg && <div className="msg">{revMsg}</div>}
          <div className="card" style={{ background: 'var(--bg)', margin: '10px 0' }}>
            <label>Leave a Rating (Verified Attendees Only)</label>
            <div className="row" style={{ margin: '4px 0' }}>
              <select value={rating} onChange={x => setRating(+x.target.value)} style={{ width: 120 }}>
                <option value="5">★★★★★ (5/5)</option>
                <option value="4">★★★★☆ (4/5)</option>
                <option value="3">★★★☆☆ (3/5)</option>
                <option value="2">★★☆☆☆ (2/5)</option>
                <option value="1">★☆☆☆☆ (1/5)</option>
              </select>
            </div>
            <textarea rows={2} placeholder="Write a brief review..." value={comment} onChange={x => setComment(x.target.value)} />
            <button className="btn sm fill" style={{ marginTop: 6 }} onClick={submitReview}>Submit Review</button>
          </div>

          {reviews && reviews.length > 0 ? (
            reviews.map(r => (
              <div key={r.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                <div className="row" style={{ margin: 0, justifyContent: 'space-between' }}>
                  <b>{r.user_name}</b>
                  <span style={{ color: 'var(--warn)' }}>{'★'.repeat(r.rating)}</span>
                </div>
                <p style={{ margin: '4px 0', fontSize: 13 }}>{r.comment}</p>
                <small style={{ color: 'var(--mute)' }}>{fd(r.created)}</small>
              </div>
            ))
          ) : (
            <p className="sub" style={{ fontSize: 12 }}>No reviews submitted yet.</p>
          )}
        </div>
        <div className="detailside"><div className="card book">
          <div className="num" style={{ fontSize: 24 }}>{fmt(e.price)} <span className="sub" style={{ fontSize: 13, fontFamily: 'Poppins' }}>per seat</span></div>
          <p className="sub" style={{ margin: '0 0 6px' }}>{e.seats_left ? e.seats_left + ' of ' + e.capacity + ' seats left' : 'Sold out'}</p>
          {msg ? <div className="msg">{msg}</div> : e.seats_left > 0 ? <>
            <label>Seats</label>
            <input type="number" min="1" max={e.seats_left} value={b.seats} onChange={x => handleSeatsChange(x.target.value)} />

            {guests.length > 0 && (
              <div className="guest-inputs">
                <label>Additional Guests ({guests.length})</label>
                {guests.map((g, idx) => (
                  <div key={idx} className="guest-row">
                    <input placeholder={`Guest ${idx + 2} Name`} value={g.name} onChange={x => updateGuest(idx, 'name', x.target.value)} />
                    <input placeholder="Email (optional)" value={g.email} onChange={x => updateGuest(idx, 'email', x.target.value)} />
                  </div>
                ))}
              </div>
            )}

            {e.custom_question && (
              <div style={{ marginTop: 10 }}>
                <label>{e.custom_question}</label>
                <input value={customAns} onChange={x => setCustomAns(x.target.value)} placeholder="Your answer" />
              </div>
            )}

            <label style={{ marginTop: 10 }}>Promo Code (e.g. EARLYBIRD10, FLAT100)</label>
            <div className="row" style={{ margin: '4px 0' }}>
              <input value={promo} onChange={x => setPromo(x.target.value)} placeholder="Enter code" style={{ flex: 1 }} />
              <button className="btn sm" onClick={applyPromo}>Apply</button>
            </div>
            {promoErr && <p className="err" style={{ fontSize: 11 }}>{promoErr}</p>}
            {discount > 0 && <p style={{ color: 'var(--ok)', fontSize: 12, margin: '2px 0' }}>Discount applied: -{fmt(discount)}</p>}

            <label style={{ marginTop: 10 }}>Payment</label>
            <select value={b.pay} onChange={x => setB({ ...b, pay: x.target.value })}>{['upi', 'card', 'wallet', 'netbanking'].map(p => <option key={p}>{p}</option>)}</select>
            <div className="row"><button className="btn fill" style={{ flex: 1 }} onClick={request}>Request {fmt(finalPrice)}</button></div>
          </> : (
            <div style={{ marginTop: 10 }}>
              <div className="msg">This event is currently sold out.</div>
              <button className="btn fill" style={{ width: '100%', marginTop: 8 }} onClick={joinWaitlist}>Join Waitlist</button>
            </div>
          )}
          <div className="row"><button className="btn" style={{ flex: 1 }} onClick={() => { sessionStorage.setItem('contactEvent', e.id); location.hash = ''; go('Contact'); }}>Contact the organiser</button></div>
        </div></div></div></div></>;
}

function MyBookings() {
  const [rows, reload] = useLoad('/bookings');
  const [waitlist, reloadWaitlist] = useLoad('/waitlist');
  const [open, setOpen] = useState(null);
  if (!rows) return null;

  const cancel = async id => { if (confirm('Cancel this booking?')) { await api(`/bookings/${id}/cancel`, { method: 'PATCH' }).catch(alertErr); setOpen(null); reload(); } };
  const leaveWaitlist = async id => { if (confirm('Leave waitlist?')) { await api(`/waitlist/${id}`, { method: 'DELETE' }).catch(alertErr); reloadWaitlist(); } };

  const downloadPDF = async ref => {
    const t = localStorage.getItem('t');
    const res = await fetch(`/api/tickets/${ref}/pdf`, { headers: { Authorization: 'Bearer ' + t } });
    if (!res.ok) return alert('Failed to download PDF ticket.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${ref}.pdf`;
    a.click();
  };

  return <><h1>My bookings</h1><p className="sub">Once a booking is approved, show its QR ticket at the entrance or download your PDF ticket.</p>
    {open && <div className="card" style={{ marginBottom: 14, textAlign: 'center' }}><h3 style={{ margin: 0 }}>{open.event_name}</h3><p className="sub">{fd(open.event_date)} · {open.seats} seat(s)</p>
      <div style={{ background: '#fff', display: 'inline-block', padding: 12, borderRadius: 12 }}><QRCodeSVG value={open.ref} size={180} /></div>
      <p className="ref">{open.ref}</p>{open.checked_in ? <span className="pill in">CHECKED IN</span> : null}
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn sm fill" onClick={() => downloadPDF(open.ref)}>Download PDF Ticket</button>
        <button className="btn sm" onClick={() => setOpen(null)}>Close</button>
      </div></div>}
    
    <div className="wrap"><table><thead><tr><th>TICKET CODE</th><th>EVENT</th><th>GUESTS</th><th>DATE</th><th>SEATS</th><th>AMOUNT</th><th>STATUS</th><th /></tr></thead><tbody>
      {rows.map(b => <tr key={b.id}><td className="ref">{b.ref}</td><td>{b.event_name}</td>
        <td>{b.guests?.length ? b.guests.map(g => g.name).join(', ') : 'Primary Buyer Only'}</td>
        <td>{fd(b.event_date)}</td><td>{b.seats}</td><td>{fmt(b.amount)}</td><td><Pill s={b.status} /></td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {b.status === 'approved' && <><button className="btn sm fill" onClick={() => setOpen(b)}>Show ticket</button> <button className="btn sm" onClick={() => downloadPDF(b.ref)}>PDF</button></>} 
          {['pending', 'approved'].includes(b.status) && !b.checked_in && <button className="btn sm bad" onClick={() => cancel(b.id)}>Cancel</button>}
        </td></tr>)}
      {!rows.length && <tr><td colSpan="8">You haven’t booked anything yet. Browse events to get started.</td></tr>}</tbody></table></div>

    {waitlist && waitlist.length > 0 && (
      <>
        <h2 style={{ marginTop: 24 }}>Waitlist Entries</h2>
        <div className="wrap"><table><thead><tr><th>EVENT</th><th>DATE</th><th>SEATS</th><th /></tr></thead><tbody>
          {waitlist.map(w => (
            <tr key={w.id}>
              <td>{w.event_name}</td><td>{fd(w.event_date)}</td><td>{w.seats}</td>
              <td><button className="btn sm bad" onClick={() => leaveWaitlist(w.id)}>Leave Waitlist</button></td>
            </tr>
          ))}
        </tbody></table></div>
      </>
    )}
  </>;
}

const TOPIC = { event_change: 'Event change request', guest_invite: 'Invite a chief guest / VIP', general: 'General question' };
const TOPIC_HINT = { event_change: 'Tell us what should change (date, time, venue, details) and why.', guest_invite: 'Name the guest, the event or function, the date, and any details the organiser should know.', general: 'Ask anything about an event or your booking.' };

function Contact() {
  const [events] = useLoad('/events'), [rows, reload] = useLoad('/messages');
  const [f, setF] = useState(() => { const e = sessionStorage.getItem('contactEvent'); sessionStorage.removeItem('contactEvent'); return { topic: 'event_change', event_id: e || '', subject: '', body: '', phone: '' }; });
  const [errs, setErrs] = useState({}), [sent, setSent] = useState(false);
  if (!events || !rows) return null;
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setErrs({ ...errs, [k]: undefined }); setSent(false); };
  const submit = async () => {
    const x = {}; if (!f.subject.trim()) x.subject = 'Please add a subject.'; if (f.body.trim().length < 10) x.body = 'Please write at least a sentence (10+ characters).';
    setErrs(x); if (Object.keys(x).length) return;
    try { await api('/messages', { method: 'POST', body: { ...f, event_id: f.event_id ? +f.event_id : null } }); setF({ ...f, subject: '', body: '', phone: '' }); setSent(true); reload(); } catch (e) { alertErr(e); }
  };
  return <><h1>Contact the organiser</h1><p className="sub">Ask for a change to an event, invite a chief guest or VIP to a function, or ask anything else. The organiser replies here and by email.</p>
    <div className="card form" style={{ display: 'block', maxWidth: 640 }}>
      <label>What is this about?</label><select value={f.topic} onChange={set('topic')}>{Object.entries(TOPIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <label>Related event (optional)</label><select value={f.event_id} onChange={set('event_id')}><option value="">Not about a specific event</option>{events.map(e => <option key={e.id} value={e.id}>{e.name} · {fd(e.date)}</option>)}</select>
      <label>Subject</label><input className={errs.subject ? 'bad-in' : ''} maxLength={120} value={f.subject} onChange={set('subject')} />{errs.subject && <p className="err">{errs.subject}</p>}
      <label>Message</label><textarea className={errs.body ? 'bad-in' : ''} rows={6} maxLength={3000} placeholder={TOPIC_HINT[f.topic]} value={f.body} onChange={set('body')} />{errs.body && <p className="err">{errs.body}</p>}
      <label>Phone for a call back (optional)</label><input value={f.phone} maxLength={20} onChange={set('phone')} />
      {sent && <div className="msg">Message sent. You’ll see the organiser’s reply below.</div>}
      <div className="row"><button className="btn fill" onClick={submit}>Send message</button></div></div>
    <h2>Your messages</h2>
    {!rows.length && <div className="msg">You haven’t sent any messages yet.</div>}
    {rows.map(m => <div key={m.id} className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ margin: 0, justifyContent: 'space-between' }}><b>{m.subject}</b><Pill s={m.status} /></div>
      <p className="sub" style={{ margin: '2px 0 8px' }}>{TOPIC[m.topic]}{m.event_name ? ' · ' + m.event_name : ''} · {fd(m.created)}</p>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.body}</p>
      {m.reply && <div className="msg" style={{ whiteSpace: 'pre-wrap' }}><b>Organiser reply</b> ({fd(m.replied)})<br />{m.reply}</div>}</div>)}</>;
}

function Messages() {
  const [rows, reload] = useLoad('/messages'), [draft, setDraft] = useState({}), [show, setShow] = useState('open'); if (!rows) return null;
  const act = async (id, body) => { await api('/messages/' + id, { method: 'PATCH', body }).catch(alertErr); setDraft({ ...draft, [id]: '' }); reload(); };
  const list = rows.filter(m => show === 'all' || (show === 'open' ? m.status !== 'closed' : m.status === 'closed'));
  return <><h1>Messages</h1><p className="sub">Event change requests, VIP and chief guest invitations, and questions from users. Replies are saved here and emailed to the user.</p>
    <div className="row" style={{ marginTop: 0 }}>{[['open', 'Needs attention'], ['closed', 'Closed'], ['all', 'All']].map(([k, v]) => <button key={k} className={'chip ' + (show === k ? 'on' : '')} onClick={() => setShow(k)}>{v}</button>)}</div>
    {!list.length && <div className="msg">Nothing here.</div>}
    {list.map(m => <div key={m.id} className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ margin: 0, justifyContent: 'space-between' }}><b>{m.subject}</b><Pill s={m.status} /></div>
      <p className="sub" style={{ margin: '2px 0 8px' }}>{TOPIC[m.topic]}{m.event_name ? ' · ' + m.event_name : ''} · {m.user_name} ({m.user_email}){m.phone ? ' · ' + m.phone : ''} · {fd(m.created)}</p>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.body}</p>
      {m.reply && <div className="msg" style={{ whiteSpace: 'pre-wrap' }}><b>Your reply</b> ({fd(m.replied)})<br />{m.reply}</div>}
      {m.status !== 'closed' && <><label>{m.reply ? 'Send another reply' : 'Reply'}</label><textarea rows={3} value={draft[m.id] || ''} onChange={e => setDraft({ ...draft, [m.id]: e.target.value })} />
        <div className="row"><button className="btn sm fill" disabled={!(draft[m.id] || '').trim()} onClick={() => act(m.id, { reply: draft[m.id] })}>Send reply</button><button className="btn sm" onClick={() => act(m.id, { status: 'closed' })}>Mark closed</button></div></>}
      {m.status === 'closed' && <div className="row"><button className="btn sm" onClick={() => act(m.id, { status: 'open' })}>Reopen</button></div>}</div>)}</>;
}