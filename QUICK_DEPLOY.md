# ⚡ Quick Deploy Guide - Choose Your Platform

## 🥇 Best Free Option: Cyclic.sh (5 minutes, No Credit Card)

**Why Cyclic.sh?**
- Completely free forever - no limits
- No credit card required
- Perfect WebSocket support
- Auto-deploys from GitHub

**Steps:**
1. Go to [cyclic.sh](https://cyclic.sh) → Sign up (no credit card!)
2. Click "New Project" → "Connect GitHub Repository"
3. Select your `ginrummyaz` repository
4. Click "Deploy"
5. Wait 2-3 minutes → Your game is live! 🎉

**Your URL:** `https://your-app-name.cyclic.app`

---

## 🎯 Alternative Options (May Require Credit Card)

### Option A: Onrender (Free Tier)
1. Go to [onrender.com](https://onrender.com) → Sign up with GitHub
2. Click "New +" → "Web Service" → Connect your `ginrummyaz` repo
3. Configure: Node, build: `npm install && npm run build`, start: `npm start`
4. Select Free plan → Deploy
5. **Your URL:** `https://ginrummy.onrender.com`

*Note: Free tier sleeps after 15min inactivity*

### Option B: Railway (Free Tier)
1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. Click "New Project" → "Deploy from GitHub repo" → Select `ginrummyaz`
3. Add env var: `NODE_ENV=production`
4. Deploy automatically → Generate domain
5. **Your URL:** `https://ginrummy-production.up.railway.app`

### Option C: Fly.io (Free Tier)
1. Install Fly CLI: `brew install flyctl`
2. Go to [fly.io](https://fly.io) → Sign up
3. In terminal: `fly launch` (select your cloned repo)
4. `fly deploy`
5. **Your URL:** `https://your-app-name.fly.dev`

---

## 📚 Full Instructions

See `DEPLOYMENT.md` for detailed instructions for all platforms including troubleshooting tips.

---

## ✅ Pre-Deployment Checklist

- [ ] Code is pushed to GitHub (`ginrummyaz` repo) ✅
- [ ] `package.json` has correct scripts ✅ (already done)
- [ ] `Procfile` exists ✅ (already done)
- [ ] Server serves static files in production ✅ (already done)
- [ ] Socket.IO connects correctly in production ✅ (already done)

**You're ready to deploy!** 🚀
