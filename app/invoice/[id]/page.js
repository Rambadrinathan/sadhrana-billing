import { getBill } from "@/lib/bills";
import { PROPERTY, formatInrExact, amountInWords } from "@/lib/config";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TaxInvoicePage({ params }) {
  const bill = await getBill(params.id);
  if (!bill) notFound();

  const lines = bill.bill_lines || [];
  const taxable = lines.reduce(
    (s, l) => s + Number(l.qty || 0) * Number(l.rate_inr || 0),
    0
  );
  const cgst = Math.round(taxable * 0.025 * 100) / 100;
  const sgst = Math.round(taxable * 0.025 * 100) / 100;
  const grand = Math.round((taxable + cgst + sgst) * 100) / 100;

  return (
    <div className="tax-wrap">
      <style>{`
        .tax-wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; background: #f0eee8; font-family: "Segoe UI", system-ui, sans-serif; color: #1a1a1a; }
        .tax-sheet { background: #fff; border: 1px solid #bbb; box-shadow: 0 8px 32px rgba(0,0,0,.08); padding: 28px 32px; }
        .tax-title { text-align: center; font-size: 1.35rem; font-weight: 800; letter-spacing: .06em; color: #2f5d3a; margin: 0 0 16px; }
        .tax-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; border: 1px solid #ccc; }
        .tax-box { padding: 12px 14px; border-right: 1px solid #ccc; font-size: .88rem; line-height: 1.45; }
        .tax-box:last-child { border-right: none; }
        .tax-box strong.block { display: block; font-size: 1rem; margin-bottom: 4px; }
        .muted { color: #555; font-size: .8rem; }
        table.tax-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: .9rem; }
        table.tax-table th, table.tax-table td { border: 1px solid #ccc; padding: 8px 6px; }
        table.tax-table th { background: #f6f4ee; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #444; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .grand { font-size: 1.15rem; font-weight: 800; color: #1e3d26; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
        .badge-paid { background: #e3f5ea; color: #1f6b3a; }
        .badge-unpaid { background: #fff4df; color: #8a5a00; }
        .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; font-size: .85rem; }
        .sign { text-align: right; margin-top: 40px; font-size: .85rem; }
        .center-note { text-align: center; font-size: .75rem; color: #666; margin-top: 24px; }
        .actions { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 10px 16px; border-radius: 10px; background: #2f5d3a; color: #fff; font-weight: 650; text-decoration: none; border: none; cursor: pointer; font-size: .95rem; }
        .btn-secondary { background: #e6efe8; color: #1e3d26; }
        @media print {
          .tax-wrap { background: #fff; padding: 0; }
          .actions { display: none !important; }
          .tax-sheet { box-shadow: none; border: none; padding: 0; }
        }
      `}</style>

      <div className="actions no-print">
        <button className="btn" type="button" onClick={undefined} id="print-btn">
          Print / Save PDF
        </button>
        <a className="btn btn-secondary" href={`/api/bills/${bill.id}/pdf`}>
          Download PDF
        </a>
        <Link className="btn btn-secondary" href="/">
          Staff home
        </Link>
      </div>

      <div className="tax-sheet">
        <h1 className="tax-title">TAX INVOICE</h1>

        <div className="tax-grid">
          <div className="tax-box">
            <strong className="block">{PROPERTY.legalName}</strong>
            <div style={{ color: "#2f5d3a", fontWeight: 700 }}>{PROPERTY.tradeName}</div>
            <div className="muted">{PROPERTY.address}</div>
            <div>
              <strong>GSTIN/UIN:</strong> {PROPERTY.gstin}
            </div>
            <div className="muted">
              State: {PROPERTY.stateName}, Code: {PROPERTY.stateCode}
            </div>
            <div className="muted">
              PAN: {PROPERTY.pan} · CIN: {PROPERTY.cin}
            </div>
            <div className="muted">
              {PROPERTY.phone} · {PROPERTY.email}
            </div>
          </div>
          <div className="tax-box">
            <div>
              <span className="muted">Invoice No.</span>
              <br />
              <strong>{bill.bill_no}</strong>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="muted">Dated</span>
              <br />
              <strong>{bill.bill_date}</strong>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="muted">Villa</span>
              <br />
              <strong>{bill.villa}</strong>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className={`badge badge-${bill.status}`}>{bill.status}</span>
              {bill.payment_mode ? (
                <span className="muted"> · {String(bill.payment_mode).toUpperCase()}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="tax-grid" style={{ borderTop: "none" }}>
          <div className="tax-box" style={{ gridColumn: "1 / -1" }}>
            <span className="muted">Buyer (Bill to)</span>
            {/* B2B: the registered company is the buyer and its GSTIN must be on
                the face of the invoice, or the customer cannot claim input
                credit. The guest's own name still appears, below. */}
            <strong className="block">
              {bill.buyer_company || bill.guest_name}
            </strong>
            {bill.buyer_address ? <div>{bill.buyer_address}</div> : null}
            {bill.buyer_gstin ? (
              <div>
                <strong>GSTIN/UIN : {bill.buyer_gstin}</strong>
              </div>
            ) : null}
            {bill.buyer_company && bill.guest_name ? (
              <div className="muted">Guest: {bill.guest_name}</div>
            ) : null}
            {bill.guest_phone ? <div>{bill.guest_phone}</div> : null}
            <div className="muted">
              State:{" "}
              {bill.buyer_state_name
                ? `${bill.buyer_state_name}, Code: ${bill.buyer_state_code}`
                : `${PROPERTY.stateName}, Code: ${PROPERTY.stateCode}`}{" "}
              {/* Place of supply is always where the property is — immovable
                  property and restaurant service are both supplied here — so an
                  out-of-state buyer is still CGST + SGST, never IGST. */}
              · Place of Supply: {PROPERTY.stateName}
            </div>
          </div>
        </div>

        <table className="tax-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>SI</th>
              <th>Particulars</th>
              <th>HSN/SAC</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id || i}>
                <td>{i + 1}</td>
                <td>{l.description}</td>
                <td>{l.hsn_sac || PROPERTY.defaultHsn}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{formatInrExact(l.rate_inr)}</td>
                <td className="num">
                  {formatInrExact(Number(l.qty) * Number(l.rate_inr))}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} style={{ textAlign: "right" }}>
                OUTPUT CGST @ 2.5%
              </td>
              <td className="num">{formatInrExact(cgst)}</td>
            </tr>
            <tr>
              <td colSpan={5} style={{ textAlign: "right" }}>
                OUTPUT SGST @ 2.5%
              </td>
              <td className="num">{formatInrExact(sgst)}</td>
            </tr>
            <tr>
              <td colSpan={5} style={{ textAlign: "right" }} className="grand">
                Total
              </td>
              <td className="num grand">{formatInrExact(grand)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ marginTop: 14, fontSize: ".9rem" }}>
          <span className="muted">Amount Chargeable (in words)</span>
          <br />
          <strong>{amountInWords(grand)}</strong>
        </p>
        <p style={{ fontSize: ".85rem" }}>
          <span className="muted">Tax Amount (in words):</span> {amountInWords(cgst + sgst)}
        </p>

        <table className="tax-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>HSN/SAC</th>
              <th className="num">Taxable Value</th>
              <th className="num">CGST 2.5%</th>
              <th className="num">SGST 2.5%</th>
              <th className="num">Total Tax</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{PROPERTY.defaultHsn}</td>
              <td className="num">{formatInrExact(taxable)}</td>
              <td className="num">{formatInrExact(cgst)}</td>
              <td className="num">{formatInrExact(sgst)}</td>
              <td className="num">{formatInrExact(cgst + sgst)}</td>
            </tr>
          </tbody>
        </table>

        <div className="footer-grid">
          <div>
            <strong>Company&apos;s Bank Details</strong>
            <div>A/c Holder: {PROPERTY.legalName}</div>
            <div>Bank: {PROPERTY.bankName}</div>
            <div>A/c No.: {PROPERTY.bankAccount}</div>
            <div>
              Branch &amp; IFSC: {PROPERTY.bankBranch} &amp; {PROPERTY.bankIfsc}
            </div>
            <p style={{ marginTop: 14 }}>
              <strong>Declaration</strong>
              <br />
              <span className="muted">
                We declare that this invoice shows the actual price of the goods/services
                described and that all particulars are true and correct.
              </span>
            </p>
          </div>
          <div className="sign">
            for {PROPERTY.legalName}
            <div style={{ height: 48 }} />
            <strong>Authorised Signatory</strong>
          </div>
        </div>

        <div className="center-note">
          SUBJECT TO HARYANA JURISDICTION
          <br />
          This is a Computer Generated Invoice · E. &amp; O.E.
        </div>
      </div>

      {/* The handwritten slip this invoice was read from. `no-print` on purpose:
          it is our internal evidence, not part of the guest's tax invoice. */}
      {bill.source_photo_url ? (
        <div className="actions no-print" style={{ display: "block" }}>
          <strong style={{ display: "block", marginBottom: 8 }}>
            📎 Original slip this bill was read from
          </strong>
          <a href={bill.source_photo_url} target="_blank" rel="noreferrer">
            <img
              src={bill.source_photo_url}
              alt="Handwritten slip this invoice was read from"
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 8,
                border: "1.5px solid #D8DCD5",
                display: "block",
              }}
            />
          </a>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            Tap to open full size · not printed on the guest invoice
          </span>
        </div>
      ) : null}

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-btn')?.addEventListener('click',()=>window.print());`,
        }}
      />
    </div>
  );
}
