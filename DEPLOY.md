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

1. [https://render.com](https://render.com) → **New** → **Web Service** → connect repo.
2. **Runtime:** Node  
3. **Build:** `npm install && npm run build`  
4. **Start:** `npm start`  
5. Add env vars (Step 4).  
6. Create service → wait for live URL.

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

Use a distinct deployment and database. Do not copy real data or reuse production credentials. Configure these values on the demo service before building:

```env
DEMO_MODE=true
DEMO_MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/messmesh_demo
REAL_DATABASE_NAME=messmesh
NEXT_PUBLIC_DEMO_MODE=true
NEXTAUTH_URL=https://your-demo-host.example
NEXTAUTH_SECRET=<unique demo-only secret>
ENABLE_DATE_SIMULATION=true
NEXT_PUBLIC_ENABLE_DATE_SIMULATION=true
```

The demo DB name must contain `demo`, differ from `REAL_DATABASE_NAME`, and must not match `MONGODB_URI` if that variable is also configured. If configuration is missing or unsafe, demo mode fails closed. Configure invitation delivery only for real deployments; demo invitations are previews and never send email.

Initialize or periodically restore the shared fictional dataset using `npm run demo:reset` in the demo service. It requires `DEMO_RESET_CONFIRM=YES_DEMO_RESET` and refuses a non-demo database. Schedule the command only against the dedicated demo database (for example, weekly). It is separate from the legacy `/api/seed` endpoint.

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
| App never becomes “Live” on Railway | Start command must be `npm start` (not only `next start` without custom server if you need sockets) |
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
