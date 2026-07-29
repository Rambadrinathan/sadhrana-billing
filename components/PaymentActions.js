"use client";

import { useMemo, useState } from "react";
import { PROPERTY, formatInrExact } from "@/lib/config";
import { amountDue, buildUpiUri, upiQrImageUrl } from "@/lib/upi";

/**
 * Partial pay + full mark paid + UPI QR
 */
export default function PaymentActions({ bill, busy, onPaid }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("upi");
  const [localBusy, setLocalBusy] = useState(false);
  const due = amountDue(bill);
  const paid = Number(bill.amount_paid || 0);

  const upiUri = useMemo(() => {
    if (bill.status === "paid" || due <= 0) return null;
    return buildUpiUri({
      amount: due,
      billNo: bill.bill_no,
      note: `${PROPERTY.tradeName} ${bill.bill_no}`,
    });
  }, [bill, due]);

  const qrUrl = upiUri ? upiQrImageUrl(upiUri) : null;

  async function recordPayment(full) {
    const payAmt = full ? due : Number(amount);
    if (!payAmt || payAmt <= 0) {
      alert("Enter a payment amount");
      return;
    }
    setLocalBusy(true);
    try {
      await onPaid({
        payment_amount: payAmt,
        payment_mode: mode,
      });
      setAmount("");
    } finally {
      setLocalBusy(false);
    }
  }

  if (bill.status === "void") return null;

  if (bill.status === "paid" || due <= 0) {
    return (
      <div className="card" style={{ background: "var(--green-soft)" }}>
        <strong>Fully paid</strong>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
          {formatInrExact(bill.grand_total)}
          {bill.payment_mode
            ? ` · ${String(bill.payment_mode).toUpperCase()}`
            : ""}
          {paid > 0 && paid !== Number(bill.grand_total)
            ? ` · recorded ${formatInrExact(paid)}`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="card no-print">
      <strong>Collect payment</strong>
      <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 12px" }}>
        Billed {formatInrExact(bill.grand_total)}
        {paid > 0 ? ` · Already paid ${formatInrExact(paid)}` : ""}
        {" · "}
        <strong>Due {formatInrExact(due)}</strong>
      </p>

      {qrUrl ? (
        <div className="upi-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="UPI QR code" width={180} height={180} />
          <p style={{ margin: "8px 0 4px", fontWeight: 700 }}>Scan to pay (UPI)</p>
          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            {PROPERTY.upi} · {formatInrExact(due)}
          </p>
          <a
            className="btn btn-secondary"
            href={upiUri}
            style={{ marginTop: 10, minHeight: 40 }}
          >
            Open UPI app
          </a>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Set <code>NEXT_PUBLIC_UPI_ID</code> (e.g. business@okaxis) to show QR on
          invoices.
          {PROPERTY.bankAccount ? (
            <>
              <br />
              Bank: {PROPERTY.bankName} · A/c {PROPERTY.bankAccount} · IFSC{" "}
              {PROPERTY.bankIfsc}
            </>
          ) : null}
        </p>
      )}

      <div className="field" style={{ marginTop: 14 }}>
        <label>Partial / advance amount (₹)</label>
        <input
          type="number"
          min="1"
          step="1"
          placeholder={String(due)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        {["upi", "cash", "card"].map((m) => (
          <button
            key={m}
            type="button"
            className={`chip ${mode === m ? "active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="row">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy || localBusy}
          onClick={() => recordPayment(false)}
        >
          Record partial
        </button>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy || localBusy}
          onClick={() => recordPayment(true)}
        >
          Mark fully paid
        </button>
      </div>
    </div>
  );
}
