// Adds demo users and bookings so the admin dashboard has data to show.
//   node seed-demo.js           add demo data (safe to run twice)
//   node seed-demo.js --remove  delete everything this script added
import { DatabaseSync } from 'node:sqlite'; import bcrypt from 'bcryptjs'; import crypto from 'crypto';

const db = new DatabaseSync(process.env.DB_FILE || 'eventure.db'); db.exec('PRAGMA foreign_keys = ON');
const DOMAIN = '@demo.eventure';

if (process.argv.includes('--remove')) {
  const r = db.prepare('DELETE FROM users WHERE email LIKE ?').run('%' + DOMAIN);   // bookings go with them
  console.log(`Removed ${r.changes} demo users and their bookings.`); process.exit();
}
if (db.prepare('SELECT 1 FROM users WHERE email LIKE ?').get('%' + DOMAIN)) { console.log('Demo data is already there. Run with --remove first to reset it.'); process.exit(); }

const events = db.prepare('SELECT id, capacity FROM events').all();
if (!events.length) { console.log('Create some events first.'); process.exit(); }

const names = ['Aarav Sharma', 'Diya Patel', 'Vihaan Gupta', 'Ananya Iyer', 'Kabir Singh', 'Ishita Rao', 'Arjun Mehta', 'Meera Nair', 'Rohan Verma', 'Saanvi Reddy', 'Aditya Joshi', 'Kavya Menon', 'Dev Malhotra', 'Riya Kapoor', 'Nikhil Das'];
const hash = bcrypt.hashSync('demo123', 10);
const addUser = db.prepare('INSERT INTO users(name,email,phone,password,created) VALUES(?,?,?,?,?)');
const addBooking = db.prepare('INSERT INTO bookings(ref,user_id,event_id,seats,payment,status,checked_in,created) VALUES(?,?,?,?,?,?,?,?)');

let seed = 7; const rnd = n => (seed = (seed * 16807) % 2147483647) % n;   // fixed seed: same demo data every time
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().replace('T', ' ').slice(0, 19);
const left = Object.fromEntries(events.map(e => [e.id, e.capacity - (db.prepare("SELECT COALESCE(SUM(seats),0) n FROM bookings WHERE event_id=? AND status IN ('pending','approved')").get(e.id).n)]));

let users = 0, bookings = 0;
names.forEach((n, i) => {
  const uid = addUser.run(n, n.toLowerCase().replace(/ /g, '.') + DOMAIN, '9' + String(800000000 + i * 7919431).slice(0, 9), hash, daysAgo(30 - i * 2)).lastInsertRowid; users++;
  for (let k = 0, count = 1 + rnd(3); k < count; k++) {
    const e = events[rnd(events.length)], seats = 1 + rnd(4); if (seats > left[e.id]) continue;
    const roll = rnd(100), status = roll < 62 ? 'approved' : roll < 80 ? 'pending' : roll < 90 ? 'rejected' : 'cancelled';
    if (status === 'approved' || status === 'pending') left[e.id] -= seats;
    addBooking.run('EVT-' + crypto.randomBytes(6).toString('hex').toUpperCase(), uid, e.id, seats, ['upi', 'card', 'wallet', 'netbanking'][rnd(4)], status,
      status === 'approved' && rnd(100) < 45 ? 1 : 0, daysAgo(rnd(29))); bookings++;
  }
});
console.log(`Added ${users} demo users and ${bookings} bookings. Demo login password for all of them: demo123`);
