"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import {
  formatInrExact,
  EXPENSE_CATEGORIES,
  CATEGORY_LABELS,
} from "@/lib/config";

export default function ExpensesPage() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    category: "other",
    amount_inr: "",
    gst_amount_inr: "",
    vendor: "",
    vendor_gstin: "",
    vendor_invoice_no: "",
    location_id: "",
  });

  function toggleLines(id) {
    setOpenId((cur) => (cur === id ? null : id));
  }

  /** Remove an expense entirely — its items go with it (FK cascade). */
  async function removeExpense(r) {
    const label = `${r.title} · ${formatInrExact(r.total_inr)} · ${r.expense_date}`;
    if (
      !window.confirm(
        `Delete this expense?\n\n${label}\n\nIt disappears from this list. The owner can still see and restore it under Admin → Deleted records.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/expenses/${r.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      if (openId === r.id) setOpenId(null);
      setMsg("Expense deleted.");
      await load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    const [eRes, iRes] = await Promise.all([
      fetch("/api/expenses"),
      fetch("/api/inventory"),
    ]);
    const eData = await eRes.json();
    const iData = await iRes.json();
    setRows(eData.expenses || []);
    setLocations(iData.locations || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const amount = Number(form.amount_inr) || 0;
      const gst = Number(form.gst_amount_inr) || 0;
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
        vendor_gstin: form.vendor_gstin,
        vendor_invoice_no: form.vendor_invoice_no,
          amount_inr: amount,
          gst_amount_inr: gst,
          total_inr: amount + gst,
          vendor: form.vendor || null,
          location_id: form.location_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setForm({
        title: "",
        category: "other",
        vendor_gstin: "",
        vendor_invoice_no: "",
        amount_inr: "",
        gst_amount_inr: "",
        vendor: "",
        location_id: "",
      });
      setMsg("Expense saved.");
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sum = rows.reduce((s, r) => s + Number(r.total_inr || 0), 0);

  return (
    <div className="app-shell">
      <BrandHeader
        title="📦 Purchase / expense"
        subtitle="Money going OUT · not a guest bill"
        right={
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        }
      />
      <main className="page">
        {msg ? <p className="muted">{msg}</p> : null}
        <div className="stat">
          <div className="label">Listed total</div>
          <div className="value" style={{ fontSize: "1.25rem" }}>
            {formatInrExact(sum)}
          </div>
        </div>

        <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
          <strong>Log expense</strong>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Gas cylinder, Linen purchase"
              required
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Amount ₹ (ex-GST)</label>
              <input
                value={form.amount_inr}
                onChange={(e) => setForm({ ...form, amount_inr: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label>GST ₹</label>
              <input
                value={form.gst_amount_inr}
                onChange={(e) =>
                  setForm({ ...form, gst_amount_inr: e.target.value })
                }
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="field">
            <label>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Area (optional)</label>
            <select
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            >
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Vendor</label>
            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>
          {/* Both optional. Most local suppliers have no GSTIN at all — but
              without one, the GST on that purchase can never be claimed back,
              so it is worth 5 seconds when the paper does show it. */}
          <div className="row">
            <div className="field">
              <label>Vendor GSTIN (optional)</label>
              <input
                value={form.vendor_gstin}
                onChange={(e) =>
                  setForm({ ...form, vendor_gstin: e.target.value.toUpperCase() })
                }
                placeholder="06AAPFV9671F1ZJ"
                autoCapitalize="characters"
              />
            </div>
            <div className="field">
              <label>Supplier bill no. (optional)</label>
              <input
                value={form.vendor_invoice_no}
                onChange={(e) =>
                  setForm({ ...form, vendor_invoice_no: e.target.value })
                }
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Save expense
          </button>
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
            Tip: Telegram /purchase then photo of supplier invoice → confirm.
          </p>
        </form>

        <div className="card" style={{ marginTop: 12 }}>
          <strong>Recent</strong>
          {rows.length === 0 ? (
            <p className="muted" style={{ marginTop: 10 }}>
              No expenses yet.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                style={{
                  borderBottom: "1px solid var(--line)",
                  padding: "10px 0",
                }}
              >
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  {r.expense_date} · {CATEGORY_LABELS[r.category] || r.category} ·{" "}
                  {formatInrExact(r.total_inr)}
                  {r.vendor ? ` · ${r.vendor}` : ""}
                  {r.inv_locations?.name ? ` · ${r.inv_locations.name}` : ""}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleLines(r.id)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 6,
                      border: "1.5px solid #1F4B43",
                      background: openId === r.id ? "#1F4B43" : "#fff",
                      color: openId === r.id ? "#fff" : "#1F4B43",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {openId === r.id ? "✕ Close" : "✎ Edit items"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExpense(r)}
                    disabled={busy}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 6,
                      border: "1.5px solid #C2562A",
                      background: "#fff",
                      color: "#C2562A",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    🗑 Delete
                  </button>
                </div>

                {/* The photographed paper, shown — not hidden behind a text
                    link. This entry is a transcription of it, so it must be
                    visible next to the numbers to be checkable at a glance. */}
                {r.invoice_pdf_url ? (
                  <a
                    href={r.invoice_pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open the full photo"
                    style={{
                      display: "block",
                      marginTop: 10,
                      textDecoration: "none",
                    }}
                  >
                    <img
                      src={r.invoice_pdf_url}
                      alt="Photo of the paper this entry was read from"
                      style={{
                        width: "100%",
                        maxWidth: 320,
                        maxHeight: 220,
                        objectFit: "cover",
                        objectPosition: "top",
                        borderRadius: 8,
                        border: "1.5px solid #D8DCD5",
                        display: "block",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: "#5A6B5F",
                        display: "block",
                        marginTop: 4,
                      }}
                    >
                      📎 Paper on file — tap to open full size
                    </span>
                  </a>
                ) : (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: "0.78rem",
                      color: "#C2562A",
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ No photo on file for this entry
                  </div>
                )}

                {openId === r.id ? (
                  <ExpenseLines
                    expenseId={r.id}
                    invoiceTotal={Number(r.total_inr) || 0}
                    onSaved={load}
                  />
                ) : null}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Itemised lines for one expense — the breakdown behind a lump sum.
 * Editable because the numbers arrive via OCR and OCR misreads quantities.
 */
function ExpenseLines({ expenseId, invoiceTotal, onSaved }) {
  const [lines, setLines] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/expenses/${expenseId}/lines`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const got = d.lines || [];
        // Nothing to edit is useless — hand over one blank row ready to type into.
        setLines(
          got.length
            ? got
            : [{ description: "", qty: 1, unit_cost_inr: 0, gst_pct: 18 }]
        );
      })
      .catch((e) => alive && setNote(e.message));
    return () => {
      alive = false;
    };
  }, [expenseId]);

  function edit(i, field, value) {
    setLines((cur) => {
      const next = [...cur];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function addRow() {
    setLines((cur) => [
      ...(cur || []),
      { description: "", qty: 1, unit_cost_inr: 0, gst_pct: 18 },
    ]);
  }

  function removeRow(i) {
    setLines((cur) => cur.filter((_, idx) => idx !== i));
  }

  const subtotal = (lines || []).reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost_inr) || 0),
    0
  );
  const gst = (lines || []).reduce(
    (s, l) =>
      s +
      ((Number(l.qty) || 0) *
        (Number(l.unit_cost_inr) || 0) *
        (Number(l.gst_pct) || 0)) /
        100,
    0
  );
  const total = Math.round((subtotal + gst) * 100) / 100;
  const off = Math.round((total - invoiceTotal) * 100) / 100;
  // A row typed but not yet filled in isn't "an item" — don't compare against zero.
  const hasAnyItem = (lines || []).some(
    (l) => String(l.description || "").trim() || Number(l.unit_cost_inr) > 0
  );

  async function save() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/expenses/${expenseId}/lines`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setLines(data.lines || []);
      setNote("Saved. Expense total updated from the items.");
      if (onSaved) await onSaved();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (lines === null) {
    return (
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
        Loading items…
      </p>
    );
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: "var(--mist, #E7EFEC)",
        borderRadius: 8,
      }}
    >
      {!hasAnyItem ? (
        <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 8px" }}>
          No items recorded — this was saved as a lump sum before itemising
          existed. Type the breakdown below, then Save items.
        </p>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "0.85rem", minWidth: 420 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>Item</th>
              <th style={{ padding: "4px 6px", width: 60 }}>Qty</th>
              <th style={{ padding: "4px 6px", width: 90 }}>Rate</th>
              <th style={{ padding: "4px 6px", width: 60 }}>GST%</th>
              <th style={{ padding: "4px 6px", width: 90 }}>Amount</th>
              <th style={{ width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id || `new-${i}`}>
                <td style={{ padding: "3px 6px" }}>
                  <input
                    value={l.description || ""}
                    onChange={(e) => edit(i, "description", e.target.value)}
                    placeholder="Item name"
                    style={inputStyle}
                  />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input
                    type="number"
                    step="any"
                    value={l.qty ?? ""}
                    onChange={(e) => edit(i, "qty", e.target.value)}
                    style={inputStyle}
                  />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input
                    type="number"
                    step="any"
                    value={l.unit_cost_inr ?? ""}
                    onChange={(e) => edit(i, "unit_cost_inr", e.target.value)}
                    style={inputStyle}
                  />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input
                    type="number"
                    step="any"
                    value={l.gst_pct ?? ""}
                    onChange={(e) => edit(i, "gst_pct", e.target.value)}
                    style={inputStyle}
                  />
                </td>
                <td style={{ padding: "3px 6px", textAlign: "right" }}>
                  {formatInrExact(
                    (Number(l.qty) || 0) * (Number(l.unit_cost_inr) || 0)
                  )}
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title="Remove item"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#C2562A",
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
        Items: {formatInrExact(subtotal)} + GST {formatInrExact(gst)} ={" "}
        <strong>{formatInrExact(total)}</strong>
        <br />
        {!hasAnyItem ? (
          <span className="muted">
            Recorded total is {formatInrExact(invoiceTotal)}. Fill the rows above
            to match it.
          </span>
        ) : Math.abs(off) > 1 ? (
          <span style={{ color: "#C2562A", fontWeight: 600 }}>
            ⚠ {formatInrExact(Math.abs(off))} {off > 0 ? "more" : "less"} than the
            recorded total of {formatInrExact(invoiceTotal)} — check qty/rate.
          </span>
        ) : (
          <span className="muted">Matches the recorded total.</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={addRow} className="btn-secondary">
          + Add item
        </button>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save items"}
        </button>
      </div>
      {note ? (
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "4px 6px",
  border: "1px solid var(--line, #ccc)",
  borderRadius: 4,
  fontSize: "0.85rem",
  background: "#fff",
};
