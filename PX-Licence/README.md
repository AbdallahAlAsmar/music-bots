# PX License System

A Discord bot for managing FiveM server licenses with IP validation.

## Features

- **Discord Bot Commands**
  - `!createlicense @user IP` - Create a license for a user (Admin only)
  - `/change-ip` - Change the IP for your license (once per month)
  - `/my-licenses` - View your active licenses
  - `/license-info` - Get details about a specific license
  - `/all-licenses` - View all licenses (Admin only)
  - `/revoke-license` - Revoke a license (Admin only)
  - `/delete-license` - Permanently delete a license (Admin only)

- **License Features**
  - License format: `PX-xxxxxxxxxxxxxxxx`
  - IP-based validation
  - Monthly IP change limit
  - DM notifications when license is created

- **API Endpoints**
  - `GET /validate?license=KEY&server_ip=IP` - Validate a license
  - `GET /check?license=KEY` - Check if license exists
  - `GET /health` - API health check

## Setup

### Prerequisites
- Node.js 18+
- Discord Bot Token
- A server to host the bot and API

### Installation

1. **Clone/Download the project**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your Discord bot token and other settings:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   GUILD_ID=your_discord_guild_id_here
   API_PORT=20605
   API_HOST=0.0.0.0
   ADMIN_ROLE_ID=your_admin_role_id_here
   LICENSE_PREFIX=PX
   ```

4. **Start the bot**
   ```bash
   npm start
   ```
   
   Or for development:
   ```bash
   npm run dev
   ```

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the token to your `.env` file
5. Enable these Privileged Gateway Intents:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
6. Go to OAuth2 > URL Generator
7. Select scopes: `bot`, `applications.commands`
8. Select permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
9. Use the generated URL to invite the bot to your server

### FiveM Resource Setup

1. Copy the `fivem-resource/PXVault` folder to your FiveM server's `resources` directory

2. Edit `PXVault/config.lua`:
   ```lua
   Config.LICENSE_KEY = "PX-your-license-key-here"
   Config.API_URL = "http://your-bot-server-ip:20605"
   ```

3. Add to your `server.cfg`:
   ```
   ensure PXVault
   ```

4. Make sure PXVault starts BEFORE your protected resources

## Usage

### Creating a License (Admin)
```
!createlicense @username 31.56.120.34
```

The user will receive a DM with their license key and instructions.

### Changing IP (User)
Users can use the slash command:
```
/change-ip new_ip:192.168.1.100
```

Note: IP can only be changed once per month.

### Viewing Licenses
- Users: `/my-licenses`
- Admins: `/all-licenses` or `!licenses`

## API Documentation

### Validate License
```http
GET /validate?license=PX-abc123&server_ip=31.56.120.34
```

**Success Response:**
```json
{
  "success": true,
  "message": "License is valid",
  "data": {
    "license_key": "PX-abc123",
    "server_ip": "31.56.120.34",
    "created_at": "2026-02-02T10:00:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "IP mismatch. License is registered to a different IP."
}
```

## Database

The bot uses SQLite for persistence. The database file `licenses.db` is created automatically in the project root.

### Schema
- `id` - Auto-increment primary key
- `license_key` - Unique license key
- `discord_user_id` - Discord user ID
- `discord_username` - Discord username at creation time
- `server_ip` - Registered server IP
- `created_at` - Creation timestamp
- `last_ip_change` - Last IP change timestamp (for monthly limit)
- `is_active` - Whether the license is active

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- Use a firewall to restrict API access if needed
- Consider using HTTPS in production
- The bot should be hosted on a reliable server with good uptime

## Troubleshooting

### Bot not responding to commands
- Check if the bot has proper permissions in the channel
- Ensure MESSAGE CONTENT INTENT is enabled for prefix commands
- Check console for any error messages

### FiveM license validation failing
- Verify the API URL is correct and accessible
- Check if the server IP matches the registered IP
- Ensure the license key is correctly copied

### IP change not working
- Check if 30 days have passed since the last change
- Verify you own the license you're trying to update

## License

This project is for educational purposes. Use at your own risk.
