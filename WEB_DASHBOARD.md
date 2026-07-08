# Web Dashboard Deployment

This guide covers deploying the Discord-authenticated web dashboard alongside the existing bot-control process.

## Architecture

- **API** runs inside the bot-control Node process on fi7 (`API_PORT`, default `21024`)
- **Frontend** (`web/`) deploys separately (Vercel, Netlify, etc.)
- **Auth** uses Discord OAuth2 (`identify` scope) + JWT sessions
- **Bot tokens** never leave the API server

## 1. Discord Developer Portal

Create a Discord application (or reuse an existing one):

1. Open [Discord Developer Portal](https://discord.com/developers/applications)
2. OAuth2 → **Redirects** → add:
   - Local: `http://localhost:3000/auth/callback`
   - Production: `https://your-dashboard.vercel.app/auth/callback`
3. Copy **Client ID** and **Client Secret**
4. OAuth2 scopes for login: `identify`

> Admin bot provisioning (`/addbot`) is unchanged and still uses the control bot token.

## 2. fi7 API (bot-control)

Add these variables in the fi7 panel (or `.env`):

```env
API_PORT=21024
API_PUBLIC_URL=https://fi7.bot-hosting.net:21024
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=https://your-dashboard.vercel.app/auth/callback
WEB_ORIGIN=https://your-dashboard.vercel.app
JWT_SECRET=generate_a_long_random_secret_at_least_32_chars
```

Generate `JWT_SECRET` example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Deploy steps:

```bash
npm install
npm run build
npm start
```

The API starts automatically when **both** `DISCORD_CLIENT_ID` and `JWT_SECRET` are set.

### Smoke test (API)

```bash
curl http://fi7.bot-hosting.net:21024/api/health
```

Note: the bot host serves plain HTTP (no SSL). That is fine — browsers never
call it directly; Vercel proxies `/api/*` to it server-side (see below).

Expected:

```json
{ "ok": true, "apiEnabled": true, "activeRuntimes": 0 }
```

## 3. Frontend (Vercel)

Deploy the `web/` directory as a separate project.

Environment variables:

```env
API_PROXY_TARGET=http://fi7.bot-hosting.net:21024
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_client_id
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://your-dashboard.vercel.app/auth/callback
```

Leave `NEXT_PUBLIC_API_URL` unset. The browser calls `/api/*` on the Vercel
domain itself, and `next.config.ts` rewrites proxy those requests to
`API_PROXY_TARGET` server-side. This avoids CORS entirely and works even
though the bot host has no HTTPS certificate. `NEXT_PUBLIC_*` values are
inlined at build time, so redeploy without build cache after changing them.

Local development:

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. End-to-end smoke test

1. `GET /api/health` returns `ok: true`
2. Open dashboard → **Login with Discord**
3. After redirect, land on `/dashboard`
4. Bots you own (or have access to) appear in the list
5. Open a bot → edit name/status/voice channel → **Save changes**
6. Start/stop bot from the Controls panel
7. Copy invite link if the bot is not yet in your server

## API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/discord` | No | Exchange OAuth code for JWT |
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/bots` | Yes | List accessible bots |
| GET | `/api/bots/:id` | Yes | Bot detail + subscription |
| PATCH | `/api/bots/:id` | Yes (admin+) | Update profile/settings |
| POST | `/api/bots/:id/start` | Yes (admin+) | Start bot |
| POST | `/api/bots/:id/stop` | Yes (admin+) | Stop bot |
| GET | `/api/bots/:id/channels` | Yes (viewer+) | Guild voice/text channels |
| GET | `/api/bots/:id/invite` | Yes (admin+) | Bot invite URL |
| GET | `/api/bots/:id/access` | Yes (admin+) | List shared access |
| POST | `/api/bots/:id/access` | Yes (owner) | Grant admin/viewer |
| DELETE | `/api/bots/:id/access/:userId` | Yes (owner) | Revoke access |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS error in browser | `WEB_ORIGIN` must exactly match the frontend URL (scheme + host, no trailing slash) |
| OAuth redirect mismatch | `DISCORD_REDIRECT_URI` must match Discord portal + `NEXT_PUBLIC_DISCORD_REDIRECT_URI` |
| API disabled log on startup | Set both `DISCORD_CLIENT_ID` and `JWT_SECRET` |
| Channel list fails | Bot must be invited to the guild; use invite link from dashboard |
| 401 after login | Check `JWT_SECRET` is stable across restarts; re-login if secret changed |
| fi7 port unreachable | Confirm fi7 allows inbound HTTP on port 21024 from the public internet |
| `Cannot find package 'hono'` on startup | Upload `package.json` + `package-lock.json` with your build, then run `npm install --omit=dev` before start (or use `npm start`, which installs automatically) |

## Security notes

- Bot tokens are encrypted in Supabase and never returned by the API
- JWT expires after 7 days; users re-login via Discord
- Discord `/mybot` panel continues to work in parallel
