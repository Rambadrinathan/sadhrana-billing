import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { id } = params;

  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Demo mode — open bills only after creating them in this session via New Bill" }, { status: 404 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bills")
    .select("*, bill_lines(*)")
    .eq("id", id)
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 404 });
  }

  // Sort lines
  if (data?.bill_lines) {
    data.bill_lines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  return Response.json({ bill: data });
}

export async function PATCH(request, { params }) {
  const { id } = params;
  const body = await request.json();

  if (!isSupabaseConfigured()) {
    return Response.json({
      bill: {
        id,
        status: body.status || "paid",
        payment_mode: body.payment_mode || "upi",
        paid_at: new Date().toISOString(),
        demo: true,
      },
      demo: true,
    });
  }

  const supabase = getSupabase();
  const patch = { updated_at: new Date().toISOString() };

  if (body.status === "paid") {
    patch.status = "paid";
    patch.payment_mode = body.payment_mode || "upi";
    patch.paid_at = new Date().toISOString();
  } else if (body.status === "void") {
    patch.status = "void";
  } else if (body.status === "unpaid") {
    patch.status = "unpaid";
    patch.payment_mode = null;
    patch.paid_at = null;
  }

  const { data, error } = await supabase
    .from("bills")
    .update(patch)
    .eq("id", id)
    .select("*, bill_lines(*)")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ bill: data });
}
