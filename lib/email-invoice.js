import { PROPERTY } from "@/lib/config";

/**
 * Send invoice email via Resend if RESEND_API_KEY is set.
 * Returns { ok, mode: 'resend'|'mailto', error? }
 */
export async function sendInvoiceEmail({ to, bill, pdfUrl, invoiceUrl }) {
  const email = String(to || "").trim();
  if (!email || !email.includes("@")) {
    throw new Error("Valid guest email required");
  }

  const subject = `${PROPERTY.tradeName || PROPERTY.name} — Invoice ${bill.bill_no}`;
  const bodyText = [
    `Dear ${bill.guest_name || "Guest"},`,
    "",
    `Please find your invoice ${bill.bill_no} from ${PROPERTY.tradeName || PROPERTY.name}.`,
    `Amount: ₹${Number(bill.grand_total || 0).toLocaleString("en-IN")}`,
    `Status: ${bill.status}`,
    pdfUrl ? `PDF: ${pdfUrl}` : null,
    invoiceUrl ? `View online: ${invoiceUrl}` : null,
    "",
    PROPERTY.upi ? `UPI: ${PROPERTY.upi}` : null,
    PROPERTY.phone ? `Phone: ${PROPERTY.phone}` : null,
    "",
    "Thank you.",
    PROPERTY.legalName || PROPERTY.tradeName,
  ]
    .filter(Boolean)
    .join("\n");

  const key = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    process.env.NEXT_PUBLIC_PROPERTY_EMAIL ||
    "billing@billbanaoppay.com";

  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${PROPERTY.tradeName || "Billing"} <${from}>`,
        to: [email],
        subject,
        text: bodyText,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error("Email failed: " + err.slice(0, 200));
    }
    return { ok: true, mode: "resend" };
  }

  // No API key — caller should open mailto
  return {
    ok: true,
    mode: "mailto",
    mailto: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(bodyText)}`,
  };
}
