import { getBotToken } from "@/lib/telegram";
import { handleUpdate } from "@/lib/telegram-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Telegram webhook.
 * Set: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://sadhrana-billing.vercel.app/api/telegram
 * Optional header: X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(request) {
  try {
    if (!getBotToken()) {
      return Response.json({ ok: false, error: "Bot not configured" }, { status: 503 });
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const header = request.headers.get("x-telegram-bot-api-secret-token");
      if (header !== secret) {
        return Response.json({ ok: false }, { status: 401 });
      }
    }

    const update = await request.json();
    // Process inline — keep under Telegram's ~60s; return 200 quickly after work
    await handleUpdate(update);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("telegram webhook", e);
    // Always 200 so Telegram doesn't retry forever on our bugs
    return Response.json({ ok: true, error: String(e.message || e) });
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    service: "sadhrana-telegram",
    configured: Boolean(getBotToken()),
  });
}
