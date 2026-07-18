LIVE LINK : https://messmesh.onrender.com/login
use credentials - Roll- 123456  password - 123456@Mess2026
# MessMesh: Smart Hostel Mess Management Web App

MessMesh is a fullstack hostel mess management system designed to optimize meal planning, minimize plate waste, and introduce democratic meal curation. Built with plain JavaScript on Next.js 15 (App Router), it incorporates real-time analytics, Socket.io, and a moving-average forecaster to help wardens make data-driven decisions while incentivizing students to maintain clean plates.

---

## 🛠️ Technology Stack

* **Frontend & Backend**: Next.js 15 (App Router, Plain JavaScript)
* **Real-time Sync**: Socket.io (WebSocket dev-server integration)
* **Database**: MongoDB Atlas + Mongoose ODM
* **Authentication**: NextAuth.js (Credentials Provider + email fallbacks)
* **Visualizations**: Recharts (Dynamic Client-side line/bar charts)
* **Image Uploader**: Cloudinary preset API
* **Styling**: Vanilla CSS + Tailwind CSS v4 (Zero Blue Tint: Warm Charcoal & Emerald Green palette)

---

## ✨ Features

1. **🔐 Single-Tap Login Simulator**: Click-to-login dashboard bypass cards on `/login` that pre-fill credentials for fast role testing.
2. **⭐ Rate Today's Meals / Monitor Ratings**:
   * **Students**: Submit 1-5 star reviews on the taste of today's dishes in real-time. Updates averages on client screens via Socket.io.
   * **Wardens**: Dynamic read-only monitor interface tracking overall ratings and reviews.
3. **📅 Rating History Matrix (Student)**: A responsive weekly grid (Breakfast, Lunch, Snacks, Dinner rows vs Monday-Sunday columns) that lists student reviews for the current week, 1 week ago, and 2 weeks ago.
4. **🗑️ Waste Logging (Student)**: Plate waste audits (1-5 slider with matching emojis: 😋 to 😣) and optional photo uploads. Zero-waste audits improve their Wing's standings.
5. **👑 Group Incentive: Sunday Premium Feast Wing Eligibility**:
   * **Cooperative Goal**: A Wing's average Clean Plate Score must be **90+** by Sunday to unlock the **Premium Sunday Feast** menu upgrade for everyone in that Wing.
   * **Warden View**: Renders the **Sunday Premium Feast Wing Eligibility** card list on the Admin Dashboard (`/admin`), tracking average scores for each wing and displaying `Unlocked` or `Locked` badges.
   * **Student View**: Renders status indicators under each Wing Standing card on the **Leaderboard** page (`/leaderboard`), showing students how many points their wing needs to unlock the premium feast.
6. **🏆 Wing Standings Leaderboard**: Ranks Wings (A, B, C, D) by average Clean Plate Scores, displaying crown decorations and progress meters.
7. **📊 Warden Admin Analytics**:
   * **Prophet JS Forecaster**: A weighted moving average waste forecaster that analyzes past leftovers to suggest portion sizes.
   * **Recharts Visualizations**: Interactive daily leftover trends (LineChart) and wing waste distributions (BarChart).
   * **Menu Auto-Generation Algorithm**: Curation script that compiles next week's schedule using top-voted student preferred dishes, archives current polls, and opens clean weekly polls.

---

## 🚀 Setup Instructions

### 1. Environment Variables (`.env`)
Create a `.env` file in the root directory:
```env
MONGODB_URI="your-mongodb-atlas-connection-string"
NEXTAUTH_SECRET="your-nextauth-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Optional Cloudinary (Defaults to mock fallback upload if omitted)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your-cloudinary-cloud-name"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize & Seed Database
Start the Next.js server first:
```bash
node server.js
```
Then, execute the seeder endpoint to populate users, dishes, daily menus, and historical waste logs:
* **PowerShell**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/seed"
  ```
* **Browser**: Open `http://localhost:3000/api/seed` in your browser.

---

## 🧪 How to Test

### 1. The Student Flow
1. Go to `http://localhost:3000/login` and click **Alice Smith (Student)** under the Quick Login panel.
2. In the **Leaderboard** (`/leaderboard`) view:
   * Look at the **Wing Standings** cards. 
   * A-Wing (average `88`) shows: `🔒 LOCKED - Sunday Feast (Need +2 pts)`.
   * C-Wing (average `92`) shows: `🎉 UNLOCKED - Sunday Feast`.
3. Submit plate audits in **Log Waste** (`/waste-log`) to increase A-Wing's standings.

### 2. The Warden Flow
1. Log out, go to `/login`, and tap **Warden Susan**.
2. Go to **Analytics** (`/admin`).
3. Under the **Sunday Premium Feast Wing Eligibility** card list, verify which Wings have successfully unlocked their premium menu upgrade.
