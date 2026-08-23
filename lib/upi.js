import { PROPERTY } from "@/lib/config";

/**
 * Build UPI deep-link for pay (opens GPay / PhonePe / BHIM etc.)
 * @param {{ amount?: number, billNo?: string, note?: string }} opts
 */
export function buildUpiUri(opts = {}) {
  const pa = (PROPERTY.upi || process.env.NEXT_PUBLIC_UPI_ID || "").trim();
  if (!pa) return null;

  const params = new URLSearchParams();
  params.set("pa", pa);
  params.set("pn", PROPERTY.tradeName || PROPERTY.name || "Merchant");
  params.set("cu", "INR");
  if (opts.amount != null && Number(opts.amount) > 0) {
    params.set("am", Number(opts.amount).toFixed(2));
  }
  const tn =
    opts.note || (opts.billNo ? `Bill ${opts.billNo}` : "Invoice payment");
  params.set("tn", String(tn).slice(0, 80));

  return `upi://pay?${params.toString()}`;
}

/** Public QR image URL (no extra npm dep). */
export function upiQrImageUrl(upiUri, size = 220) {
  if (!upiUri) return null;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    upiUri
  )}`;
}

export function amountDue(bill) {
  // Owed = the invoice total PLUS any card fee. This is the one place the app
  // asks "what is left to collect", so the fee has to be inside it — otherwise
  // a card bill shows as settled while the fee is still outstanding.
  const grand =
    Number(bill?.grand_total || 0) + Number(bill?.card_fee_inr || 0);
  if (bill?.status === "paid") return 0;
  if (bill?.status === "void") return 0;
  const paid = Number(bill?.amount_paid || 0);
  return Math.max(0, Math.round((grand - paid) * 100) / 100);
}
