import express from 'express'; import cors from 'cors'; import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import crypto from 'crypto'; import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url'; import PDFDocument from 'pdfkit'; import QRCode from 'qrcode';
import { bookingMail, replyMail } from './mail.js';

const PROD = process.env.NODE_ENV === 'production';
if (PROD && (process.env.JWT_SECRET || '').length < 32) { console.error('Set JWT_SECRET to a random string of 32+ characters before running in production.'); process.exit(1); }
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const db = new DatabaseSync(process.env.DB_FILE || 'eventure.db'); db.exec('PRAGMA foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT, password TEXT, role TEXT DEFAULT 'user', created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER REFERENCES categories(id), date TEXT, price INTEGER, capacity INTEGER, description TEXT DEFAULT '', venue TEXT DEFAULT '', time TEXT DEFAULT '', image_url TEXT DEFAULT '', custom_question TEXT DEFAULT '', gallery TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS promo_codes(id INTEGER PRIMARY KEY, code TEXT UNIQUE, type TEXT, value INTEGER, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY, ref TEXT UNIQUE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER REFERENCES events(id) ON DELETE CASCADE, seats INTEGER, payment TEXT, status TEXT DEFAULT 'pending', checked_in INTEGER DEFAULT 0, custom_answer TEXT DEFAULT '', discount INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS guests(id INTEGER PRIMARY KEY, booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE, name TEXT, email TEXT);
CREATE TABLE IF NOT EXISTS waitlist(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER REFERENCES events(id) ON DELETE CASCADE, seats INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, event_id INTEGER REFERENCES events(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, rating INTEGER, comment TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(event_id, user_id));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER REFERENCES events(id) ON DELETE SET NULL, topic TEXT, subject TEXT, body TEXT, phone TEXT DEFAULT '', status TEXT DEFAULT 'open', reply TEXT DEFAULT '', replied TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS favorites(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER REFERENCES events(id) ON DELETE CASCADE, created TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, event_id));`);

// migrations for existing databases
for (const c of ['description', 'venue', 'time', 'image_url', 'custom_question', 'gallery'])
  if (!db.prepare('PRAGMA table_info(events)').all().some(x => x.name === c)) db.exec(`ALTER TABLE events ADD COLUMN ${c} TEXT DEFAULT ''`);

for (const [col, type] of [['discount', 'INTEGER DEFAULT 0'], ['custom_answer', "TEXT DEFAULT ''"]])
  if (!db.prepare('PRAGMA table_info(bookings)').all().some(x => x.name === col)) db.exec(`ALTER TABLE bookings ADD COLUMN ${col} ${type}`);

if (!db.prepare('SELECT 1 FROM promo_codes').get()) {
  db.prepare('INSERT INTO promo_codes(code, type, value) VALUES(?,?,?)').run('EARLYBIRD10', 'percent', 10);
  db.prepare('INSERT INTO promo_codes(code, type, value) VALUES(?,?,?)').run('FLAT100', 'flat', 100);
}

if (!db.prepare('SELECT 1 FROM users WHERE email=?').get('staff@events.com')) {
  db.prepare('INSERT INTO users(name,email,phone,password,role) VALUES(?,?,?,?,?)').run('Scanner Staff', 'staff@events.com', '', bcrypt.hashSync('staff123', 10), 'staff');
}

if (PROD && !db.prepare('SELECT 1 FROM users').get()) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || (ADMIN_PASSWORD || '').length < 8) { console.error('First production run: set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) to create the admin account.'); process.exit(1); }
  db.prepare('INSERT INTO users(name,email,phone,password,role) VALUES(?,?,?,?,?)').run('Admin', ADMIN_EMAIL.toLowerCase(), '', bcrypt.hashSync(ADMIN_PASSWORD, 10), 'admin');
  ['Food & Drink', 'Music', 'Arts & Theatre', 'Technology', 'Sports'].forEach(n => db.prepare('INSERT INTO categories(name) VALUES(?)').run(n));
}
if (!db.prepare('SELECT 1 FROM users').get()) {
  const u = db.prepare('INSERT INTO users(name,email,phone,password,role) VALUES(?,?,?,?,?)');
  u.run('Event Admin', 'admin@events.com', '', bcrypt.hashSync('admin123', 10), 'admin');
  u.run('Demo User', 'user@events.com', '8888888888', bcrypt.hashSync('user123', 10), 'user');
  ['Food & Drink', 'Music', 'Arts & Theatre', 'Technology', 'Sports'].forEach(n => db.prepare('INSERT INTO categories(name) VALUES(?)').run(n));
  [['Dance and Dine', 1, '2026-12-01', 699, 150], ['Indie Sunset Fest', 2, '2026-12-12', 799, 300], ['Brush & Canvas Expo', 3, '2026-12-20', 299, 150],
  ['DevConnect 2027', 4, '2027-01-05', 1499, 500], ['City Marathon', 5, '2027-02-01', 499, 1000]]
    .forEach(e => db.prepare('INSERT INTO events(name,category_id,date,price,capacity) VALUES(?,?,?,?,?)').run(...e));
}

const app = express(); app.use(cors()); app.use(express.json());
const sign = u => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const auth = (req, res, next) => { try { req.u = jwt.verify((req.headers.authorization || '').slice(7), SECRET); next(); } catch { res.status(401).json({ error: 'Please sign in again.' }); } };
const admin = (req, res, next) => req.u.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });
const scannerOrAdmin = (req, res, next) => ['admin', 'staff'].includes(req.u.role) ? next() : res.status(403).json({ error: 'Staff or Admins only.' });
const fail = (m, code = 400) => { throw Object.assign(new Error(m), { code }); };
const h = fn => (req, res) => { try { const r = fn(req, res); if (r !== undefined) res.json(r); } catch (e) { res.status(typeof e.code === 'number' ? e.code : 400).json({ error: e.message }); } };
const one = (sql, ...a) => db.prepare(sql).get(...a), all = (sql, ...a) => db.prepare(sql).all(...a), run = (sql, ...a) => db.prepare(sql).run(...a);

const EV = `SELECT e.*, c.name category, 
  e.capacity - COALESCE((SELECT SUM(seats) FROM bookings WHERE event_id=e.id AND status IN ('pending','approved')),0) seats_left,
  COALESCE((SELECT AVG(rating) FROM reviews WHERE event_id=e.id), 0) avg_rating,
  (SELECT COUNT(*) FROM reviews WHERE event_id=e.id) review_count
  FROM events e LEFT JOIN categories c ON c.id=e.category_id`;

const BK = `SELECT b.*, u.name user_name, u.email user_email, e.name event_name, e.date event_date, e.venue event_venue, e.time event_time, (e.price*b.seats - COALESCE(b.discount,0)) amount FROM bookings b JOIN users u ON u.id=b.user_id JOIN events e ON e.id=b.event_id`;

// auth
app.post('/api/auth/register', h(req => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password || password.length < 6) fail('Enter a name, an email and a password of 6+ characters.');
  try {
    const r = run('INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)', name, email.toLowerCase(), phone || '', bcrypt.hashSync(password, 10));
    const u = one('SELECT * FROM users WHERE id=?', r.lastInsertRowid); return { token: sign(u), user: pub(u) };
  }
  catch (e) { if (/UNIQUE/i.test(e.message)) fail('That email is already registered.'); throw e; }
}));
app.post('/api/auth/login', h(req => {
  const u = one('SELECT * FROM users WHERE email=?', (req.body.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password)) fail('Email or password is incorrect.', 401);
  return { token: sign(u), user: pub(u) };
}));

// events
const evArgs = b => {
  if (!b.name?.trim() || !b.date || !(+b.capacity > 0)) fail('Enter a name, a date and a seat count.');
  const img = (b.image_url || '').trim(); if (img && !/^https?:\/\/\S+$/i.test(img)) fail('The cover image must be a link starting with http:// or https://.');
  return [b.name.trim(), +b.category_id, b.date, +b.price || 0, +b.capacity, (b.description || '').trim(), (b.venue || '').trim(), b.time || '', img, (b.custom_question || '').trim(), (b.gallery || '').trim()];
};
app.get('/api/events', auth, h(() => all(EV + ' ORDER BY e.date')));
app.post('/api/events', auth, admin, h(req => ({ id: run('INSERT INTO events(name,category_id,date,price,capacity,description,venue,time,image_url,custom_question,gallery) VALUES(?,?,?,?,?,?,?,?,?,?,?)', ...evArgs(req.body)).lastInsertRowid })));
app.put('/api/events/:id', auth, admin, h(req => { run('UPDATE events SET name=?,category_id=?,date=?,price=?,capacity=?,description=?,venue=?,time=?,image_url=?,custom_question=?,gallery=? WHERE id=?', ...evArgs(req.body), req.params.id); return { ok: true }; }));
app.delete('/api/events/:id', auth, admin, h(req => { run('DELETE FROM events WHERE id=?', req.params.id); return { ok: true }; }));
app.get('/api/events/:id/attendees', auth, admin, h(req => all(BK + " WHERE b.event_id=? AND b.status='approved'", req.params.id)));

// reviews
app.get('/api/events/:id/reviews', auth, h(req => {
  return all('SELECT r.*, u.name user_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.event_id=? ORDER BY r.created DESC', req.params.id);
}));

app.post('/api/events/:id/reviews', auth, h(req => {
  const { rating, comment } = req.body;
  const num = +rating;
  if (!num || num < 1 || num > 5) fail('Choose a star rating between 1 and 5.');
  
  // check if user had an approved booking
  const attended = one("SELECT 1 FROM bookings WHERE event_id=? AND user_id=? AND status='approved'", req.params.id, req.u.id);
  if (!attended) fail('Only verified attendees can submit a review.');

  try {
    run('INSERT INTO reviews(event_id, user_id, rating, comment) VALUES(?,?,?,?)', req.params.id, req.u.id, num, (comment || '').trim());
    return { ok: true };
  } catch {
    fail('You have already submitted a review for this event.');
  }
}));

// promo codes
app.post('/api/promo/validate', auth, h(req => {
  const { code, amount } = req.body;
  if (!code) fail('Enter a promo code.');
  const p = one('SELECT * FROM promo_codes WHERE code=? AND active=1', code.trim().toUpperCase());
  if (!p) fail('Invalid promo code.');
  let discount = 0;
  if (p.type === 'percent') discount = Math.round((amount * p.value) / 100);
  else if (p.type === 'flat') discount = Math.min(amount, p.value);
  return { code: p.code, discount };
}));

// favorites / wishlist
app.get('/api/favorites', auth, h(req => all('SELECT event_id FROM favorites WHERE user_id=?', req.u.id).map(r => r.event_id)));
app.post('/api/favorites/toggle', auth, h(req => {
  const { eventId } = req.body;
  if (!eventId) fail('Event ID is required.');
  const existing = one('SELECT id FROM favorites WHERE user_id=? AND event_id=?', req.u.id, eventId);
  if (existing) {
    run('DELETE FROM favorites WHERE id=?', existing.id);
    return { favorited: false };
  } else {
    run('INSERT INTO favorites(user_id, event_id) VALUES(?, ?)', req.u.id, eventId);
    return { favorited: true };
  }
}));

// categories
app.get('/api/categories', auth, h(() => all('SELECT c.*, (SELECT COUNT(*) FROM events WHERE category_id=c.id) events FROM categories c ORDER BY name')));
app.post('/api/categories', auth, admin, h(req => { if (!req.body.name?.trim()) fail('Enter a category name.'); try { run('INSERT INTO categories(name) VALUES(?)', req.body.name.trim()); return { ok: true }; } catch { fail('That category already exists.'); } }));
app.delete('/api/categories/:id', auth, admin, h(req => { if (one('SELECT 1 FROM events WHERE category_id=?', req.params.id)) fail('Move or delete this category’s events first.'); run('DELETE FROM categories WHERE id=?', req.params.id); return { ok: true }; }));

// bookings
app.get('/api/bookings', auth, h(req => {
  const list = req.u.role === 'admin' ? all(BK + ' ORDER BY b.created DESC, b.id DESC') : all(BK + ' WHERE b.user_id=? ORDER BY b.id DESC', req.u.id);
  return list.map(b => ({ ...b, guests: all('SELECT name, email FROM guests WHERE booking_id=?', b.id) }));
}));

app.post('/api/bookings', auth, h(req => {
  const { eventId, seats, payment, guests, custom_answer, discount } = req.body, e = one(EV + ' WHERE e.id=?', eventId), n = +seats;
  if (!e) fail('Event not found.', 404); if (!(n > 0)) fail('Choose at least one seat.');
  if (e.seats_left < n) fail(`Only ${e.seats_left} seats available. You can join the waitlist instead.`);

  const ref = 'EVT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const res = run('INSERT INTO bookings(ref,user_id,event_id,seats,payment,custom_answer,discount) VALUES(?,?,?,?,?,?,?)', ref, req.u.id, eventId, n, payment || 'upi', (custom_answer || '').trim(), +discount || 0);
  const bookingId = res.lastInsertRowid;

  if (Array.isArray(guests)) {
    guests.forEach(g => {
      if (g.name?.trim()) run('INSERT INTO guests(booking_id, name, email) VALUES(?,?,?)', bookingId, g.name.trim(), (g.email || '').trim().toLowerCase());
    });
  }

  bookingMail('requested', one(BK + ' WHERE b.ref=?', ref)).catch(console.error);
  return { ref };
}));

app.get('/api/waitlist', auth, h(req => all(`SELECT w.*, e.name event_name, e.date event_date FROM waitlist w JOIN events e ON e.id=w.event_id WHERE w.user_id=?`, req.u.id)));
app.post('/api/waitlist', auth, h(req => {
  const { eventId, seats } = req.body, n = +seats || 1;
  if (!eventId) fail('Event ID is required.');
  const existing = one('SELECT id FROM waitlist WHERE user_id=? AND event_id=?', req.u.id, eventId);
  if (existing) fail('You are already on the waitlist for this event.');
  run('INSERT INTO waitlist(user_id, event_id, seats) VALUES(?,?,?)', req.u.id, eventId, n);
  return { ok: true };
}));
app.delete('/api/waitlist/:id', auth, h(req => { run('DELETE FROM waitlist WHERE id=? AND user_id=?', req.params.id, req.u.id); return { ok: true }; }));

app.patch('/api/bookings/:id/status', auth, admin, h(req => {
  if (!['approved', 'rejected'].includes(req.body.status)) fail('Invalid status.');
  run('UPDATE bookings SET status=? WHERE id=?', req.body.status, req.params.id);
  const b = one(BK + ' WHERE b.id=?', req.params.id);
  if (b) bookingMail(req.body.status, b).catch(console.error);
  return { ok: true };
}));
app.patch('/api/bookings/:id/cancel', auth, h(req => { run("UPDATE bookings SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('pending','approved')", req.params.id, req.u.id); return { ok: true }; }));

// PDF ticket pass
app.get('/api/tickets/:ref/pdf', auth, async (req, res) => {
  try {
    const b = one(BK + ' WHERE b.ref=?', req.params.ref.toUpperCase());
    if (!b) return res.status(404).json({ error: 'Ticket not found.' });
    if (b.user_id !== req.u.id && !['admin', 'staff'].includes(req.u.role)) return res.status(403).json({ error: 'Unauthorized.' });

    const qrDataUrl = await QRCode.toDataURL(b.ref, { margin: 1, width: 140 });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    const doc = new PDFDocument({ size: 'A5', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${b.ref}.pdf"`);
    doc.pipe(res);

    doc.rect(10, 10, doc.page.width - 20, doc.page.height - 20).strokeColor('#a45fc2').lineWidth(2).stroke();
    doc.fontSize(20).fillColor('#a45fc2').text('EVENTURE PASS', { align: 'center' }).moveDown(0.5);
    doc.fontSize(16).fillColor('#2d2540').text(b.event_name, { align: 'center' }).moveDown(0.5);

    doc.fontSize(10).fillColor('#7d7490')
      .text(`Date: ${b.event_date} ${b.event_time ? 'at ' + b.event_time : ''}`)
      .text(`Venue: ${b.event_venue || 'To be announced'}`)
      .text(`Attendee: ${b.user_name} (${b.user_email})`)
      .text(`Seats: ${b.seats} · Paid: ₹${b.amount}`)
      .text(`Ref: ${b.ref}`)
      .moveDown(1);

    doc.image(qrBuffer, (doc.page.width - 140) / 2, doc.y, { width: 140 });
    doc.moveDown(7.5);
    doc.fontSize(8).fillColor('#a79cba').text('Please present this PDF or QR code at the event entrance.', { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate PDF ticket.' });
  }
});

// messages
const TOPICS = ['event_change', 'guest_invite', 'general'];
const MSG = `SELECT m.*, u.name user_name, u.email user_email, e.name event_name FROM messages m JOIN users u ON u.id=m.user_id LEFT JOIN events e ON e.id=m.event_id`;
app.get('/api/messages', auth, h(req => req.u.role === 'admin' ? all(MSG + ' ORDER BY (m.status=\'closed\'), m.created DESC, m.id DESC') : all(MSG + ' WHERE m.user_id=? ORDER BY m.id DESC', req.u.id)));
app.post('/api/messages', auth, h(req => {
  const b = req.body, subject = (b.subject || '').trim(), body = (b.body || '').trim();
  if (!TOPICS.includes(b.topic)) fail('Choose what your message is about.');
  if (!subject || body.length < 10) fail('Add a subject and a message of at least 10 characters.');
  if (subject.length > 120 || body.length > 3000) fail('That message is too long.');
  if (b.event_id && !one('SELECT 1 FROM events WHERE id=?', b.event_id)) fail('That event no longer exists.', 404);
  run('INSERT INTO messages(user_id,event_id,topic,subject,body,phone) VALUES(?,?,?,?,?,?)', req.u.id, b.event_id || null, b.topic, subject, body, (b.phone || '').trim().slice(0, 20));
  return { ok: true };
}));
app.patch('/api/messages/:id', auth, admin, h(req => {
  const { reply, status } = req.body, m = one(MSG + ' WHERE m.id=?', req.params.id); if (!m) fail('Message not found.', 404);
  if (status && !['open', 'replied', 'closed'].includes(status)) fail('Invalid status.');
  if (reply?.trim()) { run("UPDATE messages SET reply=?, replied=CURRENT_TIMESTAMP, status=? WHERE id=?", reply.trim(), status || 'replied', m.id); replyMail(m, reply.trim()).catch(console.error); }
  else if (status) run('UPDATE messages SET status=? WHERE id=?', status, m.id);
  return { ok: true };
}));

// check-in
app.get('/api/tickets/:ref', auth, scannerOrAdmin, h(req => one(BK + ' WHERE b.ref=?', req.params.ref.toUpperCase()) || fail('No ticket matches that code.', 404)));
app.post('/api/tickets/:ref/checkin', auth, scannerOrAdmin, h(req => { run("UPDATE bookings SET checked_in=1 WHERE ref=? AND status='approved'", req.params.ref.toUpperCase()); return { ok: true }; }));

// users + stats
app.get('/api/users', auth, admin, h(() => all("SELECT id,name,email,phone,created,(SELECT COUNT(*) FROM bookings WHERE user_id=users.id) bookings FROM users WHERE role='user'")));
app.delete('/api/users/:id', auth, admin, h(req => { run("DELETE FROM users WHERE id=? AND role='user'", req.params.id); return { ok: true }; }));
app.get('/api/stats', auth, admin, h(() => {
  const A = "FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.status='approved'";
  return {
    totalEvents: one('SELECT COUNT(*) n FROM events').n, upcoming: one("SELECT COUNT(*) n FROM events WHERE date>=date('now')").n,
    pending: one("SELECT COUNT(*) n FROM bookings WHERE status='pending'").n, openMessages: one("SELECT COUNT(*) n FROM messages WHERE status='open'").n, approved: one("SELECT COUNT(*) n " + A).n,
    revenue: one('SELECT COALESCE(SUM(e.price*b.seats - COALESCE(b.discount,0)),0) n ' + A).n, users: one("SELECT COUNT(*) n FROM users WHERE role='user'").n,
    byDate: all('SELECT date(b.created) date, SUM(e.price*b.seats - COALESCE(b.discount,0)) revenue ' + A + ' GROUP BY date ORDER BY date'),
    byCategory: all('SELECT c.name name, SUM(b.seats) value ' + A.replace('WHERE', 'JOIN categories c ON c.id=e.category_id WHERE') + ' GROUP BY c.id'),
    checkin: all('SELECT e.name name, SUM(b.seats) total, SUM(CASE WHEN b.checked_in THEN b.seats ELSE 0 END) checked ' + A + ' GROUP BY e.id'),
  };
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'An internal server error occurred.' });
});

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/^\/(?!api\/).*/, (_, res) => res.sendFile(path.join(dist, 'index.html'))); }

app.listen(process.env.PORT || 4000, () => console.log('Eventure running on port ' + (process.env.PORT || 4000)));