# LAMS - Leave & Attendance Management System

A comprehensive web-based application for managing employee leaves, compensatory offs (Comp Off), and work-from-home (WFH) requests with multi-level approvals and Slack notifications.

## 💸 100% Free Deployment

| Service          | Provider         | Plan   | Cost |
|------------------|------------------|--------|------|
| Frontend Hosting | **Vercel**       | Hobby  | FREE |
| Serverless API   | **Vercel**       | Hobby  | FREE |
| Authentication   | **Firebase Auth**| Spark  | FREE |
| Database         | **Firestore**    | Spark  | FREE |
| Notifications    | **Slack Webhooks**| Free  | FREE |

**Firebase Spark (free) limits:** 50K reads/day, 20K writes/day, 1GB storage — plenty for a team.
**Vercel Hobby (free) limits:** 100GB bandwidth/month, serverless function invocations included.

## Features

- 🔐 **Authentication**: Firebase email/password auth with role-based access
- 👤 **User Roles**: Employee, Manager, HR Admin
- 📝 **Leave Management**: Casual, Paid, Sick, Comp Off, WFH
- ✅ **Multi-level Approval**: Manager → HR workflow
- 📊 **Dashboard**: Real-time leave balance tracking
- 💼 **HR Admin Panel**: Manage users, adjust balances, audit logs
- 🔔 **Slack Notifications**: Real-time notifications on all actions
- 📱 **Responsive Design**: Mobile-friendly

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Backend**: Firebase Spark (Auth + Firestore) — free tier
- **Hosting**: Vercel — free tier
- **Slack API**: Via Vercel serverless function (keeps webhook secret)
- **Routing**: React Router v6

---

## 🚀 Quick Start (Local Dev)

```bash
cd lams
npm install
cp .env.example .env.local   # Fill in your Firebase config
npm start
```

---

## �� Firebase Setup (Free Spark Plan)

### Step 1: Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
2. Click **Add project**
3. Name it (e.g. `lams-leave-system`)
4. Disable Google Analytics (not needed) → **Create project**

### Step 2: Enable Email/Password Auth

1. Go to **Build → Authentication → Get started**
2. Click **Sign-in method** tab
3. Enable **Email/Password** → Save

### Step 3: Create Firestore Database

1. Go to **Build → Firestore Database → Create database**
2. Choose **Start in production mode**
3. Select region closest to your users → **Enable**

### Step 4: Get Firebase Config

1. Go to **Project Settings** (gear icon ⚙) → **General**
2. Scroll to **Your apps** → click Web icon `</>`
3. Register app name (e.g. "LAMS Web")
4. Copy the config and put in `.env.local`:

```
REACT_APP_FIREBASE_API_KEY=AIzaSy...
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123456789:web:abc123
```

### Step 5: Deploy Firestore Rules & Indexes

```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Step 6: Create First HR Admin

1. Register a user through the app normall
2. Go to **Firebase Console → Firestore Database**
3. Open the `users` collection → find your user document
4. Change `role` from `"employee"` to `"hr_admin"`

---

## ▲ Vercel Deployment (Free)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Initial LAMS commit"
git remote add origin https://github.com/YOUR_USERNAME/lams.git
git push -u origin main
```

### Step 2: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. Click **Add New → Project**
3. Import your `lams` repo
4. Vercel auto-detects React — just click **Deploy**

### Step 3: Add Environment Variables in Vercel

Go to **Project Settings → Environment Variables** and add:

| Key | Value |
|-----|-------|
| `REACT_APP_FIREBASE_API_KEY` | your key |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | your-project.firebaseapp.com |
| `REACT_APP_FIREBASE_PROJECT_ID` | your-project-id |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | your-project.appspot.com |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | your sender id |
| `REACT_APP_FIREBASE_APP_ID` | your app id |
| `SLACK_WEBHOOK_URL` | https://hooks.slack.com/services/... |

> **Note:** `SLACK_WEBHOOK_URL` (without `REACT_APP_` prefix) is a server-side only variable — it stays secret in the Vercel serverless function and is never exposed to the browser.

### Step 4: Redeploy

After adding env vars, go to **Deployments** → click **Redeploy** on the latest deployment.

Your app is now live at `https://lams-xxxxx.vercel.app`! 🎉

---

## 🔔 Slack Setup (Optional)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. **Create New App → From scratch**
3. Name: `LAMS Notifications`, select workspace
4. Go to **Incoming Webhooks** → toggle ON
5. **Add New Webhook to Workspace** → select `#leave-channel`
6. Copy the webhook URL
7. Add it in **Vercel → Project Settings → Environment Variables** as `SLACK_WEBHOOK_URL`

---

## 📁 Project Structure

```
lams/
├── api/
│   └── slack.js              # Vercel serverless function (Slack proxy)
├── src/
│   ├── components/
│   │   ├── Admin/            # HR Admin panel
│   │   ├── Approvals/        # Manager/HR approval interface
│   │   ├── Auth/             # Login & Registration
│   │   ├── Dashboard/        # Employee dashboard
│   │   ├── Layout/           # Navbar & Layout wrapper
│   │   └── Leave/            # Leave form & history
│   ├── config/firebase.ts    # Firebase init
│   ├── contexts/AuthContext.tsx
│   ├── services/
│   │   ├── leaveService.ts   # Leave CRUD + deduction logic
│   │   ├── userService.ts    # User management + audit logs
│   │   └── slackService.ts   # Slack notification builder
│   ├── types/index.ts        # TypeScript interfaces
│   └── App.tsx               # Routing & role guards
├── firestore.rules           # Security rules
├── firestore.indexes.json    # Composite indexes
├── firebase.json             # Firebase config (rules only)
├── vercel.json               # Vercel deployment config
└── .env.example              # Env var template
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Dev server at localhost:3000 |
| `npm run build` | Production build to `build/` |
| `npm test` | Run tests |

---

## 📝 License

MIT
