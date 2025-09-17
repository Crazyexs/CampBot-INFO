# AC × KMUTT Rocket Camp Bot (Discord)

A Discord bot for **AC × KMUTT Rocket Camp 2025 — Operated by DTI**.  
It supports both classic prefix commands and automatic replies in channels.  
Optional Gemini integration is included with strict token limits to protect free quota.  
Built with discord.js v14 and Node.js 18+.

---

## Features

- Commands: `!help`, `!rocketcamp`, `!price`, `!apply`, `!contact`, `!venue`, `!ask <question>`
- Auto-reply (no `!`) in selected channels
  - Replies to all messages (configurable) and focuses on camp-related questions
  - If a message is not about the camp, the bot replies that it has no information
- Gemini integration (optional)
  - Caps `maxOutputTokens` and truncates input to save quota
  - Knowledge-base first: fast, free answers before calling Gemini
- Anti-spam: per-user cooldown and per-channel per-minute cap
- Clean embeds and concise, English-first responses

---

## Quick Start

### 1) Prerequisites
- Node.js 18+
- A Discord Bot Token (Developer Portal → Applications → Bot → Token)
- In Developer Portal → Bot → Privileged Gateway Intents: enable **Message Content Intent**

### 2) Install
```bash
npm init -y
npm install discord.js dotenv node-fetch
```

### 3) Create `.env`
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

# Gemini (optional, quota-friendly)
GEMINI_PROVIDER=google
GEMINI_API_KEY=YOUR_GOOGLE_API_KEY
GEMINI_MODEL=gemini-1.5-flash
GEMINI_MAX_OUTPUT_TOKENS=256
GEMINI_MAX_INPUT_CHARS=3000
```

### 4) Add the code
Place your provided `index.js` (the latest “commands + auto-reply + token limits” version) in the project root.

### 5) Run
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

## Configuration Reference

| Variable | Default | Description |
|---|---:|---|
| `DISCORD_TOKEN` | — | Your bot token (required). |
| `PREFIX` | `!` | Command prefix. |
| `AUTO_REPLY` | `on` | Enable auto replies without `!`. |
| `AUTO_REPLY_CHANNELS` | (empty) | Comma-separated channel IDs; empty = all channels. |
| `AUTO_REPLY_MODE` | `all` | `all` = reply every message, `loose` = most messages, `strict` = questions only. |
| `AUTO_REPLY_COOLDOWN_SECONDS` | `8` | Per-user cooldown per channel. |
| `AUTO_REPLY_MAX_PER_MIN` | `20` | Max replies per channel per minute. |
| `AUTO_REPLY_USE_THREADS` | `off` | `on` to reply inside a thread. |
| `DEBUG` | `off` | `on` to log debug skip reasons. |
| `GEMINI_PROVIDER` | `google` | Google Generative Language API. |
| `GEMINI_API_KEY` | (empty) | Required to enable Gemini calls. |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Model name. |
| `GEMINI_MAX_OUTPUT_TOKENS` | `256` | Hard cap on Gemini output tokens. |
| `GEMINI_MAX_INPUT_CHARS` | `3000` | Truncates context before sending to Gemini. |

---

## What to Customize

Inside `index.js`:
- Camp data: `CAMP`, `VENUES`, `SCHEDULE_SUMMARY`
- Knowledge Base: `KB` entries and keywords
- Auto-reply filter: the `isCampRelated()` function
- Token controls: `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_MAX_INPUT_CHARS`
- Rate limiting: `AUTO_REPLY_COOLDOWN_SECONDS`, `AUTO_REPLY_MAX_PER_MIN`

---

## WakaTime in README (GitHub Action)

This repository can show WakaTime development metrics directly in your `README.md`.

### 1) Add the two comment markers
Add these exact lines to your `README.md`. They are the insertion point for metrics:
```
<!--START_SECTION:waka-->
<!--END_SECTION:waka-->
```

### 2) Create repository secrets
GitHub: Settings → Secrets and variables → Actions → New repository secret

- `WAKATIME_API_KEY` = your WakaTime API Key  
- `GH_TOKEN` = your GitHub Personal Access Token (scopes: `repo`, `user`)

Security note about scopes:
- The workflow needs `repo` and `user` to read commit timestamps and lines added/removed.  
- Although `repo` looks broad, this Action only reads metadata needed for statistics. Prefer the principle of least privilege and limit the token to the target repository when possible.

### 3) Get your WakaTime API Key
- Go to https://wakatime.com and create an account
- In Account Settings, copy your API Key
- Install the WakaTime plugin in your editor/IDE and paste the key

### 4) Add the workflow
Create `.github/workflows/waka-readme.yml`:

```yaml
name: Waka Readme

on:
  schedule:
    # Runs at 12am IST (18:30 UTC)
    - cron: '30 18 * * *'
  workflow_dispatch:

jobs:
  update-readme:
    name: Update Readme with Metrics
    runs-on: ubuntu-latest
    steps:
      - uses: anmol098/waka-readme-stats@master
        with:
          WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }}
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

The Action runs daily at 00:00 IST and updates the section between the two comments in your README.

### 5) Optional flags
You can control what appears by passing flags to the Action. Minimal example:

```yaml
- uses: anmol098/waka-readme-stats@master
  with:
    WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }}
    GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

Example with common flags:

```yaml
- uses: anmol098/waka-readme-stats@master
  with:
    WAKATIME_API_KEY: ${{ secrets.WAKATIME_API_KEY }}
    GH_TOKEN: ${{ secrets.GH_TOKEN }}
    SHOW_OS: "False"
    SHOW_PROJECTS: "False"
    SHOW_EDITORS: "True"
    SHOW_TIMEZONE: "True"
    SHOW_LANGUAGE_PER_REPO: "False"
    SHOW_LOC_CHART: "False"        # heavy; disabled by default
    SHOW_SHORT_INFO: "True"
    SHOW_LINE_GRAPH: "True"
    SHOW_LANGUAGE: "True"
```

Add a small section around the markers so visitors know what they are:

```markdown
## Development Metrics (WakaTime)

The stats below are updated automatically every day.

<!--START_SECTION:waka-->
<!--END_SECTION:waka-->
```

---

## Optional: Docker

Basic `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "index.js"]
```

Build and run:

```bash
docker build -t rocketcamp-bot .
docker run --env-file .env --name rocketcamp-bot --restart unless-stopped rocketcamp-bot
```

---

