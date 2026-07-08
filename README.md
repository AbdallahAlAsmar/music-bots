# Discord Multi-Bot Platform

Production-oriented Node.js + discord.js system to manage multiple private music bots from a **main control bot**, with an optional **web dashboard** for bot owners.

## Web Dashboard

Owners can sign in with Discord and manage their bots from a browser instead of only using `/mybot` in Discord.

- API: Hono server in `src/api/` (runs inside the bot process)
- Frontend: Next.js app in `web/`
- Deployment guide: [WEB_DASHBOARD.md](WEB_DASHBOARD.md)

## Project Structure

```text
src/
  api/
    routes/
    middleware/
    server.ts
  config/
    env.ts
  core/
    logger.ts
    types.ts
  control/
    command-definitions.ts
    control-bot.ts
  db/
    client.ts
    schema.sql
  manager/
    bot-manager.ts
    managed-bot-runtime.ts
  music/
    guild-player.ts
  repositories/
    access-repository.ts
    bot-repository.ts
    subscription-repository.ts
  services/
    permission-service.ts
  utils/
    cooldown.ts
    crypto.ts
  workers/
    subscription-worker.ts
  index.ts
web/
  src/app/
```

## Features Implemented

- Main control bot commands (slash):
  - `/addbot`
  - `/removebot`
  - `/listbots`
  - `/botinfo`
  - `/mybot` (interactive panel: buttons/selects/modals)
- Dynamic bot runtime manager:
  - add/start without restart
  - stop/remove without restart
  - reload active bots from DB on startup
  - active runtime map in memory
  - basic crash auto-restart behavior
- Managed music bots:
  - own isolated queue per bot runtime
  - `/play` (URL or search query), `/skip`, `/stop`, `/queue`
  - `/pause`, `/resume`, `/nowplaying`
  - `/shuffle`, `/remove`, `/clear`
  - `/loop`, `/volume`, `/lyrics`
  - user must be in assigned voice channel
  - permission-gated commands
- Subscription system:
  - 1/7/30 day plans
  - periodic expiry worker
  - expired bot is stopped and marked `expired`
- Access system:
  - owner/admin/viewer
  - owner can grant/revoke shared access
- Security:
  - encrypted bot tokens in database
  - command cooldown anti-spam guard
- Web dashboard (optional):
  - Discord OAuth login
  - list and edit owned/shared bots
  - profile, presence, voice channel, start/stop, access management
  - see [WEB_DASHBOARD.md](WEB_DASHBOARD.md)

## Supabase Database

Run SQL in `src\db\schema.sql`.

Tables:

- `bots`
- `subscriptions`
- `bot_access`

## Environment Variables

Use `.env.example`:

- `CONTROL_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `DEFAULT_GUILD_ID`
- `ADMIN_IDS` (comma-separated Discord IDs)
- `SUBSCRIPTION_CHECK_INTERVAL_MS`
- `COMMAND_COOLDOWN_MS`
- `GENIUS_ACCESS_TOKEN` (optional, for `/lyrics`)
- `YOUTUBE_COOKIE` (optional, helps avoid YouTube 403 stream errors)
- `COOKIES_FROM_BROWSER` (optional, e.g. `chrome`; helps with YouTube bot checks)
- `COOKIES_FILE` (optional, path to exported `cookies.txt`)
- `YOUTUBE_PO_TOKEN` (optional, extra YouTube auth for stricter environments)
- `API_PORT`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `WEB_ORIGIN`, `JWT_SECRET` (optional, enables web dashboard API — see [WEB_DASHBOARD.md](WEB_DASHBOARD.md))

## Install & Run

1. `npm install`
2. Create `.env` from `.env.example`
3. Apply `src\db\schema.sql` to Supabase PostgreSQL
4. Start development:
   - `npm run dev`
5. Production:
   - `npm run build`
   - `npm start`

## Important Notes

- Bot username/avatar updates are Discord-rate-limited by Discord itself.
- For production scale, run Lavalink + robust queue persistence; current implementation uses `@discordjs/voice + play-dl`.
- Ensure all managed bot tokens are valid and have required bot intents enabled.
