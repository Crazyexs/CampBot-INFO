# AC × KMUTT Rocket Camp Bot (Discord)

A Discord bot for **AC × KMUTT Rocket Camp 2025 — Operated by DTI**.  
It supports both classic prefix commands and automatic replies in channels.  
Optional Gemini integration is included with strict token limits to protect free quota.  
Built with discord.js v14 and Node.js 18+.

> **No extra config files needed.** This bot works out‑of‑the‑box with a single `.env`.  

---

## Feature Overview

### User Features
- Prefix commands: `p!help`, `p!rocketcamp`, `p!price`, `p!apply`, `p!contact`, `p!venue`, `p!schedule <workshop|launch>`, `p!ask <question>`
- Auto-reply in channels (no `p!` required) with three modes:
  - **all**: reply to every message
  - **loose**: reply to most messages
  - **strict**: reply only to clear questions
- Knowledge‑base first: answers from curated keywords before calling Gemini
- Gemini fallback (optional) with hard caps on output tokens and truncated inputs
- Clean embeds for overview, venue, and daily schedules

### Admin & Ops
- Runtime admin control via `p!admin`:
  - toggle auto‑reply, modes, allowed channels
  - adjust rate limits (cooldown/per‑minute)
  - enable/disable Gemini, change model, cap tokens/chars
  - switch command prefix at runtime
- Hot‑reload camp data from `camp.config.json` (optional)
- Persist runtime edits with `p!saveconfig`

---

## Quick Start

1. **Prerequisites**
   - Node.js 18+
   - A Discord Bot Token (Developer Portal → Applications → Bot → Token)
   - Developer Portal → **Bot** → **Privileged Gateway Intents**: enable **Message Content Intent**
   - Give the bot **View Channel** and **Send Messages** permissions in your channels

2. **Install**
   ```bash
   npm init -y
   npm install discord.js dotenv node-fetch
   ```

3. **Create `.env`**
   ```ini
   DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
   PREFIX=!

   # Auto-reply
   AUTO_REPLY=on                 # on/off
   AUTO_REPLY_CHANNELS=          # empty = all channels, or comma-separated channel IDs
   AUTO_REPLY_MODE=all           # all | loose | strict
   AUTO_REPLY_COOLDOWN_SECONDS=8
   AUTO_REPLY_MAX_PER_MIN=20
   AUTO_REPLY_USE_THREADS=off
   DEBUG=off

   # Admins (comma-separated Discord user IDs)
   ADMIN_IDS=

   # Gemini (optional, quota-friendly)
   GEMINI_PROVIDER=google
   GEMINI_API_KEY=YOUR_GOOGLE_API_KEY
   GEMINI_MODEL=gemini-1.5-flash
   GEMINI_MAX_OUTPUT_TOKENS=256
   GEMINI_MAX_INPUT_CHARS=3000
   # Optional custom endpoint for non-Google providers:
   GEMINI_ENDPOINT=
   ```

4. **(Optional) Add `camp.config.json`**
   If present, the bot auto‑reloads it when you save. Example:
   ```json
   {
     "camp": {
       "title": "AC x KMUTT Rocket Camp 2025 — Operated by DTI",
       "desc": "Short multi-line description...",
       "where1": "Workshop 1–3 Oct 2025 @ Assumption College",
       "where2": "Launch 6–10 Oct 2025 @ Wangchan Valley, Rayong",
       "forms": {
         "individual": "https://go.spaceac.tech/rocket-camp-2025-form",
         "team": "https://go.spaceac.tech/rocket-camp-2025-team",
         "line": "https://lin.ee/W4dKV7D",
         "facebook": "https://go.spaceac.tech/facebook"
       },
       "pricing": { "spectator": 2000, "individual": 12345, "team": 100000 },
       "scheduleSummary": "Workshop 3 days (1–3 Oct) + Launch 5 days (6–10 Oct), total 8 days",
       "schedule": { "workshop": [], "launch": [] },
       "eligibility": [],
       "perks": []
     },
     "venues": [
       { "name": "Wangchan Valley, Rayong", "url": "https://maps.app.goo.gl/rmx8v35oLzxpFVXx7" }
     ]
   }
   ```

5. **Run**
   ```bash
   node index.js
   ```

Expected logs:
```
Logged in as <YourBot#1234>
Auto-reply: ON (all)
Allowed channels: ALL
```

---

## Environment Variables

| Variable | Default | Description |
|---|---:|---|
| `DISCORD_TOKEN` | — | Bot token (required). |
| `PREFIX` | `!` | Command prefix. |
| `AUTO_REPLY` | `on` | Enable auto replies without `!`. |
| `AUTO_REPLY_CHANNELS` | (empty) | Comma‑separated channel IDs; empty = all channels. |
| `AUTO_REPLY_MODE` | `all` | `all` / `loose` / `strict`. |
| `AUTO_REPLY_COOLDOWN_SECONDS` | `8` | Per‑user cooldown per channel. |
| `AUTO_REPLY_MAX_PER_MIN` | `20` | Max replies per channel per minute. |
| `AUTO_REPLY_USE_THREADS` | `off` | Reply inside threads. |
| `DEBUG` | `off` | Log debug skip reasons. |
| `ADMIN_IDS` | (empty) | Comma‑separated admin user IDs. |
| `GEMINI_PROVIDER` | `google` | Provider name. |
| `GEMINI_API_KEY` | (empty) | Required to call Gemini. |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Model name. |
| `GEMINI_MAX_OUTPUT_TOKENS` | `256` | Output token cap. |
| `GEMINI_MAX_INPUT_CHARS` | `3000` | Input truncation size. |
| `GEMINI_ENDPOINT` | (empty) | Custom endpoint for non‑Google providers. |

---

## Commands Reference

### User Commands
- `p!help` — Show commands
- `p!rocketcamp` — Overview embed
- `p!price` — Pricing summary
- `p!apply` — Application links (individual/team)
- `p!contact` — Contact channels (LINE, Facebook)
- `p!venue` — Venue list embed
- `p!schedule workshop` — Workshop days embed
- `p!schedule launch` — Launch days embed
- `p!ask <question>` — Ask Gemini (used only if the keyword KB does not answer)

### Admin Commands (runtime)
- `p!admin help` — Show admin help
- `p!admin show` — Show current runtime config (JSON)
- `p!admin prefix <symbol>` — Change command prefix
- `p!admin auto <on|off>` — Toggle auto replies
- `p!admin mode <all|loose|strict>` — Change auto‑reply sensitivity
- `p!admin channels list` — Show allowed channel IDs (empty = all)
- `p!admin channels set <id,id,...>` — Restrict to a list of channel IDs
- `p!admin channels add <id>` — Allow an extra channel
- `p!admin channels remove <id>` — Remove a channel from allowed list
- `p!admin cooldown <seconds>` — Per‑user cooldown per channel
- `p!admin rate <per-minute>` — Per‑channel reply cap per minute
- `p!admin threads <on|off>` — Reply inside threads
- `p!admin debug <on|off>` — Verbose debug logging
- `p!admin gemini <on|off>` — Enable/disable Gemini calls (API key still required)
- `p!admin gemini model <name>` — Change Gemini model
- `p!admin gemini maxout <tokens>` — Cap output tokens
- `p!admin gemini maxin <chars>` — Cap input chars sent to Gemini

### Admin Data Utilities
- `p!reloadconfig` — Manually reload `camp.config.json`
- `p!saveconfig` — Write current `STATE` to `camp.config.json`
- `p!set price <spectator|individual|team> <number>` — Update fees
- `p!set forms <individual|team|line|facebook> <url>` — Update links
- `p!set schedule "<summary text>"` — Update schedule summary
- `p!set venue add "Name" "URL"` — Add a venue
- `p!set venue remove <index>` — Remove a venue (1‑based)

---

## Auto‑reply Behavior

- **Channel filter:** if `.env` `AUTO_REPLY_CHANNELS` is empty, replies in all text channels; otherwise only in listed channel IDs.
- **Mode:** `AUTO_REPLY_MODE` controls when the bot replies:
  - `all` — reply to every message
  - `loose` — reply to most messages (skips empty/very short noise)
  - `strict` — reply only when the message clearly contains camp‑related keywords/questions
- **Camp relevance filter:** messages that are not camp‑related receive a polite “not related” response with tips.
- **Rate limits:** per‑user cooldown (`AUTO_REPLY_COOLDOWN_SECONDS`) and per‑channel per‑minute cap (`AUTO_REPLY_MAX_PER_MIN`).

---

## Gemini Usage & Quota Protection

- The bot answers from KB first (free), then calls Gemini only if needed and configured.
- Output is capped by `GEMINI_MAX_OUTPUT_TOKENS`.
- Context is truncated to `GEMINI_MAX_INPUT_CHARS` before sending.
- You can disable/enable Gemini at runtime: `!admin gemini off` / `on`.

---

## Deployment

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "index.js"]
```
```bash
docker build -t rocketcamp-bot .
docker run --env-file .env --name rocketcamp-bot --restart unless-stopped rocketcamp-bot
```

### PM2 (optional)
```bash
npm i -g pm2
pm2 start index.js --name rocketcamp-bot
pm2 save
pm2 startup
```

---

## Troubleshooting

- **Bot replies only when using `!`**
  - Set `AUTO_REPLY=on` in `.env`
  - Ensure `AUTO_REPLY_CHANNELS` includes your channel ID(s) or is blank to allow all
  - Verify **Message Content Intent** is enabled in the Developer Portal
  - Check channel permissions (View Channel + Send Messages)

- **“Gemini is disabled or not configured”**
  - Add `GEMINI_API_KEY` to `.env`
  - Run `!admin gemini on`

- **HTTP 403/401 from Gemini**
  - Verify API key and project access; check `GEMINI_MODEL` is correct

- **“Missing DISCORD_TOKEN”**
  - Add `DISCORD_TOKEN` to `.env`

- **Syntax error like “catch or finally expected”**
  - You likely pasted an incomplete file or mismatched braces. Validate quickly with:
    ```bash
    node --check index.js
    ```
  - Ensure Node.js 18+ and copy the full `index.js` including all closing braces

- **Rate limit skips**
  - Turn on debug: set `DEBUG=on` or use `!admin debug on` to see skip reasons

---
## RUN IN BACKGROUND
Start-Process -FilePath "node" -ArgumentList "index.js" -WorkingDirectory "C:\Users\Example\Example" -WindowStyle Hidden
