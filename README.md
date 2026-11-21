# NWS STOCK EXCHANGE — The Future of Trading

A complete, zero-cost (**₹0 budget**) Indian equity exchange web application built with **React, TypeScript, Tailwind CSS, Recharts, Firebase Spark (Auth + Cloud Firestore), and Netlify Free**.

Designed for Class 12 Commerce Exhibitions with support for mobile phones, laptops, an Admin control console, and a dedicated 4-quadrant large-screen **LED Market Board** with a live speaking financial news anchor.

---

## Features
- **Public Portal**: Live **NWS 50 Index**, market status, top gainers & losers, 18 listed Indian companies across 9 sectors, interactive search & column sorting.
- **Trading Desk with Candlestick (OHLC) Charts**: Real-time green/red candlestick + volume charts for every listed company, validated BUY/SELL execution preventing invalid quantities, negative balances, or short-selling unowned shares.
- **Self-Service Investor Accounts (Zero Phone / Zero Email UX)**: On **Investor Login**, visitors enter their **Name** to automatically receive a unique **Investor ID**, **Access Code**, and **₹1,00,000** starting balance (with a printable/copyable Investor Pass). Returning investors sign back in using their Name + Investor ID + Access Code. Each investor's cash balance, holdings, and transaction ledger are isolated via Firebase Auth UID & Firestore Security Rules.
- **Protected Admin Portal with Named Passwords**: Without a valid Admin Password (or authorized Owner Google account), no one can enter `/admin`. Inside the **Admin Passwords** tab, the owner can create individual **Admin Name + Password** credentials for themselves and every team coordinator, and revoke access at any time.
- **Learn Tab**: Built-in 6-chapter interactive animated video tutorial (with optional voiceover) teaching visitors and students how to use every public & investor feature.
- **Admin-Only Live LED Market Board (`/led`)**: Accessible strictly inside the Admin Console, formatted in 4 quadrants:
  1. Multi-company live trajectory graph
  2. Live listed company names & share prices
  3. Business News Desk with continuous Web Speech API speaking anchor and price-impacting headlines
  4. Real-time Top Investors Leaderboard

---

## Security & ₹0 Spark Architecture Notice
Because paid Cloud Functions, Google Cloud billing, and Firebase Blaze plan are prohibited (`₹0` strict budget):
- **Market Tick Engine**: Live price ticks run inside the Owner Google-authenticated Administrator's browser session and persist to Firestore via `writeBatch`.
- **Zero-Console-Setup Investor & Named Admin Passwords**: Investors generate their Investor ID (`NWS-XXXX`), Access Code, and ₹1,00,000 capital instantly by entering only their Name — no email address, phone number, or Firebase Console Email/Password provider toggle is needed. Credentials are verified via Web Crypto SHA-256 hashes (`accessCodeHash` / `passwordHash`) and plain-text codes/passwords are never stored in Firestore.
- **Trade Validation**: Firestore Security Rules (`firestore.rules`) enforce self-registration locked to `₹1,00,000` initial balance, non-negative balances, active company checks, market `OPEN` status checks, authoritative `market_prices` price checks, and atomic 3-way `getAfter`/`existsAfter` validation across `investors`, `portfolios`, and `transactions`. Review and customize `firestore.rules` before sharing your deployment broadly.

---

## 1. How to Install Dependencies
Requires Node.js 18+ and npm:
```bash
npm install
```

## 2. How to Configure Firebase Spark (Free Tier)
1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project on the **Spark (Free)** plan (no credit card required).
2. Enable **Cloud Firestore** in Production mode and deploy the included `firestore.rules`:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```
3. Go to **Authentication → Sign-in method** and ensure **Google** is enabled (add your Netlify domain under *Authentication → Settings → Authorized domains*). No Email/Password or Phone provider setup is required.
4. Sign in once via **Owner Google Sign-In** at `/admin` (using the bootstrap organizer email in `firestore.rules`), click **Initialize 18 Companies & Market**, and open the **Admin Passwords** tab to create individual Name + Password accounts for yourself and your coordinators.

## 3. How to Configure Environment Variables
Copy `.env.example` to `.env` (or configure in **Netlify → Site configuration → Environment variables**):
```env
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="(default)"
```
*(When running inside AI Studio, `firebase-applet-config.json` is automatically used as fallback.)*

## 4. How to Build the Project
Run type-checking and production bundle build:
```bash
npm run lint
npm run build
```
The production static bundle is generated in `dist/`.

## 5. How to Publish Through Netlify (Free)
### Option A: Git-Connected Continuous Deployment (Recommended)
1. Push this repository to GitHub/GitLab/Bitbucket.
2. Log in to [Netlify](https://app.netlify.com/) (Free Starter tier).
3. Click **Add new site → Import an existing project**.
4. Netlify automatically detects `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add the `VITE_FIREBASE_*` environment variables under **Environment variables**.
6. Click **Deploy site**.
7. Copy your `*.netlify.app` URL into **Firebase Console → Authentication → Settings → Authorized domains**.

### Option B: Manual Drag-and-Drop
1. Run `npm run build` locally.
2. Drag the generated `dist/` folder onto [Netlify Drop](https://app.netlify.com/drop).

## 6. How to Update the Deployed Website
- **Git-Connected**: Commit and `git push` to your main branch — Netlify rebuilds and publishes automatically for free.
- **Manual**: Run `npm run build` and upload the updated `dist/` folder in **Netlify → Deploys**.
