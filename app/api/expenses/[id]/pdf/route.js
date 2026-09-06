import { isAuthed } from "@/lib/auth";
import { getExpense } from "@/lib/expenses";
import { listExpenseLines } from "@/lib/expense-lines";
import { buildCommissionSettlementPdf } from "@/lib/commission-settlement-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Settlement PDF for a commission expense (money out).
 * Other expense categories: 400 — use the supplier scan attached to the row.
 */
export async function GET(_request, { params }) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    const id = params.id;
    const expense = await getExpense(id);
    if (!expense) {
      return Response.json({ error: "Expense not found" }, { status: 404 });
    }
    if (expense.category !== "commission") {
      return Response.json(
        {
          error:
            "Settlement PDF is only for commission payouts. Attach the supplier bill on Purchases for other expenses.",
        },
        { status: 400 }
      );
    }

    const lines = await listExpenseLines(id);
    const note =
      (lines && lines[0] && lines[0].description) ||
      expense.title ||
      "Commission";

    // City was folded into the title as "Commission — Name (City)"
    let city = null;
    const m = String(expense.title || "").match(/\(([^)]+)\)\s*$/);
    if (m) city = m[1];

    const pdfBuffer = await buildCommissionSettlementPdf(expense, {
      payee: expense.vendor,
      city,
      note,
    });

    const fname = `commission-${String(expense.vendor || "payee")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 24)}-${expense.expense_date || "doc"}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fname}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("commission pdf", e);
    return Response.json({ error: e.message || "PDF failed" }, { status: 500 });
  }
}
