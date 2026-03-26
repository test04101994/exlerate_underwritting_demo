# EXLerate AI — Setup Guide (New Laptop)

## Prerequisites

Install these before copying the project:

| Tool | Required Version | Install |
|------|-----------------|---------|
| Node.js | v20+ (v25 works) | https://nodejs.org |
| npm | v10+ | included with Node |

Verify: `node --version && npm --version`

---

## Quick Start

### 1. Copy the Project

Zip the entire `project-backup-2` folder on the source laptop and copy it to the new machine.
**Include** the `node_modules` folder to skip re-installing — or exclude it and run `npm install`.

```bash
# On source laptop — zip excluding node_modules (faster transfer):
cd ~/Downloads
zip -r exlerate-ai.zip project-backup-2 --exclude "project-backup-2/node_modules/*"

# On new laptop — unzip and install:
unzip exlerate-ai.zip -d ~/Downloads/
cd ~/Downloads/project-backup-2
npm install
```

---

### 2. Credentials — Nothing to Change

All credentials live in `config/credentials.json` and are already set:

| Service | Status | Notes |
|---------|--------|-------|
| **Jira** | Ready | `digitalfx.atlassian.net` — token works from any machine |
| **OpenRouter** | Ready | Fill in `api_key` if needed |
| **AWS S3** | Disabled | Removed — not needed |

The Jira token is tied to the Jira account, not the machine. It works from any laptop.

---

### 3. Start the App

```bash
cd ~/Downloads/project-backup-2
npm run dev
```

Open browser at: **http://localhost:3001**

---

### 4. What Works Out of the Box

| Feature | Works? | Notes |
|---------|--------|-------|
| Insurance workflow dashboard | Yes | |
| Create new case | Yes | |
| Delete cases | Yes | |
| Agent pipeline (all 7 agents) | Yes | |
| Jira ticket lookup (XSX-4333) | Yes | Uses live Jira API |
| Jira writeback / comments | Yes | Uses live Jira API |
| Agent speed control | Yes | Edit `server/demo-config.ts` |
| S3 upload | Removed | Not needed for demo |
| SendGrid email | Not present | Not in this project |

---

### 5. Jira Integration — Verify It Works

After starting the app, go to the Jira workflow and open any ticket.
If you see ticket data loading — Jira is connected.

If you get a **401 error**, the Jira API token may have expired.
To get a new one:
1. Log into https://id.atlassian.com/manage-profile/security/api-tokens
2. Create a new token
3. Paste it into `config/credentials.json` → `jira.api_token`
4. Restart the server

---

### 6. Port Conflict (if 3001 is in use)

```bash
# Use a different port:
PORT=3002 npm run dev
```

---

### 7. Demo Data Location

All demo case data lives in:
- `data/csv/dashboard-cases.csv` — insurance workflow cases
- `data/csv/` — other reference data

If you want to reset cases to the original demo set, the CSV can be edited directly.

---

## Folder Structure (Key Files)

```
project-backup-2/
├── client/src/           — React frontend
├── server/               — Express backend + agents
│   ├── index.ts          — Server entry point (body size limit set to 50mb)
│   ├── routes.ts         — All API endpoints
│   ├── demo-config.ts    — Agent speed multiplier
│   ├── jira-agent-steps.ts — Jira workflow agent messages
│   └── jira-api.ts       — Jira REST API client
├── config/
│   └── credentials.json  — All credentials (Jira, OpenRouter)
├── data/csv/             — Dashboard case data
├── public/jira-documents/ — Uploaded slip documents
├── DEMO_SCRIPT.md        — Full demo talking points
└── SETUP.md              — This file
```
