import { getBotToken, setWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * One-shot: POST /api/telegram/setup?key=SETUP_KEY
 * Registers webhook to this deployment.
 */
export async function POST(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-setup-key");
  const expected = process.env.TELEGRAM_SETUP_KEY || process.env.MANAGER_PIN;
  if (!expected || key !== expected) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!getBotToken()) {
    return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" }, { status: 503 });
  }

  const appUrl = process.env.APP_URL || "https://sadhrana-billing.vercel.app";
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;

  try {
    const result = await setWebhook(webhookUrl, secret);
    return Response.json({ ok: true, webhookUrl, result });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
