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
  const [justCreated, setJustCreated] = useState(false);
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [editLines, setEditLines] = useState(null); // null = not editing
  const [lineMsg, setLineMsg] = useState("");

  function startLineEdit() {
    setLineMsg("");
    setEditLines(
      (bill?.bill_lines || []).map((l) => ({
        catalog_item_id: l.catalog_item_id || null,
        description: l.description || "",
        qty: l.qty ?? 1,
        rate_inr: l.rate_inr ?? 0,
        gst_pct: l.gst_pct ?? 0,
      }))
    );
  }

  function changeLine(i, field, value) {
    setEditLines((cur) => {
      const next = [...cur];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function dropLine(i) {
    setEditLines((cur) => cur.filter((_, idx) => idx !== i));
  }

  function addLine() {
    setEditLines((cur) => [
      ...(cur || []),
      { catalog_item_id: null, description: "", qty: 1, rate_inr: 0, gst_pct: 5 },
    ]);
  }

  /**
   * Saving creates a NEW version and regenerates the PDF; the old version stays
   * in history. Rates are re-enforced from the live menu server-side.
   */
  async function saveLines() {
    const clean = (editLines || []).filter(
      (l) => String(l.description || "").trim() && Number(l.qty) > 0
    );
    if (!clean.length) {
      setLineMsg("A bill needs at least one item.");
      return;
    }
    setBusy(true);
    setLineMsg("");
    try {
      const res = await fetch(`/api/bills/${bill.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: clean,
          change_note: "Line items corrected on web",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setEditLines(null);
      setLineMsg(`Saved as revision v${data.version}. PDF regenerated.`);
      await load();
    } catch (e) {
      setLineMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    setJustCreated(q.get("created") === "1");
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

  /**
   * Soft delete. The invoice leaves the working list but the row is retained
   * so the owner can audit or restore it — a GST document must not vanish.
   */
  async function deleteBill() {
    const label = `${bill.bill_no} · ${bill.guest_name} · ${formatInr(bill.grand_total)}`;
    const reason = window.prompt(
      `Delete this invoice?\n\n${label}\n\nIt leaves this list. The owner can still see and restore it under Admin → Deleted records.\n\nReason (optional):`,
      ""
    );
    if (reason === null) return; // cancelled
    setBusy(true);
    setLineMsg("");
    try {
      const res = await fetch(`/api/bills/${bill.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      router.push("/");
    } catch (e) {
      setLineMsg(e.message);
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
      // ONE link only. The guest needs the invoice, not a menu of ways to reach it.
      pdfLink ? `Invoice PDF: ${pdfLink}` : invoiceLink ? `Invoice: ${invoiceLink}` : "",
      PROPERTY.upi ? `UPI: ${PROPERTY.upi}` : "",
      PROPERTY.phone ? `Call: ${PROPERTY.phone}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [bill, due, pdfLink, invoiceLink]);

  /**
   * Share the invoice as ONE attached PDF.
   *
   * Order of preference:
   *  1. Attach the actual PDF file (phones) — guest gets a document, no links.
   *  2. Text with a single link (desktop, where file share is unavailable).
   *
   * Never pass `url` alongside `text`: WhatsApp appends it, which is what used
   * to produce a duplicate copy of the link in the message.
   */
  async function shareWhatsApp() {
    const phone = (bill.guest_phone || "").replace(/\D/g, "");
    const caption =
      `*${PROPERTY.name}*\n` +
      `Invoice ${bill.bill_no}${bill.version > 1 ? ` (Rev. ${bill.version})` : ""}\n` +
      `${bill.guest_name} · ${bill.villa}\n` +
      `*Total: ${formatInr(bill.grand_total)}*` +
      (bill.status === "paid"
        ? `\nPaid via ${String(bill.payment_mode || "").toUpperCase()}`
        : "");

    // 1. Attach the PDF itself
    if (pdfLink && typeof navigator !== "undefined" && navigator.canShare) {
      try {
        setBusy(true);
        const res = await fetch(pdfLink);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File(
            [blob],
            `${String(bill.bill_no).replace(/\//g, "-")}.pdf`,
            { type: "application/pdf" }
          );
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `${PROPERTY.name} ${bill.bill_no}`,
              text: caption,
            });
            return;
          }
        }
      } catch {
        /* cancelled, or file share unsupported — fall through to link */
      } finally {
        setBusy(false);
      }
    }

    // 2. Fall back to a message with exactly one link
    const text = encodeURIComponent(waText);
    window.open(
      phone
        ? `https://wa.me/91${phone.slice(-10)}?text=${text}`
        : `https://wa.me/?text=${text}`,
      "_blank"
    );
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

          {editLines === null ? (
            <>
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
              {bill.status !== "void" ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={startLineEdit}
                    style={{
                      flex: "1 1 46%",
                      padding: "11px 14px",
                      borderRadius: 8,
                      border: "2px solid #1F4B43",
                      background: "#1F4B43",
                      color: "#fff",
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✎ Edit items
                  </button>
                  <button
                    type="button"
                    onClick={deleteBill}
                    disabled={busy}
                    style={{
                      flex: "1 1 46%",
                      padding: "11px 14px",
                      borderRadius: 8,
                      border: "2px solid #C2562A",
                      background: "#fff",
                      color: "#C2562A",
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    🗑 Delete invoice
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div
              style={{
                background: "#FBF8F2",
                border: "1px solid #E7EFEC",
                borderRadius: 8,
                padding: 10,
              }}
            >
              <strong style={{ fontSize: "0.9rem" }}>Correcting line items</strong>
              <p
                style={{ fontSize: "0.8rem", color: "#666", margin: "4px 0 10px" }}
              >
                Saving creates a new revision — the current version is kept in
                history. Menu rates are re-applied automatically.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num" style={{ width: 60 }}>
                        Qty
                      </th>
                      <th className="num" style={{ width: 90 }}>
                        Rate
                      </th>
                      <th className="num" style={{ width: 80 }}>
                        Amount
                      </th>
                      <th style={{ width: 30 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {editLines.map((l, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            value={l.description}
                            onChange={(e) =>
                              changeLine(i, "description", e.target.value)
                            }
                            placeholder="Item name"
                            style={{ width: "100%" }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={l.qty}
                            onChange={(e) => changeLine(i, "qty", e.target.value)}
                            style={{ width: "100%" }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={l.rate_inr}
                            onChange={(e) =>
                              changeLine(i, "rate_inr", e.target.value)
                            }
                            style={{ width: "100%" }}
                          />
                        </td>
                        <td className="num">
                          {formatInrExact(
                            (Number(l.qty) || 0) * (Number(l.rate_inr) || 0)
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => dropLine(i)}
                            title="Remove"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#C2562A",
                              cursor: "pointer",
                              fontSize: "1rem",
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: "0.85rem", marginTop: 8 }}>
                New subtotal:{" "}
                <strong>
                  {formatInrExact(
                    editLines.reduce(
                      (s, l) =>
                        s + (Number(l.qty) || 0) * (Number(l.rate_inr) || 0),
                      0
                    )
                  )}
                </strong>{" "}
                <span style={{ color: "#888" }}>
                  (was {formatInrExact(bill.subtotal)})
                </span>
              </div>
              <div
                style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}
              >
                <button type="button" className="btn btn-ghost" onClick={addLine}>
                  + Add item
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveLines}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save as new revision"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditLines(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {lineMsg ? (
            <p style={{ fontSize: "0.85rem", color: "#1F4B43", marginTop: 8 }}>
              {lineMsg}
            </p>
          ) : null}

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
          {justCreated ? (
            <div
              className="card"
              style={{
                background: "var(--green-soft, #e8f5ee)",
                border: "1px solid var(--green, #1a5c3a)",
                marginBottom: 4,
              }}
            >
              <strong style={{ color: "var(--green, #1a5c3a)" }}>
                Invoice created
              </strong>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
                Open the PDF, then share it on WhatsApp with the guest.
              </p>
            </div>
          ) : null}
          <a
            className="btn btn-primary"
            href={`/api/bills/${bill.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open / download tax invoice PDF
          </a>
          <button className="btn btn-secondary" type="button" onClick={shareWhatsApp}>
            Share on WhatsApp
          </button>
          <button className="btn btn-ghost" type="button" onClick={printBill}>
            Print this page
          </button>

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
