import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { updateBillStatus } from "@/lib/bills";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { id } = params;

  if (!isSupabaseConfigured()) {
    return Response.json(
      {
        error:
          "Demo mode — open bills only after creating them in this session via New Bill",
      },
      { status: 404 }
    );
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

  if (data?.bill_lines) {
    data.bill_lines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  return Response.json({ bill: data });
}

export async function PATCH(request, { params }) {
  const { id } = params;
  const body = await request.json();

  try {
    if (!isSupabaseConfigured()) {
      return Response.json({
        bill: {
          id,
          status: body.status || "paid",
          payment_mode: body.payment_mode || "upi",
          amount_paid: body.payment_amount,
          paid_at: new Date().toISOString(),
          demo: true,
        },
        demo: true,
      });
    }

    const bill = await updateBillStatus(id, {
      status: body.status,
      payment_mode: body.payment_mode,
      payment_amount: body.payment_amount,
      payment_notes: body.payment_notes,
    });

    return Response.json({ bill });
  } catch (e) {
    return Response.json({ error: e.message || "Update failed" }, { status: 500 });
  }
}
