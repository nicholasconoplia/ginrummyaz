# ⚡ Quick Deploy Guide - Choose Your Platform

## 🥇 Recommended: Render (works great for “open link and play”)

Render’s free web services **sleep when idle** and wake up when someone opens the link — perfect for a friend game night.

### Option A: Render (10 minutes)
1. Go to `https://render.com` → sign up with GitHub
2. Click **New +** → **Web Service**
3. Connect your GitHub repo and pick: `nicholasconoplia/ginrummyaz`
4. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: **Free**
   - **Env var**: `NODE_ENV=production`
5. Click **Create Web Service**
6. When it finishes deploying, share the URL: `https://<your-service>.onrender.com`

---

## Option B: Koyeb (free tier + WebSockets; check limits at signup)

Use their “Deploy from Git/GitHub” flow and set:
- Build: `npm install && npm run build`
- Run: `npm start`
- Env: `NODE_ENV=production`

---

## 📚 Full Instructions

See `DEPLOYMENT.md` for detailed instructions for all platforms including Render, Railway, and troubleshooting tips.

---

## ✅ Pre-Deployment Checklist

- [ ] Code is pushed to GitHub
- [ ] `package.json` has correct scripts ✅ (already done)
- [ ] `Procfile` exists ✅ (already done)
- [ ] Server serves static files in production ✅ (already done)
- [ ] Socket.IO connects to same origin in production ✅ (already done)

**You're ready to deploy!** 🚀

