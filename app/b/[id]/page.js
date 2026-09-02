import { getBill } from "@/lib/bills";
import { PROPERTY, formatInrExact } from "@/lib/config";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PublicBillPage({ params }) {
  const bill = await getBill(params.id);
  if (!bill) notFound();

  const lines = bill.bill_lines || [];

  return (
    <div className="app-shell" style={{ paddingBottom: 24 }}>
      <main className="page">
        <div className="invoice" id="invoice">
          <div className="invoice-header">
            <div>
              <div className="invoice-brand">{PROPERTY.name}</div>
              <div style={{ fontSize: "0.85rem", color: "#555", marginTop: 4 }}>
                {PROPERTY.address}
                <br />
                {PROPERTY.phone}
                {PROPERTY.gstin ? (
                  <>
                    <br />
                    GSTIN: {PROPERTY.gstin}
                  </>
                ) : null}
              </div>
            </div>
            <div className="invoice-meta">
              <div>
                <strong>Bill</strong> {bill.bill_no}
              </div>
              <div>
                <strong>Date</strong> {bill.bill_date}
              </div>
              <div style={{ marginTop: 8 }}>
                <span className={`badge badge-${bill.status}`}>{bill.status}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                {bill.buyer_company ? "Buyer (Bill to)" : "Guest"}
              </div>
              <strong>{bill.buyer_company || bill.guest_name}</strong>
              {bill.buyer_gstin ? (
                <div style={{ fontWeight: 700, marginTop: 2, fontSize: "0.9rem" }}>
                  GSTIN/UIN: {bill.buyer_gstin}
                </div>
              ) : null}
              {bill.buyer_company && bill.guest_name ? (
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  Guest: {bill.guest_name}
                </div>
              ) : null}
            </div>
            <div>
              <div className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                Villa
              </div>
              <strong>{bill.villa}</strong>
            </div>
          </div>

          {bill.notes ? (
            <p style={{ marginTop: 12, fontSize: "0.9rem", color: "#555" }}>
              <em>{bill.notes}</em>
            </p>
          ) : null}

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id || l.description}>
                  <td>{l.description}</td>
                  <td className="num">{l.qty}</td>
                  <td className="num">{formatInrExact(l.rate_inr)}</td>
                  <td className="num">{formatInrExact(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals" style={{ borderTop: "none" }}>
            <div className="line">
              <span>Subtotal</span>
              <span>{formatInrExact(bill.subtotal)}</span>
            </div>
            <div className="line">
              <span>Tax</span>
              <span>{formatInrExact(bill.tax_total)}</span>
            </div>
            <div className="grand">
              <span>Total</span>
              <span>{formatInrExact(bill.grand_total)}</span>
            </div>
            {Number(bill.card_fee_inr) > 0 ? (
              <>
                <div className="line">
                  <span>
                    Card payment fee
                    {Number(bill.card_fee_pct) ? ` (${Number(bill.card_fee_pct)}%)` : ""}
                  </span>
                  <span>{formatInrExact(bill.card_fee_inr)}</span>
                </div>
                <div className="grand">
                  <span>Amount payable</span>
                  <span>
                    {formatInrExact(
                      Number(bill.grand_total) + Number(bill.card_fee_inr)
                    )}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {bill.status === "paid" ? (
            <div className="paid-stamp">
              PAID {bill.payment_mode ? `· ${String(bill.payment_mode).toUpperCase()}` : ""}
            </div>
          ) : null}

          <div className="invoice-foot">
            <div>Thank you for staying at {PROPERTY.name}.</div>
            <div>On-site extras bill · {PROPERTY.email}</div>
          </div>
        </div>

        <p className="muted no-print" style={{ textAlign: "center", marginTop: 16, fontSize: "0.85rem" }}>
          Share this link with the guest · Browser menu → Print → Save as PDF
        </p>
      </main>
    </div>
  );
}
