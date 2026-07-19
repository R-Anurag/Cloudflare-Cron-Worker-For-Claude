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

export default {
  // Fires on the cron schedule in wrangler.toml. Cron-only by design: no `fetch`
  // handler, so the Worker exposes no public HTTP trigger. Test via
  // `wrangler dev --test-scheduled`.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      sendHi(env).catch((err) => console.error("cron send failed:", err)),
    );
  },
};
