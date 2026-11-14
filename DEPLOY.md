# MessMesh — Deploy Checklist (you do these steps)

Code-side production hardening is already in the repo. Follow this guide for Atlas, secrets, and hosting.

---

## What the code already does for you

| Done in code | Detail |
|---|---|
| Legacy seed lock | Destructive `/api/seed` is disabled in production and demo deployments; do not run it on an existing database |
| Server bind | Listens on `0.0.0.0` (Railway/Render friendly) |
| Socket CORS | Restricted to `NEXTAUTH_URL` (+ optional `SOCKET_CORS_ORIGIN`) |
| Demo login | Available only when demo mode and a distinct demo database are explicitly configured |
| Google OAuth | Only registered if real env vars are set |
| Cloudinary | Uses `NEXT_PUBLIC_CLOUDINARY_*` env vars |
| Security headers | `X-Frame-Options`, `nosniff`, etc. via `next.config.mjs` |

---

## Step 1 — MongoDB Atlas (database)

1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com) and create a free account.
2. **Build a Database** → free **M0** cluster → pick a region close to you.
3. **Database Access** → Add user → username + strong password → role: *Atlas admin* or *read/write any database*.  
   Save the password somewhere safe.
4. **Network Access** → Add IP Address:
   - For quick deploy: `0.0.0.0/0` (allow from anywhere).
   - Or add only your host’s IPs later for tighter security.
5. **Database** → **Connect** → **Drivers** → copy the URI, e.g.  
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Edit it to include a database name:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/messmesh?retryWrites=true&w=majority
   ```
7. That string is your **`MONGODB_URI`**.

---

## Step 2 — Generate secrets

### PowerShell (Windows)

```powershell
# NEXTAUTH_SECRET
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Copy the output. You need this as **`NEXTAUTH_SECRET`**.

---

## Step 3 — Choose a host (do NOT use Vercel for this app)

MessMesh uses a **custom Node server + Socket.io**. Use one of:

| Platform | Why |
|---|---|
| **Railway** (recommended) | Easy, WebSockets work, free trial |
| **Render** | Free web service tier, WebSockets OK |
| **Fly.io** | Good for always-on Node |

**Avoid Vercel** for this project — serverless cannot run this Socket.io setup as written.

### Example: Railway

1. Push your code to **GitHub** (if not already).
2. Go to [https://railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select MessMesh.
3. Open the service → **Variables** → add (see Step 4).
4. **Settings**:
   - **Build command:** `npm run build` (or leave default if it detects Next)
   - **Start command:** `npm start`  
     (`npm start` runs `node server.js` — required)
5. Deploy. Copy the public URL, e.g. `https://messmesh-production.up.railway.app`.

### Example: Render

For the public portfolio demo, create a **separate** Render Web Service:

1. In Render, choose **New → Web Service**, connect `coderkrishna45/MessMesh`, and select branch `feat/secure-role-account-management` after confirming it contains the reviewed commit.
2. Set **Runtime** to Node and choose a region near the demo database and expected visitors.
3. Set **Build Command** to `npm ci && npm run build`.
4. Set **Start Command** to `npm start`. This starts `server.js`, which serves Next.js and Socket.IO together.
5. Choose **Free** if you are only previewing without a paid resource. Render supports WebSockets on web services, but a Free service sleeps after 15 minutes without inbound traffic and can take about a minute to wake. Do not select a paid plan until you explicitly approve one.
6. Add the separate-demo environment variables from Step 6 before the first build. Set `HOSTNAME=0.0.0.0`; Render supplies `PORT`, so do not hardcode it.
7. Create the service and wait for its public `https://<service-name>.onrender.com` URL. Set that exact URL as `NEXTAUTH_URL` (no trailing slash), then redeploy if it was not available before the first build.

Do not copy the private application's `MONGODB_URI` or credentials to this service. The demo must use only its dedicated `DEMO_MONGODB_URI`.

---

## Step 4 — Environment variables on the host

Set these in Railway/Render **Variables** (not only in `.env.local`):

| Variable | Example / notes |
|---|---|
| `MONGODB_URI` | Atlas string from Step 1 |
| `NEXTAUTH_SECRET` | Random string from Step 2 |
| `NEXTAUTH_URL` | `https://your-app.up.railway.app` (no trailing slash) |
| `HOSTNAME` | `0.0.0.0` |
| `NODE_ENV` | `production` (usually automatic) |
| `ALLOW_DB_SEED` | Keep `false`; only used for an explicitly unlocked non-production legacy seed |
| `SEED_SECRET` | Different from `NEXTAUTH_SECRET`; non-production legacy seed only |
| `ENABLE_DATE_SIMULATION` | Keep `false` in normal production |
| `MAIL_DELIVERY_URL` / `MAIL_DELIVERY_TOKEN` | Optional invitation provider HTTP boundary; otherwise delivery is not configured |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | optional |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | optional, e.g. `messmesh_waste` |

Redeploy after saving variables so `NEXTAUTH_URL` matches the real public URL.

---

## Step 5 — Create the first administrator

Do not seed an existing or production database. After confirming the intended `MONGODB_URI`, run `npm run create-admin` from a trusted operator environment. The command prompts for name, email, and a hidden password; it inserts a new Admin and refuses duplicate emails. It does not promote users or reset passwords.

Existing records remain active by default and existing password-change state is preserved; no migration or automatic account rewrite is required. After setup, sign in as Admin and invite Wardens through **Wardens**. No shared production credentials should be published.

## Step 6 — Separate public portfolio demo

Use a distinct Render Web Service and a database created specifically for fictional demo data. Create a separate database user restricted to read/write access on that demo database. Do not copy real data or private-application database credentials. Configure these values on the demo service before building:

```env
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
DEMO_MONGODB_URI=mongodb+srv://<demo-only-user>:<url-encoded-password>@<demo-cluster>/messmesh_demo?retryWrites=true&w=majority
REAL_DATABASE_NAME=<private-application-database-name-only>
NEXTAUTH_URL=https://<render-service-name>.onrender.com
NEXTAUTH_SECRET=<unique-random-demo-only-secret>
HOSTNAME=0.0.0.0
ENABLE_DATE_SIMULATION=false
NEXT_PUBLIC_ENABLE_DATE_SIMULATION=false
```

The demo DB name must contain `demo` and differ from `REAL_DATABASE_NAME`. `REAL_DATABASE_NAME` is only the private database's name; it is not a URI or credential. Leave `MONGODB_URI`, `MAIL_DELIVERY_URL`, and `MAIL_DELIVERY_TOKEN` unset on the demo service. The app selects `DEMO_MONGODB_URI`; it never needs credentials for the private application database. Generate a unique `NEXTAUTH_SECRET` for this demo only and enter it directly in Render's secret environment-variable field. Do not reuse the private app's secret.

For real-time demo behavior, leave both date-simulation flags `false` or unset. To explicitly enable the date simulator, set **both** `ENABLE_DATE_SIMULATION=true` and `NEXT_PUBLIC_ENABLE_DATE_SIMULATION=true`; the guarded initializer then seeds the fixed demo date. With simulation disabled, it seeds a menu for the current server week. The two flags must agree so the UI and server stay consistent.

Keep `DEMO_RESET_CONFIRM` unset on the running web service. The initializer requires `DEMO_MODE=true`, both demo-mode flags, a dedicated demo-named `DEMO_MONGODB_URI`, `REAL_DATABASE_NAME`, and a one-command `DEMO_RESET_CONFIRM=YES_DEMO_RESET`. It clears and recreates data only in the database named by `DEMO_MONGODB_URI`, including weekly score state and menu initialization locks. It is separate from `/api/seed`; never use the legacy seed command.

### One-time demo initialization

Render's Dashboard Shell is unavailable on Free Web Services. Run the initializer once from a trusted local **clean checkout** of the reviewed branch (without a `.env.local` containing private database settings), after creating the dedicated demo database and user. This does not deploy or connect to the private application database. From the repository root in PowerShell:

```powershell
npm ci
$env:DEMO_MODE = "true"
$env:NEXT_PUBLIC_DEMO_MODE = "true"
$env:DEMO_MONGODB_URI = "mongodb+srv://<demo-only-user>:<url-encoded-password>@<demo-cluster>/messmesh_demo?retryWrites=true&w=majority"
$env:REAL_DATABASE_NAME = "<private-application-database-name-only>"
$env:DEMO_RESET_CONFIRM = "YES_DEMO_RESET"
$env:ENABLE_DATE_SIMULATION = "false"
$env:NEXT_PUBLIC_ENABLE_DATE_SIMULATION = "false"
npm run demo:reset
Remove-Item Env:DEMO_RESET_CONFIRM, Env:DEMO_MONGODB_URI, Env:REAL_DATABASE_NAME, Env:DEMO_MODE, Env:NEXT_PUBLIC_DEMO_MODE, Env:ENABLE_DATE_SIMULATION, Env:NEXT_PUBLIC_ENABLE_DATE_SIMULATION -ErrorAction SilentlyContinue
```

Use the two date-simulation values as described above. Confirm the command reports the fictional demo database name and three protected entry accounts. Then remove the temporary reset confirmation and database variables from that PowerShell session. The command is intentionally destructive to the selected **demo** database; run it once for first initialization, and only repeat it when you intend to erase and restore all public demo activity.

Do not configure a recurring reset until you explicitly choose its cadence and accept that it will erase recruiter-created demo activity. Render Cron Jobs are a separate, non-Free service; if you later approve one, configure the same demo-only environment and `DEMO_RESET_CONFIRM=YES_DEMO_RESET` on that job, and run `npm run demo:reset`. Do not point it at the private app database.

### Post-deploy demo checklist

- Sign in through **Explore as Admin**; open Wardens, Students, Analytics, Leaderboard, and the shared menu. Create a fictional Warden and confirm the invitation is a preview, not email.
- Sign out, enter as **Warden**, and verify the assigned-wing roster/analytics, student creation and CSV flow, reports, and cross-wing denial.
- Sign out, enter as **Student**, then check the shared menu/leaderboard, submit a rating, log waste, and view personal score/history.
- Check role/wing-appropriate notifications and report/PDF workflows where available.
- Sign out and switch between all three demo roles; confirm the demo entry accounts remain protected from password, role, wing, and active-status changes.

---

## Step 7 — Optional Cloudinary (waste photos)

1. [https://cloudinary.com](https://cloudinary.com) → free account.
2. Dashboard → copy **Cloud name**.
3. **Settings → Upload** → **Add upload preset**:
   - Signing mode: **Unsigned**
   - Name: e.g. `messmesh_waste`
4. Set on host:
   - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name`
   - `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=messmesh_waste`
5. Redeploy.

Without this, waste logs still work but use a placeholder image.

---

## Step 8 — Smoke test after deploy

1. Open `https://YOUR-APP-URL/login`
2. Sign in using the Admin account created with `npm run create-admin`.
3. Invite a Warden and verify delivery status or the clearly labeled development preview.
4. As Warden, verify only the assigned wing appears in student roster and analytics.
5. Add a student; securely hand off the one-time random password and confirm a password change is required.
6. As Student, verify own ratings and waste logging, with no management actions.
7. Confirm room-scoped authenticated notifications still work.

---

## Step 9 — Local production test (optional)

On your machine, with Atlas URI in `.env.local`:

```powershell
cd C:\3_PROJECTS\MessMesh
npm run build
$env:NODE_ENV="production"
$env:HOSTNAME="0.0.0.0"
npm start
```

Open http://localhost:3000 and verify that public demo entry buttons are absent unless the isolated demo mode is configured.

---

## Common failures

| Symptom | Fix |
|---|---|
| App never becomes “Live” | Start command must be `npm start` (not `next start`; the custom server also hosts sockets) |
| Auth redirect loops | `NEXTAUTH_URL` must exactly match public HTTPS URL |
| DB connection error | Check Atlas password encoding (`@` in password → `%40`), IP allowlist |
| Seed returns 403 | The legacy destructive seed is unavailable in production/demo; do not unlock it on an existing database |
| Seed returns 401 | Only the dedicated `SEED_SECRET` is accepted in the explicitly unlocked non-production legacy flow |
| Sockets not connecting | Confirm custom `server.js` is running; check browser console |
| Cloudinary upload fails | Unsigned preset name must match env exactly |

---

## What you should still do long-term (not required for first deploy)

- Change default seeded passwords / create real wardens
- Restrict Atlas Network Access to host IPs only
- Custom domain + HTTPS (Railway/Render handle certs)
- Optional: remove `/api/seed` entirely after first seed
- Optional: rate limiting at reverse proxy (Cloudflare)
- Do not scale to multiple instances without Redis Socket.io adapter
