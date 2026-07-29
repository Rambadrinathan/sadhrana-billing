"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PROPERTY, formatInrExact, formatInr } from "@/lib/config";

export default function BillDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    // Demo path
    if (typeof window !== "undefined" && String(id).startsWith("demo-")) {
      const raw = sessionStorage.getItem("demo_bill_" + id);
      if (raw) {
        setBill(JSON.parse(raw));
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
    } catch (e) {
      setError(e.message || "Failed to load");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function markPaid(mode) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid", payment_mode: mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not mark paid");
        setBusy(false);
        return;
      }
      const next = data.bill?.demo
        ? { ...bill, status: "paid", payment_mode: mode, paid_at: new Date().toISOString() }
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

  async function shareWhatsApp() {
    const lines = (bill.bill_lines || bill.lines || [])
      .map((l) => `• ${l.description} × ${l.qty} = ${formatInr(l.line_total || l.qty * l.rate_inr)}`)
      .join("%0A");
    const text = encodeURIComponent(
      [
        `*${PROPERTY.name}*`,
        `Bill ${bill.bill_no}`,
        `${bill.guest_name} · ${bill.villa}`,
        "",
        ...(bill.bill_lines || []).map(
          (l) => `• ${l.description} × ${l.qty} = ${formatInr(l.line_total || l.qty * l.rate_inr)}`
        ),
        "",
        `*Total: ${formatInr(bill.grand_total)}*`,
        bill.status === "paid" ? `Paid via ${String(bill.payment_mode || "").toUpperCase()}` : "Payment pending",
        PROPERTY.upi ? `UPI: ${PROPERTY.upi}` : "",
        PROPERTY.phone ? `Call: ${PROPERTY.phone}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );

    const phone = (bill.guest_phone || "").replace(/\D/g, "");
    const waUrl = phone
      ? `https://wa.me/91${phone.slice(-10)}?text=${text}`
      : `https://wa.me/?text=${text}`;

    // Prefer native share with print-PDF instruction; WhatsApp text always works
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${PROPERTY.name} ${bill.bill_no}`,
          text: decodeURIComponent(text),
        });
        return;
      } catch {
        /* user cancelled or unsupported */
      }
    }
    window.open(waUrl, "_blank");
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
      <header className="topbar no-print">
        <div>
          <h1>{bill.bill_no}</h1>
          <p className="sub">{bill.guest_name}</p>
        </div>
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
      </header>

      <main className="page">
        {error ? <div className="error no-print">{error}</div> : null}

        <div className="invoice" id="invoice">
          <div className="invoice-header">
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "0.95rem" }}>
            <div>
              <div className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                Guest
              </div>
              <strong>{bill.guest_name}</strong>
              {bill.guest_phone ? <div>{bill.guest_phone}</div> : null}
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
                <tr key={l.id || l.description + l.sort_order}>
                  <td>
                    {l.description}
                    {l.gst_pct ? (
                      <div style={{ fontSize: "0.75rem", color: "#888" }}>GST {l.gst_pct}%</div>
                    ) : null}
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
              <span>Tax</span>
              <span>{formatInrExact(bill.tax_total)}</span>
            </div>
            <div className="grand">
              <span>Total</span>
              <span>{formatInrExact(bill.grand_total)}</span>
            </div>
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
            Share on WhatsApp
          </button>

          {bill.status === "unpaid" ? (
            <>
              <div className="muted" style={{ textAlign: "center", fontSize: "0.85rem", marginTop: 4 }}>
                Mark paid after guest settles
              </div>
              <div className="row">
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => markPaid("upi")}>
                  UPI
                </button>
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => markPaid("cash")}>
                  Cash
                </button>
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => markPaid("card")}>
                  Card
                </button>
              </div>
            </>
          ) : null}

          {bill.status !== "void" ? (
            <button className="btn btn-danger" type="button" disabled={busy} onClick={markVoid}>
              Void bill
            </button>
          ) : null}

          <button className="btn btn-ghost" type="button" onClick={() => router.push("/bills/new")}>
            + Another bill
          </button>
        </div>
      </main>
    </div>
  );
}
