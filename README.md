# Gin Rummy - Multiplayer Web App

A real-time multiplayer Gin Rummy game where you can play with friends online from any device. Features custom card uploads, smooth animations, and a beautiful dark theme.

## Features

- 🎮 **Real-time Multiplayer**: Create a lobby and invite friends with a 6-character code
- 📱 **Cross-platform**: Works on phones, tablets, and desktops
- 🎨 **Custom Cards**: Upload your own card images
- ✨ **Beautiful UI**: Dark theme with glassmorphism and smooth animations
- 🔄 **Auto-reconnect**: Rejoin the game if you get disconnected
- 🃏 **Full Rummy Rules**: Runs, sets, and table rearrangement

## Quick Start

### Development

1. Install dependencies:
```bash
npm install
```

2. Start the server (in one terminal):
```bash
npm run dev:server
```

3. Start the frontend (in another terminal):
```bash
npm run dev
```

4. Open http://localhost:5173 in your browser

### Production

1. Build the frontend:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

The server will serve both the API and the static frontend from port 3000.

## How to Play

1. **Create a Lobby**: Enter your name and click "Create Lobby"
2. **Share the Code**: Give the 6-character code to your friends
3. **Wait for Players**: Once everyone has joined, the host starts the game
4. **On Your Turn**:
   - Draw a card from the deck or discard pile
   - Optionally play melds (3+ cards of same rank, or 3+ consecutive cards of same suit)
   - Optionally add cards to existing melds on the table
   - Discard one card to end your turn
5. **Win**: First player to play all their cards wins!

## Custom Card Images

Click the ⚙️ settings button to upload custom card images.

- **Naming Format**: `RANK_SUIT.png` (e.g., `A_hearts.png`, `10_spades.jpg`)
- **Bulk Upload**: Name your files correctly and upload all at once
- **Supported Formats**: PNG, JPG, JPEG, WebP, GIF

## Game Rules

### Valid Melds

- **Sets**: 3 or more cards of the same rank (e.g., three 7s, four Kings)
- **Runs**: 3 or more consecutive cards of the same suit (e.g., 4♥ 5♥ 6♥)

### Table Rearrangement

You can rearrange cards on the table as long as:
- All melds remain valid after rearrangement
- You don't pick up cards back into your hand
- Any new melds must include at least one card from your hand

## Tech Stack

- **Frontend**: Vanilla JavaScript, CSS3, HTML5
- **Backend**: Node.js, Express, Socket.IO
- **Build Tool**: Vite
- **Styling**: Custom CSS with CSS Variables

## 🌐 Deploying for Public Access

To let friends join from their devices (not just localhost), you need to deploy the game to a hosting service. Here are the best free options:

---

### Option 1: Cyclic.sh (Recommended - Truly Free Forever)

**No credit card required, unlimited usage**

1. **Go to [Cyclic.sh](https://cyclic.sh)** and sign up (free)

2. **New Project** → **Connect GitHub Repository**

3. **Select your repository** (`ginrummyaz`)

4. **Deploy** - Cyclic auto-detects your Node.js app and deploys

5. **Get your URL** (e.g., `https://your-app-name.cyclic.app`)

6. **Share the URL with friends** - they can now join from anywhere!

---

### Option 2: Onrender (Free Tier)

**750 hours free per month**

1. Go to [Onrender.com](https://onrender.com) and sign up with GitHub

2. **New +** → **Web Service** → Connect your `ginrummyaz` repository

3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Set `NODE_ENV` to `production`

4. Select **Free** plan and deploy

5. Your game will be live at `https://ginrummy.onrender.com`

*Note: Free tier sleeps after 15min inactivity*

---

### Option 3: Railway (Free Tier)

**$5 monthly credit**

1. Go to [Railway.app](https://railway.app) and sign up with GitHub

2. **New Project** → **Deploy from GitHub repo** → Select `ginrummyaz`

3. Railway auto-detects configuration and deploys

4. Add environment variable: `NODE_ENV=production`

5. **Generate Domain** for your public URL

6. Your game will be live at `https://ginrummy-production.up.railway.app`

---

### Option 4: Fly.io (Free Tier)

**Free tier with $5 monthly credit**

1. Install Fly CLI:
   ```bash
   brew install flyctl  # macOS
   # OR download from https://fly.io/docs/hands-on/install-flyctl/
   ```

2. Go to [Fly.io](https://fly.io) and sign up

3. Deploy:
   ```bash
   git clone https://github.com/nicholasconoplia/ginrummyaz.git
   cd ginrummyaz
   fly auth login
   fly launch
   fly deploy
   ```

4. Your game will be live at `https://your-app-name.fly.dev`

---

### Option 5: Self-Hosting (VPS/Home Server)

If you have a VPS (DigitalOcean, AWS, etc.) or want to host at home:

1. **Install Node.js 18+** on your server

2. **Clone and build**:
   ```bash
   git clone https://github.com/nicholasconoplia/ginrummyaz.git
   cd ginrummyaz
   npm install
   npm run build
   ```

3. **Start with PM2** (keeps it running):
   ```bash
   npm install -g pm2
   PORT=3000 NODE_ENV=production pm2 start server/index.js --name ginrummy
   ```

4. **Set up a reverse proxy** (nginx/caddy) for HTTPS

5. **Open port 3000** (or 80/443 with reverse proxy) in your firewall

6. **For home hosting**: Set up port forwarding on your router and use a dynamic DNS service like [DuckDNS](https://www.duckdns.org)

---

### After Deployment

Once deployed, share your game URL with friends:

1. **Host creates a lobby** → Gets a 6-character code
2. **Friends open the URL** on their phones/computers
3. **Friends enter the code** to join
4. **Host clicks Start Game** when everyone is in
5. **Everyone sees cards moving in real-time!** 🎉

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Set to `production` for production | `development` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins (optional) | All origins allowed in production |

## License

MIT
