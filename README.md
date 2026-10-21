# Eventure

React (Vite) + Express + SQLite. Admin panel and attendee booking in one app.

## Run it
Needs Node 18+. Use two terminals:

    cd server && npm install && npm run dev      # API on :4000
    cd client && npm install && npm run dev      # app on :5173

Open http://localhost:5173. The first run creates `server/eventure.db` with sample data.

- Admin: admin@events.com / admin123
- Attendee: user@events.com / user123

## Before you deploy
- Set `JWT_SECRET` to a long random value.
- Change or delete the seeded demo accounts.
- Serve the built client (`npm run build` in client/) behind HTTPS, with the API on the same origin or CORS restricted.

## Layout
- `server/index.js`: schema, seed data, auth (JWT, bcrypt), and all API routes
- `client/src/App.jsx`: login, admin pages, attendee pages
