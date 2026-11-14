# MessMesh

**Smart hostel mess management** — meal ratings, plate-waste logging, wing leaderboards, Sunday Premium Feast unlocks, and warden analytics with weekly PDF reports.

Built with **Next.js 15** (App Router, JavaScript), **MongoDB + Mongoose**, **NextAuth**, **Socket.io**, **Recharts**, and **Tailwind CSS v4**.

| | |
|--|--|
| **Repository** | [github.com/coderkrishna45/MessMesh](https://github.com/coderkrishna45/MessMesh) |

Public recruiter access is available only from a separately configured demo deployment. No production account credentials are published here.

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
| **Date simulator** | “Next Day” advances time only in explicitly enabled development/demo; weekly scores archive/reset without generating activity. |

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

### 4. Create the first administrator

After confirming that `MONGODB_URI` points to the intended database, run:

```bash
npm run create-admin
```

The command prompts for name, email, and a hidden password. It inserts a new Admin only; it rejects existing email addresses and never promotes or resets existing accounts.

Check DB without starting the app:

```bash
npm run check-db
```

---

## Roles and account onboarding

| Action | Admin | Warden | Student |
|---|---:|---:|---:|
| Manage / assign wardens | Yes | No | No |
| View management analytics | Hostel-wide | Assigned wing | No |
| Add/import/reset students | Any validated wing | Assigned wing only | No |
| Publish shared hostel menu | Yes | No (preview only) | No |
| Unlock premium wing meals | No | Assigned wing only | No |
| Rate meals / log waste | No | No | Own account only |
| View shared menus / leaderboards | Yes | Yes | Yes |

### Warden onboarding

An Admin creates a Warden from **Wardens** and assigns one of the four valid wings. The setup link is single-use and expires after 24 hours. Configure the optional `MAIL_DELIVERY_URL` / `MAIL_DELIVERY_TOKEN` HTTP integration to deliver it. In development, the UI shows an explicitly labeled invitation preview; this is not email delivery.

### Student onboarding and resets

Wardens create students manually or via the existing CSV preview/import flow. A random temporary password is shown once to the authorized operator for secure handoff; students must choose a new password before protected actions. Password resets use another random temporary credential, invalidate current sessions, and require a password change. Password changes require signing in again.

## Separate public portfolio demo

Host the public demo as a separate deployment and database. Set:

```env
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
DEMO_MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/messmesh_demo
REAL_DATABASE_NAME=<private-application-database-name-only>
NEXTAUTH_URL=https://your-demo-host.example
NEXTAUTH_SECRET=<unique demo-only secret>
ENABLE_DATE_SIMULATION=false
NEXT_PUBLIC_ENABLE_DATE_SIMULATION=false
```

`DEMO_MONGODB_URI` must use a distinct database whose name contains `demo`; `REAL_DATABASE_NAME` is only the private application database name, not a URI or credential. Leave `MONGODB_URI` unset on the demo service, and never copy the private app's database credentials or authentication secret there. The application fails closed if demo configuration is incomplete or conflicting. The login page then shows three server-authenticated fictional entry buttons.

Date simulation is optional. Leave both flags false or unset for real server time, or set both to `true` to enable the demo date controls. The initializer seeds a menu for the current server week in real-time mode and for the fixed demo week in simulation mode.

Initialize or periodically restore only the isolated demo database:

```bash
npm run demo:reset
```

This command additionally requires `DEMO_RESET_CONFIRM=YES_DEMO_RESET` and refuses a non-demo or same-name database. It clears and recreates the weekly-score state and menu-initialization lock records along with fictional demo data. For a Free Render service, run it once from a clean local checkout with only demo database settings in the environment; do not rely on Dashboard Shell access. Schedule it only against the dedicated demo database and only if periodically erasing recruiter-created activity is intended. The legacy `npm run seed` and `/api/seed` are destructive, separate from this demo reset, and disabled in production and demo deployments. In a non-production environment they require explicit `ALLOW_DB_SEED=true` and a dedicated `SEED_SECRET`; never use them on an existing database.

### Recruiter walkthrough

1. Select **Explore as Admin** to inspect hostel-wide analytics, create fictional wardens, assign wings, and preview shared-menu publication.
2. Select **Explore as Warden** to review assigned-wing analytics, add/import fictional students, reset a fictional student's password, and try the wing feast workflow.
3. Select **Explore as Student** to view the shared menu and leaderboard, rate a meal, log fictional plate waste, and inspect personal rating history.
4. The persistent demo banner identifies the environment and all displayed activity as fictional.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start custom server + Socket.io (development) |
| `npm run build` | Production Next.js build |
| `npm start` | Start server after build |
| `npm run seed` | Legacy destructive seed; non-production only, explicitly gated, never for an existing database |
| `npm run create-admin` | Safely insert the first administrator interactively |
| `npm run demo:reset` | Explicitly reset the separately configured demo database |
| `npm run test:security` | Run focused authorization policy tests |
| `npm run test:browser` | Run the Admin navigation browser regression test (`TEST_BROWSER=true`, `TEST_HTTP_BASE_URL`) |
| `npm run check-db` | Test MongoDB connection from `.env.local` |
| `npm run lint` | ESLint |

---

## Project structure (high level)

```
MessMesh/
├── server.js                 # Custom HTTP + Socket.io server
├── scripts/
│   ├── check-db.js           # DB connectivity check
│   ├── seed-once.js          # Explicitly gated legacy destructive seed client
│   ├── create-admin.mjs      # Interactive first-admin bootstrap
│   └── reset-demo.mjs        # Demo-only fictional data initialization/reset
├── src/
│   ├── app/                  # App Router pages + API routes
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── vote/
│   │   ├── waste-log/
│   │   ├── leaderboard/
│   │   ├── admin/            # Management analytics and Admin warden management
│   │   ├── warden/manage-students/
│   │   └── api/              # REST + seed endpoints
│   ├── components/           # Navbar, Footer, ForcePasswordChange
│   └── lib/                  # auth, db, models, PDF report
├── .env.example
├── DEPLOY.md                 # Production / hosting checklist
└── README.md
```

---

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

Full production checklist: **[DEPLOY.md](./DEPLOY.md)**

---

## Team

College team project — MessMesh (hostel mess intelligence).

For issues or setup help, open an issue on the GitHub repo or follow `DEPLOY.md`.
