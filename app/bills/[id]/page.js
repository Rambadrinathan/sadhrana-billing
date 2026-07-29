"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PROPERTY, formatInrExact, formatInr } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";
import VersionHistory from "@/components/VersionHistory";
import PaymentActions from "@/components/PaymentActions";
import { amountDue, buildUpiUri } from "@/lib/upi";

export default function BillDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");

  async function load() {
    setError("");
    if (typeof window !== "undefined" && String(id).startsWith("demo-")) {
      const raw = sessionStorage.getItem("demo_bill_" + id);
      if (raw) {
        const b = JSON.parse(raw);
        setBill(b);
        setEmailTo(b.guest_email || "");
        return;
      }
    }

    try {
      const res = await fetch(`/api/bills/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bill not found");
        return;
      }
      setBill(data.bill);
      setEmailTo(data.bill?.guest_email || "");
    } catch (e) {
      setError(e.message || "Failed to load");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function applyPayment({ payment_amount, payment_mode }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_amount, payment_mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not record payment");
        return;
      }
      const next = data.bill?.demo
        ? {
            ...bill,
            amount_paid:
              Number(bill.amount_paid || 0) + Number(payment_amount || 0),
            status:
              Number(bill.amount_paid || 0) + Number(payment_amount || 0) >=
              Number(bill.grand_total)
                ? "paid"
                : "partial",
            payment_mode,
          }
        : data.bill;
      setBill(next);
      if (String(id).startsWith("demo-")) {
        sessionStorage.setItem("demo_bill_" + id, JSON.stringify(next));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function markVoid() {
    if (!confirm("Void this bill?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "void" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not void");
        setBusy(false);
        return;
      }
      setBill(data.bill?.demo ? { ...bill, status: "void" } : data.bill);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function printBill() {
    window.print();
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const invoiceLink = bill ? `${origin}/invoice/${bill.id}` : "";
  const pdfLink = bill ? `${origin}/api/bills/${bill.id}/pdf` : "";
  const due = bill ? amountDue(bill) : 0;

  const waText = useMemo(() => {
    if (!bill) return "";
    const upi = buildUpiUri({
      amount: due > 0 ? due : undefined,
      billNo: bill.bill_no,
    });
    return [
      `*${PROPERTY.name}*`,
      `Invoice ${bill.bill_no}`,
      `${bill.guest_name} · ${bill.villa}`,
      "",
      ...(bill.bill_lines || []).map(
        (l) =>
          `• ${l.description} × ${l.qty} = ${formatInr(l.line_total || l.qty * l.rate_inr)}`
      ),
      "",
      `*Total: ${formatInr(bill.grand_total)}*`,
      bill.status === "paid"
        ? `Paid via ${String(bill.payment_mode || "").toUpperCase()}`
        : due < Number(bill.grand_total) && Number(bill.amount_paid) > 0
          ? `Paid ${formatInr(bill.amount_paid)} · Due ${formatInr(due)}`
          : "Payment pending",
      pdfLink ? `PDF: ${pdfLink}` : "",
      invoiceLink ? `View: ${invoiceLink}` : "",
      upi ? `Pay UPI: ${PROPERTY.upi || ""}` : PROPERTY.upi ? `UPI: ${PROPERTY.upi}` : "",
      PROPERTY.phone ? `Call: ${PROPERTY.phone}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [bill, due, pdfLink, invoiceLink]);

  async function shareWhatsApp() {
    const text = encodeURIComponent(waText);
    const phone = (bill.guest_phone || "").replace(/\D/g, "");
    const waUrl = phone
      ? `https://wa.me/91${phone.slice(-10)}?text=${text}`
      : `https://wa.me/?text=${text}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${PROPERTY.name} ${bill.bill_no}`,
          text: waText,
          url: pdfLink || invoiceLink,
        });
        return;
      } catch {
        /* cancelled */
      }
    }
    window.open(waUrl, "_blank");
  }

  async function sendEmail() {
    setEmailMsg("");
    setBusy(true);
    try {
      const res = await fetch(`/api/bills/${id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailMsg(data.error || "Email failed");
        return;
      }
      if (data.mode === "mailto" && data.mailto) {
        window.location.href = data.mailto;
        setEmailMsg("Opening your email app…");
      } else {
        setEmailMsg("Invoice emailed successfully.");
      }
    } catch (e) {
      setEmailMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !bill) {
    return (
      <div className="app-shell">
        <main className="page">
          <div className="error">{error}</div>
          <Link href="/" className="btn btn-secondary">
            Back home
          </Link>
        </main>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="app-shell">
        <main className="page">
          <p className="muted">Loading bill…</p>
        </main>
      </div>
    );
  }

  const lines = bill.bill_lines || [];

  return (
    <div className="app-shell">
      <BrandHeader
        title={bill.bill_no}
        subtitle={`${bill.guest_name}${bill.version > 1 ? ` · v${bill.version}` : ""}${
          bill.created_by ? ` · by ${bill.created_by}` : ""
        }`}
        right={
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        }
      />

      <main className="page">
        {error ? <div className="error no-print">{error}</div> : null}

        <div className="invoice" id="invoice">
          <div className="invoice-header">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                width={48}
                height={48}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  objectFit: "contain",
                  border: "1px solid #ddd",
                }}
              />
              <div>
                <div className="invoice-brand">{PROPERTY.name}</div>
                <div style={{ fontSize: "0.85rem", color: "#555", marginTop: 4 }}>
                  {PROPERTY.address}
                  <br />
                  {PROPERTY.phone}
                  {PROPERTY.email ? ` · ${PROPERTY.email}` : ""}
                  {PROPERTY.gstin ? (
                    <>
                      <br />
                      GSTIN: {PROPERTY.gstin}
                    </>
                  ) : null}
                </div>
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              fontSize: "0.95rem",
            }}
          >
            <div>
              <div
                className="muted"
                style={{ fontSize: "0.75rem", textTransform: "uppercase" }}
              >
                Guest
              </div>
              <strong>{bill.guest_name}</strong>
              {bill.guest_phone ? <div>{bill.guest_phone}</div> : null}
              {bill.guest_email ? <div>{bill.guest_email}</div> : null}
            </div>
            <div>
              <div
                className="muted"
                style={{ fontSize: "0.75rem", textTransform: "uppercase" }}
              >
                Villa
              </div>
              <strong>{bill.villa}</strong>
              {bill.created_by ? (
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  Staff: {bill.created_by}
                </div>
              ) : null}
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
                <th className="num">HSN</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id || l.description + l.sort_order}>
                  <td>
                    {l.description}
                    {l.gst_pct ? (
                      <div style={{ fontSize: "0.75rem", color: "#888" }}>
                        GST {l.gst_pct}%
                      </div>
                    ) : null}
                  </td>
                  <td className="num" style={{ fontSize: "0.8rem" }}>
                    {l.hsn_sac || PROPERTY.defaultHsn}
                  </td>
                  <td className="num">{l.qty}</td>
                  <td className="num">{formatInrExact(l.rate_inr)}</td>
                  <td className="num">{formatInrExact(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals" style={{ borderTop: "none", marginTop: 0 }}>
            <div className="line">
              <span>Subtotal</span>
              <span>{formatInrExact(bill.subtotal)}</span>
            </div>
            <div className="line">
              <span>Tax (GST)</span>
              <span>{formatInrExact(bill.tax_total)}</span>
            </div>
            <div className="grand">
              <span>Total</span>
              <span>{formatInrExact(bill.grand_total)}</span>
            </div>
            {Number(bill.amount_paid) > 0 ? (
              <>
                <div className="line">
                  <span>Paid</span>
                  <span>{formatInrExact(bill.amount_paid)}</span>
                </div>
                <div className="line">
                  <span>Balance due</span>
                  <span>{formatInrExact(amountDue(bill))}</span>
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
            {PROPERTY.upi ? <div>UPI: {PROPERTY.upi}</div> : null}
            <div style={{ marginTop: 8 }}>Thank you for staying at {PROPERTY.name}.</div>
            <div>This is a computer-generated bill for on-site extras.</div>
          </div>
        </div>

        <div className="no-print" style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <button className="btn btn-primary" type="button" onClick={printBill}>
            Print / Save PDF
          </button>
          <button className="btn btn-secondary" type="button" onClick={shareWhatsApp}>
            Share on WhatsApp (PDF link)
          </button>
          <a className="btn btn-secondary" href={`/api/bills/${bill.id}/pdf`}>
            Download PDF
          </a>

          <PaymentActions bill={bill} busy={busy} onPaid={applyPayment} />

          <div className="card">
            <strong>Email invoice</strong>
            <input
              className="search-input"
              style={{ marginTop: 10 }}
              type="email"
              placeholder="guest@email.com"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy || !emailTo}
              onClick={sendEmail}
            >
              Send invoice email
            </button>
            {emailMsg ? (
              <p className="muted" style={{ marginTop: 8, fontSize: "0.85rem" }}>
                {emailMsg}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 8, fontSize: "0.8rem" }}>
                Uses Resend if configured; otherwise opens your mail app.
              </p>
            )}
          </div>

          {bill.status !== "void" ? (
            <button className="btn btn-danger" type="button" disabled={busy} onClick={markVoid}>
              Void bill
            </button>
          ) : null}

          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => router.push("/bills/new")}
          >
            + Another bill
          </button>
        </div>

        <VersionHistory
          billId={bill.id}
          currentVersion={bill.version}
          currentTotal={bill.grand_total}
        />
      </main>
    </div>
  );
}
