# MessMesh

**Smart hostel mess management** — meal ratings, plate-waste logging, wing leaderboards, Sunday Premium Feast unlocks, and warden analytics with weekly PDF reports.

Built with **Next.js 15** (App Router, JavaScript), **MongoDB + Mongoose**, **NextAuth**, **Socket.io**, **Recharts**, and **Tailwind CSS v4**.

| | |
|--|--|
| **Live demo** | [https://messmesh.onrender.com/login](https://messmesh.onrender.com/login) |
| **Repository** | [github.com/coderkrishna45/MessMesh](https://github.com/coderkrishna45/MessMesh) |

### Live demo login

| Field | Value |
|-------|--------|
| Roll number | `123456` |
| Password | `123456@Mess2026` |

*(After first login, the app may ask you to set a new password.)*

---

## Features

| Area | What it does |
|------|----------------|
| **Auth** | Credentials login (email **or** roll number). Force password change on first login / after warden reset. |
| **Rate meals** | Students rate today’s dishes (1–5★). Real-time averages via Socket.io. Wardens monitor read-only. |
| **Rating history** | Student week matrix (current / last week / 2 weeks ago). |
| **Log waste** | Plate waste 1–5 + optional Cloudinary photo. Updates Clean Plate Score. |
| **Leaderboard** | Wing + individual standings; Sunday Feast lock/unlock badges (avg ≥ 90). |
| **Warden analytics** | Metrics, waste charts, Prophet-style forecast, menu generate/publish, feast unlock. |
| **Weekly PDF** | Download professional weekly report (leaderboard, top/bottom dishes, waste, forecast). |
| **Manage students** | Manual add + CSV bulk upload (PapaParse), roster table, password reset. |
| **Notifications** | Bell panel + toasts (feast unlock, high waste, date advanced). |
| **Date simulator** | “Next Day” advances simulated hostel date and auto-logs sample activity. |

---

## Quick start (local)

### Important: one server only

`npm run dev` **already runs** `node server.js` (Next + Socket.io on port **3000**).

| Do this | Do **not** do this |
|---------|---------------------|
| One terminal → `npm run dev` | Run both `npm run dev` **and** `node server.js` |

Running both causes: **`EADDRINUSE: port 3000 already in use`**.

Free a stuck port (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### 1. Clone & install

```bash
git clone https://github.com/coderkrishna45/MessMesh.git
cd MessMesh
npm install
```

### 2. Environment

```bash
copy .env.example .env.local
```

Minimum in `.env.local`:

```env
MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER/messmesh?retryWrites=true&w=majority"
NEXTAUTH_SECRET="any-long-random-string"
NEXTAUTH_URL="http://localhost:3000"
```

Optional (waste photo uploads; otherwise a placeholder image is used):

```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your-cloud-name"
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET="messmesh_waste"
```

See **`.env.example`** and **`DEPLOY.md`** for production variables.

### 3. Run the app

```bash
npm run dev
```

Open **http://localhost:3000**

### 4. Seed demo data (optional)

With the server **already running**:

```bash
npm run seed
```

Or visit **http://localhost:3000/api/seed** once (local dev).

Check DB without starting the app:

```bash
npm run check-db
```

---

## Demo accounts (after local seed)

| Role | Login | Password |
|------|--------|----------|
| Warden (A-Wing) | `warden1@messmesh.com` | `warden123` |
| Warden (B-Wing) | `warden2@messmesh.com` | `warden123` |
| Student | `student1@messmesh.com` | `student123` |
| Student | `student3@messmesh.com` | `student123` |

On local `/login`, use the **Developer Tool** quick-login cards (shown only in development builds).

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start custom server + Socket.io (development) |
| `npm run build` | Production Next.js build |
| `npm start` | Start server after build |
| `npm run seed` | Call `/api/seed` (server must be running) |
| `npm run check-db` | Test MongoDB connection from `.env.local` |
| `npm run lint` | ESLint |

---

## Project structure (high level)

```
MessMesh/
├── server.js                 # Custom HTTP + Socket.io server
├── scripts/
│   ├── check-db.js           # DB connectivity check
│   └── seed-once.js          # One-shot seed HTTP client
├── src/
│   ├── app/                  # App Router pages + API routes
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── vote/
│   │   ├── waste-log/
│   │   ├── leaderboard/
│   │   ├── admin/            # Warden analytics
│   │   ├── warden/manage-students/
│   │   └── api/              # REST + seed endpoints
│   ├── components/           # Navbar, Footer, ForcePasswordChange
│   └── lib/                  # auth, db, models, PDF report
├── .env.example
├── DEPLOY.md                 # Production / hosting checklist
└── README.md
```

---

## College demo walkthrough

1. Open live site or run `npm run dev` locally  
2. Log in (live credentials above, or local quick-login)  
3. **Dashboard** → Download Weekly Report (warden)  
4. **Students** → add a student or show CSV upload  
5. **Analytics** → charts, forecast, feast panel  
6. As student → rate meals, log waste, leaderboard  
7. Optional: **Next Day** in the navbar to advance simulation  

---

## Tech stack

- **Next.js 15** App Router (JavaScript)
- **MongoDB** + **Mongoose**
- **NextAuth.js** (credentials; Google optional via env)
- **Socket.io** (real-time ratings & notifications)
- **Recharts**, **jsPDF**, **PapaParse**, **Cloudinary**, **Tailwind CSS v4**

---

## Deploy

This app uses a **custom Node server** for Socket.io. Prefer **Railway / Render / Fly** (long-running process), not pure Vercel serverless.

Current production host: **[Render](https://messmesh.onrender.com/login)**

Full production checklist: **[DEPLOY.md](./DEPLOY.md)**

---

## Team

College team project — MessMesh (hostel mess intelligence).

For issues or setup help, open an issue on the GitHub repo or follow `DEPLOY.md`.
