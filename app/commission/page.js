"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { COMMISSION_GST_PCT, formatInrExact } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Client-side mirror of splitInclusiveGst — preview only; server re-computes. */
function splitPreview(totalInr, gstPct) {
  const total = Math.round((Number(totalInr) || 0) * 100) / 100;
  const pct = Number(gstPct) > 0 ? Number(gstPct) : 0;
  if (total <= 0) return { total: 0, taxable: 0, gst: 0, cgst: 0, sgst: 0 };
  if (pct <= 0) return { total, taxable: total, gst: 0, cgst: 0, sgst: 0 };
  const taxable = Math.round((total / (1 + pct / 100)) * 100) / 100;
  const gst = Math.round((total - taxable) * 100) / 100;
  const cgst = Math.round((gst / 2) * 100) / 100;
  const sgst = Math.round((gst - cgst) * 100) / 100;
  return { total, taxable, gst, cgst, sgst };
}

export default function CommissionPage() {
  const [payee, setPayee] = useState("");
  const [city, setCity] = useState("");
  const [amount, setAmount] = useState("");
  const [gstPct, setGstPct] = useState(String(COMMISSION_GST_PCT));
  const [note, setNote] = useState("Commission");
  const [date, setDate] = useState(todayIst());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  const preview = useMemo(
    () => splitPreview(amount, gstPct),
    [amount, gstPct]
  );

  async function submit() {
    setError("");
    if (!payee.trim()) return setError("Enter who we paid (payee name)");
    if (!(Number(amount) > 0)) {
      return setError("Enter the amount paid, inclusive of GST");
    }
    setSaving(true);
    try {
      const res = await fetch("/api/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payee: payee.trim(),
          city: city.trim() || null,
          amount_inclusive: Number(amount),
          gst_pct: Number(gstPct) || COMMISSION_GST_PCT,
          note: note.trim() || "Commission",
          expense_date: date,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save commission");
        setSaving(false);
        return;
      }
      setDone(data);
      setSaving(false);
    } catch (e) {
      setError(e.message || "Failed");
      setSaving(false);
    }
  }

  if (done?.expense) {
    return (
      <div className="app-shell">
        <BrandHeader
          title="💸 Commission saved"
          subtitle="Money out · settlement PDF ready"
          right={
            <Link href="/commission" className="btn btn-ghost">
              New
            </Link>
          }
        />
        <main className="page">
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>
              {done.expense.title}
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {done.expense.expense_date} · paid{" "}
              <strong>{formatInrExact(done.split.total)}</strong> (incl. GST)
            </p>
            <div className="totals" style={{ marginTop: 12 }}>
              <div className="line">
                <span>Taxable</span>
                <span>{formatInrExact(done.split.taxable)}</span>
              </div>
              <div className="line">
                <span>GST {done.split.gstPct}%</span>
                <span>{formatInrExact(done.split.gst)}</span>
              </div>
              <div className="grand">
                <span>Paid</span>
                <span>{formatInrExact(done.split.total)}</span>
              </div>
            </div>
            <a
              className="btn btn-primary"
              href={done.pdf_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                marginTop: 16,
                minHeight: 48,
                lineHeight: "48px",
              }}
            >
              Download settlement PDF
            </a>
            <Link
              href="/expenses"
              className="btn btn-ghost"
              style={{ display: "block", textAlign: "center", marginTop: 10 }}
            >
              Open expenses list
            </Link>
            <Link
              href="/"
              className="btn btn-ghost"
              style={{ display: "block", textAlign: "center", marginTop: 6 }}
            >
              Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <BrandHeader
        title="💸 Commission"
        subtitle="Pay an agent · GST inclusive · money OUT"
        right={
          <Link href="/" className="btn btn-ghost">
            Cancel
          </Link>
        }
      />
      <main className="page" style={{ paddingBottom: 120 }}>
        {error ? <div className="error">{error}</div> : null}

        <div
          className="card"
          style={{
            background: "#FDF3EC",
            border: "1px solid #E8C4A8",
            marginBottom: 12,
            fontSize: "0.88rem",
          }}
        >
          This records a <strong>commission we paid</strong> (expense). It is{" "}
          <strong>not</strong> a guest Room/F&amp;B tax invoice. You get a
          settlement PDF for the file.
        </div>

        <div className="card">
          <div className="field">
            <label>Paid to (payee) *</label>
            <input
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="e.g. Mr. Rohit"
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label>City / place</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. New Delhi"
            />
          </div>
          <div className="field">
            <label>Amount paid (₹, inclusive of GST) *</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="9000"
            />
          </div>
          <div className="field">
            <label>GST %</label>
            <input
              value={gstPct}
              onChange={(e) => setGstPct(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="field">
            <label>Particulars</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Commission"
            />
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {preview.total > 0 ? (
            <div className="totals" style={{ marginTop: 8 }}>
              <div className="line">
                <span>Taxable</span>
                <span>{formatInrExact(preview.taxable)}</span>
              </div>
              <div className="line">
                <span>
                  GST {gstPct}% (CGST {formatInrExact(preview.cgst)} + SGST{" "}
                  {formatInrExact(preview.sgst)})
                </span>
                <span>{formatInrExact(preview.gst)}</span>
              </div>
              <div className="grand">
                <span>Paid (incl. GST)</span>
                <span>{formatInrExact(preview.total)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <div className="fab-bar no-print">
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={saving}
        >
          {saving
            ? "Saving…"
            : preview.total > 0
              ? `Save commission · ${formatInrExact(preview.total)}`
              : "Save commission + PDF"}
        </button>
      </div>
    </div>
  );
}
