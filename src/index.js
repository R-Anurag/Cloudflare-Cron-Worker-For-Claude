// Cron-only Cloudflare Worker: sends a single "hi" to Claude on a schedule.
//
// Auth uses CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) as a Bearer
// token — the same subscription-billed path the Claude Code CLI uses, so it
// draws from Pro/Max usage rather than pay-per-token API credits. That token is
// scoped to Claude Code, so the request must present as Claude Code (the oauth
// beta header + Claude Code system prompt) or the API returns 429.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5"; // keep-alive doesn't need a bigger model
const SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";

async function sendHi(env) {
  const token = env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) throw new Error("CLAUDE_CODE_OAUTH_TOKEN is not set");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
      "content-type": "application/json",
      "user-agent": "claude-cli/2.1.195 (external, cli)",
      "x-app": "cli",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from Messages API: ${text}`);

  const data = JSON.parse(text);
  const reply = (data.content || []).find((b) => b.type === "text")?.text ?? "";
  console.log("Claude replied:", reply);
  return reply;
}

// Slack error card with the "token expired" image. No-op if the webhook isn't
// set. The image is referenced by public URL — incoming webhooks can't upload
// files — so it must be reachable by Slack (the repo's raw GitHub URL).
const ERROR_IMAGE_URL =
  "https://raw.githubusercontent.com/R-Anurag/Cloudflare-Cron-Worker-For-Claude/master/github_assets/ClaudeTokenExpired.png";

async function notifySlack(env, err, scheduledTimeMs) {
  const url = env.SLACK_WEBHOOK_URL;
  if (!url) return;
  const ts = Math.floor(scheduledTimeMs / 1000);
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `claude-hi cron failed: ${err.message}`, // fallback / notification
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "🚨 claude-hi cron failed", emoji: true },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: "*Error*\n```" + err.message + "```" },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `*Worker:* claude-hi` },
            { type: "mrkdwn", text: `*When:* <!date^${ts}^{date_short_pretty} {time}|${new Date(scheduledTimeMs).toISOString()}>` },
          ],
        },
        { type: "image", image_url: ERROR_IMAGE_URL, alt_text: "Claude token expired" },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: "Fix: re-run `claude setup-token`, then `wrangler secret put CLAUDE_CODE_OAUTH_TOKEN`" },
          ],
        },
      ],
    }),
  });
}

export default {
  // Fires on the cron schedule in wrangler.toml. Cron-only by design: no `fetch`
  // handler, so the Worker exposes no public HTTP trigger. Test via
  // `wrangler dev --test-scheduled`.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      sendHi(env).catch(async (err) => {
        console.error("cron send failed:", err);
        await notifySlack(env, err, event.scheduledTime).catch((e) =>
          console.error("slack notify failed:", e),
        );
      }),
    );
  },
};
