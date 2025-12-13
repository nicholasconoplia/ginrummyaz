# 🚀 Deployment Guide - Gin Rummy (Updated)

This guide provides step-by-step instructions to deploy your Gin Rummy game so you can play with friends online without running it locally.

## 📋 Prerequisites

- A GitHub account (free)
- Your code pushed to a GitHub repository

---

## Option 1: Render (Best fit if it can “sleep” when idle)

**Why Render?**
- ✅ Free instance type for web services
- ✅ Supports WebSockets / Socket.IO
- ✅ You already have `render.yaml` configured!
- ⚠️ Free services **spin down after ~15 minutes of inactivity** and then cold start on the next visit

### Step-by-Step Deployment:

#### Step 1: Create Render Account
1. Go to `https://render.com`
2. Sign up (GitHub login is easiest)

#### Step 2: Create New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Select your `ginrummyaz` repository

#### Step 3: Configure Service
1. **Name:** `ginrummy` (or any name)
2. **Environment:** `Node`
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm start`
5. **Plan:** Select "Free"

#### Step 4: Environment Variables
Add these in the "Environment" section:
- `NODE_ENV` = `production`

#### Step 5: Deploy
1. Click "Create Web Service"
2. Render will build and deploy automatically
3. Wait for deployment to complete (5-10 minutes)
4. **Your app is now live!**

**Your game URL will look like:** `https://<your-service>.onrender.com`

**Note:** First person to open the link after it’s been idle may wait up to ~1 minute.

---

## Option 2: Koyeb (Free tier + WebSockets; check plan details at signup)

Koyeb offers a free web service tier and supports WebSockets. Follow their “Deploy from Git/GitHub” flow and use:

- **Build command**: `npm install && npm run build`
- **Run command**: `npm start`
- **Env**: `NODE_ENV=production`

---

## Not recommended (for your “free forever / no trials” requirement)

- **Railway**: their pricing states the free plan is a **trial** then becomes paid.
- **Fly.io**: their docs state a **credit card is required** for new orgs.

---

## 🔧 Post-Deployment Checklist

After deploying, verify:

1. ✅ **Frontend loads** - Can you see the home screen?
2. ✅ **Socket connection works** - Check browser console for connection messages
3. ✅ **Create lobby works** - Try creating a lobby
4. ✅ **Join lobby works** - Open in another browser/device and join
5. ✅ **Game starts** - Start a game and verify cards are dealt

---

## 🐛 Troubleshooting

### Issue: Socket.IO connection fails
**Solution:** Make sure your server CORS settings allow your deployment URL. Your code already handles this with `getAllowedOrigins()` function.

### Issue: Static files not loading
**Solution:** Verify the build completed successfully. Check that `dist/` folder exists with built files.

### Issue: Port errors
**Solution:** Most platforms set `PORT` automatically. Your code uses `process.env.PORT || 3000` which handles this ✅

### Issue: WebSocket not working
**Solution:** 
- Verify your hosting platform supports WebSocket (all options above do)
- Check that Socket.IO is using WebSocket transport (your code already does ✅)

---

## 📝 Quick Comparison (current)

| Platform | WebSockets | Sleeps/Cold start | Notes |
|----------|-----------:|------------------:|------|
| **Render (Free web service)** | ✅ | ✅ | Best for “open link and play” |
| **Koyeb (free tier)** | ✅ | depends | Check current limits at signup |

---

## 🎮 Sharing Your Game

Once deployed, share your game URL with friends:
- They can open it in any browser
- No installation needed
- Works on phones, tablets, and computers
- Just share the URL!

---

## 💡 Pro Tips

1. **Bookmark your game URL** - So you can access it easily
2. **Test with friends** - Make sure everything works before a big game night
3. **Monitor usage** - Free tiers have limits, but should be fine for casual play
4. **Backup your code** - Keep your GitHub repo updated

---

## 🆘 Need Help?

If you encounter issues:
1. Check the browser console (F12) for errors
2. Check server logs in your hosting platform
3. Verify all environment variables are set
4. Make sure your build completed successfully

---

**Recommended:** Use **Render Free** if you’re OK with the app sleeping when nobody is playing.

