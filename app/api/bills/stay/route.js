import { createBill } from "@/lib/bills";
import { buildStayLines, priceNights } from "@/lib/stay-invoice";
import { generateAndStoreInvoicePdf } from "@/lib/invoice-store";
import { isAuthed, getStaffName } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Accommodation invoices — SAC 997212 @ 18%, series SB/STAY/FY/NNN.
 *
 * GET  ?villa=..&check_in=..&check_out=..  price a stay without saving it, so
 *      the operator sees the night-by-night figure before issuing anything.
 * POST issue the invoice.
 */
export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const p = new URL(request.url).searchParams;
    const quote = buildStayLines({
      villa: p.get("villa"),
      checkIn: p.get("check_in"),
      checkOut: p.get("check_out"),
      extraBeds: Number(p.get("extra_beds")) || 0,
      forcePeak: p.get("peak") === "1",
      nightlyRate: Number(p.get("nightly_rate")) || null,
      totalOverride: Number(p.get("total_override")) || null,
      extraCharges: Number(p.get("extra_charges")) || 0,
      extraChargesNote: p.get("extra_note") || "",
    });
    return Response.json(quote);
  } catch (e) {
    // Bad dates / unknown villa are operator input, not a server fault.
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const body = await request.json();
    const guest = String(body.guest_name || "").trim();
    if (!guest) {
      return Response.json({ error: "Guest name is required" }, { status: 400 });
    }

    // Price it server-side. Never trust a total posted by the browser — the rate
    // card is the authority on what a night costs.
    const stay = buildStayLines({
      villa: body.villa,
      checkIn: body.check_in,
      checkOut: body.check_out,
      extraBeds: Number(body.extra_beds) || 0,
      forcePeak: body.peak === true || body.peak === "1",
      // The operator's own agreed pricing. Real bookings are negotiated, so the
      // rate card is a starting point. Still priced SERVER-side from these
      // inputs — the browser never posts a finished total.
      nightlyRate: Number(body.nightly_rate) || null,
      totalOverride: Number(body.total_override) || null,
      extraCharges: Number(body.extra_charges) || 0,
      extraChargesNote: body.extra_note || "",
    });

    const bill = await createBill({
      villa: body.villa,
      guest_name: guest,
      guest_phone: body.guest_phone || null,
      guest_email: body.guest_email || null,
      // The night-by-night breakdown, so the guest can see how the figure was
      // reached without disturbing the single ledger line above it.
      notes: [stay.notes, String(body.notes || "").trim()]
        .filter(Boolean)
        .join(" | "),
      lines: stay.lines,
      source: body.source || "web",
      gst_applied: body.gst_applied !== false,
      created_by: body.created_by || getStaffName() || null,
      amount_paid: Number(body.amount_paid) || 0,
      buyer_company: body.buyer_company || null,
      buyer_gstin: body.buyer_gstin || null,
      buyer_address: body.buyer_address || null,
      invoice_kind: "accommodation",
    });

    let stored = { bill, pdfUrl: null };
    try {
      stored = await generateAndStoreInvoicePdf(bill);
    } catch (e) {
      console.error("stay pdf store", e);
    }

    return Response.json({
      bill: stored.bill,
      pdf_url: stored.pdfUrl || stored.bill?.pdf_url || null,
      stay: {
        nights: stay.nights,
        nightCount: stay.nightCount,
        rackTotal: stay.rackTotal,
        roomTotal: stay.roomTotal,
        negotiated: stay.negotiated,
        discount: stay.discount,
        extraBedTotal: stay.extraBedTotal,
        extraCharges: stay.extraCharges,
      },
    });
  } catch (e) {
    const msg = e.message || "Failed";
    const isInput =
      /GSTIN|company name|guest name|night|rate card|YYYY-MM-DD|check-?out/i.test(msg);
    return Response.json({ error: msg }, { status: isInput ? 400 : 500 });
  }
}
