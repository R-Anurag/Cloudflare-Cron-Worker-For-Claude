# Claude "Hi" Cron (Cloudflare Worker)

![Claude Cron Header](github_assets/ReadMe_Header.png)

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) that says **"hi"** to
Claude on a schedule, drawing from your Claude **subscription** (Pro/Max) rather
than pay-per-token API credits.

Runs on Cloudflare's **free** plan. Nothing stays running on your machine, and
Cron Triggers fire reliably and on time.

Default schedule: **6 AM, 11 AM, 4 PM & 9 PM IST** (easy to change — see below).

## What you need

- A **Claude Pro or Max** subscription (this is what gets billed).
- [**Claude Code**](https://docs.claude.com/en/docs/claude-code) installed and
  logged in — used once to mint a token.
- [**Node.js**](https://nodejs.org) (for `npm` / `npx`).

## Setup

```bash
# 1. Clone and install (installs Wrangler, Cloudflare's CLI)
git clone https://github.com/YOUR-USERNAME/claude-cron.git
cd claude-cron
npm install

# 2. Mint a Claude token (requires Pro/Max) — copy the sk-ant-oat... value
claude setup-token

# 3. Log in to Cloudflare (free account, no card needed)
npx wrangler login

# 4. Deploy the Worker
npx wrangler deploy

# 5. Store your token as an encrypted secret.
#    NOTE: the command takes only the NAME — it prompts for the value.
#    Do NOT write `... CLAUDE_CODE_OAUTH_TOKEN=sk-ant-...` (that becomes the name).
npx wrangler secret put CLAUDE_CODE_OAUTH_TOKEN
# ...or pipe it non-interactively (avoids paste/line-wrap issues):
printf %s 'sk-ant-oat...' | npx wrangler secret put CLAUDE_CODE_OAUTH_TOKEN
```

That's it — the Worker now runs on the schedule automatically. To get a Slack
alert when a run fails, see **Failure alerts** below.

## Verify it works

Run the scheduled handler on demand:

```bash
# put your token in .dev.vars first:  CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...
npx wrangler dev --test-scheduled
# then, in another terminal:
curl "http://localhost:8787/__scheduled?cron=30+0,5,10,15+*+*+*"
```

Look for `Claude replied: ...` in the logs. For a real run, watch live logs with
`npx wrangler tail`, or check the dashboard under **Workers → claude-hi → Cron
Events**.

## Failure alerts (Slack)

If a run fails (e.g. the token expired → **HTTP 401**), the Worker posts a
formatted [Block Kit](https://api.slack.com/block-kit) card — the error, a
timestamp, and an image — to a Slack channel. It's **optional**: with no webhook
set, the alert code is a no-op and the Worker runs normally.

```bash
# 1. Create a Slack Incoming Webhook for the target channel, copy the URL:
#    https://api.slack.com/messaging/webhooks
# 2. Store it as a secret (pipe it so nothing gets mangled):
printf %s 'https://hooks.slack.com/services/XXX/YYY/ZZZ' \
  | npx wrangler secret put SLACK_WEBHOOK_URL
```

Takes effect on the next run — no redeploy needed after setting the secret.

**About the image:** Slack Incoming Webhooks **can't upload files**, so the card
references an image by **public URL** (`ERROR_IMAGE_URL` in `src/index.js`). It
points at this repo's raw GitHub file. If you fork/rename the repo or swap the
image, update that URL to your own public URL and redeploy. Test the whole card
without waiting for a real failure:

```bash
curl -X POST "$SLACK_WEBHOOK_URL" -H 'content-type: application/json' \
  -d '{"text":"claude-hi test alert"}'
```

## Change the schedule

Cron Triggers are **UTC only**. Edit `crons` in `wrangler.toml`, then redeploy
(`npx wrangler deploy`). The default `30 0,5,10,15 * * *` maps to:

| IST   | UTC   |
| ----- | ----- |
| 06:00 | 00:30 |
| 11:00 | 05:30 |
| 16:00 | 10:30 |
| 21:00 | 15:30 |

Cron format is `minute hour day-of-month month day-of-week`. Convert your local
times to UTC and set the fields accordingly.

## Notes

- Billed against your Claude **subscription** limits, not API credits. It works
  by authenticating with your Claude Code OAuth token and sending the Claude Code
  CLI headers, so the request is treated as subscription usage.
- Uses `claude-haiku-4-5` — a keep-alive doesn't need a bigger model. Change
  `MODEL` in `src/index.js` if you want.
- The OAuth token does **not** auto-refresh. If it expires, mint a new one
  (`claude setup-token`) and re-run `npx wrangler secret put
  CLAUDE_CODE_OAUTH_TOKEN`. Set up **Failure alerts** above so you find out the
  moment it lapses instead of noticing silence.
- Cron-only: no public HTTP endpoint (`workers_dev = false`, no `fetch`
  handler), so nobody can trigger it anonymously to spend your quota.

## License

[MIT](LICENSE)
