"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VILLAS, CATEGORY_LABELS, formatInr } from "@/lib/config";

export default function NewBillPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState([]);
  const [category, setCategory] = useState("all");
  const [villa, setVilla] = useState(VILLAS[0]);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [qtyMap, setQtyMap] = useState({});
  const [customDesc, setCustomDesc] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setCatalog(d.items || []))
      .catch(() => setCatalog([]));
  }, []);

  const filtered = useMemo(() => {
    if (category === "all") return catalog;
    return catalog.filter((c) => c.category === category);
  }, [catalog, category]);

  function setQty(id, next) {
    setQtyMap((prev) => {
      const n = Math.max(0, next);
      const copy = { ...prev };
      if (n === 0) delete copy[id];
      else copy[id] = n;
      return copy;
    });
  }

  const selectedLines = useMemo(() => {
    const lines = [];
    for (const item of catalog) {
      const qty = qtyMap[item.id];
      if (!qty) continue;
      lines.push({
        catalog_item_id: String(item.id).startsWith("d") ? null : item.id,
        description: item.name,
        category: item.category,
        qty,
        rate_inr: Number(item.rate_inr),
        gst_pct: Number(item.gst_pct || 0),
      });
    }
    if (customDesc.trim() && Number(customRate) >= 0 && Number(customQty) > 0) {
      lines.push({
        catalog_item_id: null,
        description: customDesc.trim(),
        category: "other",
        qty: Number(customQty),
        rate_inr: Number(customRate),
        gst_pct: 0,
      });
    }
    return lines;
  }, [catalog, qtyMap, customDesc, customRate, customQty]);

  const preview = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of selectedLines) {
      const base = l.qty * l.rate_inr;
      subtotal += base;
      tax += (base * (l.gst_pct || 0)) / 100;
    }
    return {
      subtotal,
      tax,
      total: subtotal + tax,
      count: selectedLines.length,
    };
  }, [selectedLines]);

  async function createBill() {
    setError("");
    if (!guestName.trim()) {
      setError("Enter guest name");
      return;
    }
    if (selectedLines.length === 0) {
      setError("Add at least one item (tap + on menu)");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villa,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim() || null,
          notes: notes.trim() || null,
          lines: selectedLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create bill");
        setSaving(false);
        return;
      }

      // Demo bills: stash in sessionStorage so bill page can show them
      if (data.demo || data.bill?.demo) {
        sessionStorage.setItem("demo_bill_" + data.bill.id, JSON.stringify(data.bill));
      }

      router.push(`/bills/${data.bill.id}`);
    } catch (e) {
      setError(e.message || "Failed");
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div>
          <h1>New checkout bill</h1>
          <p className="sub">F&amp;B · massage · bonfire</p>
        </div>
        <Link href="/" className="btn btn-ghost">
          Cancel
        </Link>
      </header>

      <main className="page" style={{ paddingBottom: 140 }}>
        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <div className="field">
            <label>Villa</label>
            <select value={villa} onChange={(e) => setVilla(e.target.value)}>
              {VILLAS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Guest name</label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="As on booking"
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label>Guest phone (optional)</label>
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="For WhatsApp"
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Poolside dinner, 4 pax"
            />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <strong>Add items</strong>
          <div className="chip-row" style={{ marginTop: 12 }}>
            {[
              ["all", "All"],
              ["fnb", "F&B"],
              ["experience", "Experiences"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip ${category === key ? "active" : ""}`}
                onClick={() => setCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.map((item) => {
            const q = qtyMap[item.id] || 0;
            return (
              <div key={item.id} className="item-row">
                <div>
                  <div className="item-name">{item.name}</div>
                  <div className="item-rate">
                    {formatInr(item.rate_inr)}
                    {item.gst_pct ? ` · GST ${item.gst_pct}%` : ""}
                    {item.category ? ` · ${CATEGORY_LABELS[item.category] || item.category}` : ""}
                  </div>
                </div>
                <div className="qty">
                  <button type="button" onClick={() => setQty(item.id, q - 1)} aria-label="Decrease">
                    −
                  </button>
                  <span>{q}</span>
                  <button type="button" onClick={() => setQty(item.id, q + 1)} aria-label="Increase">
                    +
                  </button>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
            <strong style={{ fontSize: "0.95rem" }}>Custom line</strong>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Description</label>
              <input
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="Anything not on menu"
              />
            </div>
            <div className="row">
              <div className="field">
                <label>Rate ₹</label>
                <input
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div className="field">
                <label>Qty</label>
                <input
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>

          <div className="totals">
            <div className="line">
              <span>Items</span>
              <span>{preview.count}</span>
            </div>
            <div className="line">
              <span>Subtotal</span>
              <span>{formatInr(preview.subtotal)}</span>
            </div>
            <div className="line">
              <span>Tax</span>
              <span>{formatInr(preview.tax)}</span>
            </div>
            <div className="grand">
              <span>Total</span>
              <span>{formatInr(preview.total)}</span>
            </div>
          </div>
        </div>
      </main>

      <div className="fab-bar no-print">
        <button className="btn btn-primary" type="button" onClick={createBill} disabled={saving}>
          {saving ? "Creating…" : `Create bill · ${formatInr(preview.total)}`}
        </button>
      </div>
    </div>
  );
}
