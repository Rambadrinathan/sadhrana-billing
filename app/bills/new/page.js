"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VILLAS, CATEGORY_LABELS, formatInr, PROPERTY } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";

export default function NewBillPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState([]);
  const [category, setCategory] = useState("all");
  const [villa, setVilla] = useState(VILLAS[0]);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [advance, setAdvance] = useState("");
  const [staffList, setStaffList] = useState([]);
  const [staffName, setStaffName] = useState("");
  const [qtyMap, setQtyMap] = useState({});
  const [customDesc, setCustomDesc] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem("sb_staff_name") || "";
    } catch {
      /* ignore */
    }
    fetch("/api/login")
      .then((r) => r.json())
      .then((d) => {
        if (d.name) saved = d.name || saved;
      })
      .catch(() => {})
      .finally(() => {
        fetch("/api/staff")
          .then((r) => r.json())
          .then((d) => {
            const list = d.staff || [];
            setStaffList(list);
            if (saved && list.some((s) => s.name === saved)) {
              setStaffName(saved);
            } else if (list.length === 1) {
              setStaffName(list[0].name);
            } else if (saved) {
              setStaffName(saved);
            }
          })
          .catch(() => setStaffList([]));
      });
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
        hsn_sac: item.hsn_sac || PROPERTY.defaultHsn,
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
        hsn_sac: PROPERTY.defaultHsn,
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
    if (!staffName.trim()) {
      setError("Select which staff is creating this bill");
      return;
    }
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
      try {
        localStorage.setItem("sb_staff_name", staffName.trim());
      } catch {
        /* ignore */
      }
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villa,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim() || null,
          guest_email: guestEmail.trim() || null,
          notes: notes.trim() || null,
          lines: selectedLines,
          created_by: staffName.trim(),
          amount_paid: Number(advance) > 0 ? Number(advance) : 0,
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
      <BrandHeader
        title="New checkout bill"
        subtitle={staffName ? `Staff: ${staffName}` : "F&B · massage · bonfire"}
        right={
          <Link href="/" className="btn btn-ghost">
            Cancel
          </Link>
        }
      />

      <main className="page" style={{ paddingBottom: 140 }}>
        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <div className="field">
            <label>Staff creating this bill *</label>
            <select
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              required
            >
              <option value="">Select staff…</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                  {s.phone ? ` · ${s.phone}` : ""}
                </option>
              ))}
            </select>
            {staffList.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                Owner must add staff under Admin → Staff first.
              </p>
            ) : null}
          </div>
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
            <label>Guest phone (WhatsApp)</label>
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>Guest email (optional)</label>
            <input
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="for email invoice"
              type="email"
            />
          </div>
          <div className="field">
            <label>Advance / amount paid now (₹)</label>
            <input
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
              placeholder="0"
              inputMode="decimal"
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
