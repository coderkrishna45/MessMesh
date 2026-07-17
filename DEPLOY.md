# MessMesh — Deploy Checklist (you do these steps)

Code-side production hardening is already in the repo. Follow this guide for Atlas, secrets, and hosting.

---

## What the code already does for you

| Done in code | Detail |
|---|---|
| Seed lock | `/api/seed` blocked in production unless `ALLOW_DB_SEED=true` + secret header |
| Server bind | Listens on `0.0.0.0` (Railway/Render friendly) |
| Socket CORS | Restricted to `NEXTAUTH_URL` (+ optional `SOCKET_CORS_ORIGIN`) |
| Demo login | Hidden when `NODE_ENV=production` |
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
| `ALLOW_DB_SEED` | `false` by default |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | optional |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | optional, e.g. `messmesh_waste` |

Redeploy after saving variables so `NEXTAUTH_URL` matches the real public URL.

---

## Step 5 — Seed production data (one time only)

Seed **wipes the entire database**. Use only once for demo data.

1. Temporarily set on the host:
   - `ALLOW_DB_SEED=true`
2. Redeploy (or restart) so the flag is live.
3. Call the seed endpoint with your secret (same as `NEXTAUTH_SECRET` unless you set `SEED_SECRET`):

### PowerShell

```powershell
$secret = "PASTE_YOUR_NEXTAUTH_SECRET_HERE"
$url = "https://YOUR-APP-URL/api/seed"
Invoke-RestMethod -Uri $url -Headers @{ "x-seed-secret" = $secret }
```

### curl (Git Bash / Mac / Linux)

```bash
curl -H "x-seed-secret: PASTE_YOUR_NEXTAUTH_SECRET_HERE" \
  "https://YOUR-APP-URL/api/seed"
```

4. Confirm JSON success and demo users exist.
5. **Immediately** set `ALLOW_DB_SEED=false` again and redeploy.

### Demo logins after seed

| Role | Email | Password |
|---|---|---|
| Warden | `warden1@messmesh.com` | `warden123` |
| Student | `student1@messmesh.com` | `student123` |

**Change these passwords** (or create real users via Manage Students) before real users access the app.

---

## Step 6 — Optional Cloudinary (waste photos)

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

## Step 7 — Smoke test after deploy

1. Open `https://YOUR-APP-URL/login`
2. Confirm **no** “Developer Tool: Single-Tap Login” panel (production).
3. Log in as warden with seeded credentials.
4. Open **Students** → add one student → copy credentials.
5. Log out → log in as that student with roll number + default password → force password change appears.
6. Student: Rate meal / Log waste.
7. Warden: Analytics → Download Weekly Report.
8. Confirm notifications (bell) still work (Socket.io).

---

## Step 8 — Local production test (optional)

On your machine, with Atlas URI in `.env.local`:

```powershell
cd C:\3_PROJECTS\MessMesh
npm run build
$env:NODE_ENV="production"
$env:HOSTNAME="0.0.0.0"
npm start
```

Open http://localhost:3000 — demo login panel should be hidden.

---

## Common failures

| Symptom | Fix |
|---|---|
| App never becomes “Live” on Railway | Start command must be `npm start` (not only `next start` without custom server if you need sockets) |
| Auth redirect loops | `NEXTAUTH_URL` must exactly match public HTTPS URL |
| DB connection error | Check Atlas password encoding (`@` in password → `%40`), IP allowlist |
| Seed returns 403 | Set `ALLOW_DB_SEED=true` and restart, then send `x-seed-secret` |
| Seed returns 401 | Header `x-seed-secret` must equal `SEED_SECRET` or `NEXTAUTH_SECRET` |
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
