import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function computeTotals(lines) {
  let subtotal = 0;
  let tax_total = 0;
  const computed = lines.map((line, i) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate_inr) || 0;
    const gst = Number(line.gst_pct) || 0;
    const base = qty * rate;
    const tax = (base * gst) / 100;
    subtotal += base;
    tax_total += tax;
    return {
      catalog_item_id: line.catalog_item_id || null,
      description: line.description,
      category: line.category || "other",
      qty,
      rate_inr: rate,
      gst_pct: gst,
      line_total: Math.round((base + tax) * 100) / 100,
      sort_order: i,
    };
  });
  return {
    lines: computed,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_total: Math.round(tax_total * 100) / 100,
    grand_total: Math.round((subtotal + tax_total) * 100) / 100,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") || 50);

  if (!isSupabaseConfigured()) {
    return Response.json({ bills: [], demo: true });
  }

  const supabase = getSupabase();
  let q = supabase
    .from("bills")
    .select("*, bill_lines(*)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (date) q = q.eq("bill_date", date);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ bills: data || [] });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const villa = String(body.villa || "").trim();
    const guest_name = String(body.guest_name || "").trim();
    const guest_phone = body.guest_phone ? String(body.guest_phone).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const rawLines = Array.isArray(body.lines) ? body.lines : [];

    if (!villa || !guest_name) {
      return Response.json({ error: "Villa and guest name are required" }, { status: 400 });
    }
    if (rawLines.length === 0) {
      return Response.json({ error: "Add at least one item" }, { status: 400 });
    }

    const { lines, subtotal, tax_total, grand_total } = computeTotals(rawLines);

    if (!isSupabaseConfigured()) {
      const demoBill = {
        id: "demo-" + Date.now(),
        bill_no: "SB-DEMO-" + String(Date.now()).slice(-4),
        bill_date: new Date().toISOString().slice(0, 10),
        villa,
        guest_name,
        guest_phone,
        notes,
        subtotal,
        tax_total,
        grand_total,
        status: "unpaid",
        payment_mode: null,
        paid_at: null,
        bill_lines: lines.map((l, i) => ({ ...l, id: "dl-" + i })),
        demo: true,
      };
      return Response.json({ bill: demoBill, demo: true });
    }

    const supabase = getSupabase();

    const { data: billNoData, error: billNoErr } = await supabase.rpc("next_bill_no");
    if (billNoErr) {
      return Response.json({ error: "Could not allocate bill number: " + billNoErr.message }, { status: 500 });
    }

    const bill_no = billNoData;

    const { data: bill, error: billErr } = await supabase
      .from("bills")
      .insert({
        bill_no,
        villa,
        guest_name,
        guest_phone,
        notes,
        subtotal,
        tax_total,
        grand_total,
        status: "unpaid",
      })
      .select()
      .single();

    if (billErr) {
      return Response.json({ error: billErr.message }, { status: 500 });
    }

    const lineRows = lines.map((l) => ({ ...l, bill_id: bill.id }));
    const { data: savedLines, error: lineErr } = await supabase
      .from("bill_lines")
      .insert(lineRows)
      .select();

    if (lineErr) {
      await supabase.from("bills").delete().eq("id", bill.id);
      return Response.json({ error: lineErr.message }, { status: 500 });
    }

    return Response.json({
      bill: { ...bill, bill_lines: savedLines || [] },
    });
  } catch (e) {
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
