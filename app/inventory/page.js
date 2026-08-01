"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import { formatInr, formatInrExact } from "@/lib/config";

const INV_CATEGORIES = [
  { id: "linen", label: "Linen / beds / pillows" },
  { id: "crockery", label: "Crockery / plates" },
  { id: "glassware", label: "Glassware" },
  { id: "furniture", label: "Furniture" },
  { id: "appliance", label: "Appliances" },
  { id: "other", label: "Other" },
];

/** Live calc: base + GST ₹ + total from qty, unit cost, gst % */
function previewCosts(qty, unitCost, gstPct) {
  const q = Number(qty) || 0;
  const u = Number(unitCost) || 0;
  const g = Number(gstPct) || 0;
  const base = Math.round(q * u * 100) / 100;
  const gstAmt = Math.round(base * (g / 100) * 100) / 100;
  const total = Math.round((base + gstAmt) * 100) / 100;
  return { base, gstAmt, total };
}

function emptyForm() {
  return {
    name: "",
    category: "other",
    qty: "1",
    unit_cost_inr: "",
    gst_pct: "18",
    vendor: "",
    notes: "",
  };
}

export default function InventoryPage() {
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm());
  /** id of row being edited, or null */
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);

  async function load(loc = locationId) {
    const q = loc ? `?location_id=${loc}` : "";
    const res = await fetch(`/api/inventory${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Load failed");
    setLocations(data.locations || []);
    setItems(data.items || []);
  }

  useEffect(() => {
    load("").catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const total = items.reduce((s, i) => s + Number(i.total_cost_inr || 0), 0);
    return { count: items.length, total };
  }, [items]);

  const addPreview = useMemo(
    () => previewCosts(form.qty, form.unit_cost_inr, form.gst_pct),
    [form.qty, form.unit_cost_inr, form.gst_pct]
  );

  const editPreview = useMemo(() => {
    if (!edit) return null;
    return previewCosts(edit.qty, edit.unit_cost_inr, edit.gst_pct);
  }, [edit]);

  async function filterLoc(id) {
    setLocationId(id);
    setEditId(null);
    setEdit(null);
    setBusy(true);
    try {
      await load(id);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(it) {
    setEditId(it.id);
    setEdit({
      id: it.id,
      location_id: it.location_id || "",
      name: it.name || "",
      category: it.category || "other",
      qty: String(it.qty ?? ""),
      unit_cost_inr: String(it.unit_cost_inr ?? ""),
      gst_pct: String(it.gst_pct ?? "0"),
      vendor: it.vendor || "",
      notes: it.notes || "",
      unit: it.unit || "pcs",
      active: it.active !== false,
    });
    setMsg("");
  }

  function cancelEdit() {
    setEditId(null);
    setEdit(null);
  }

  async function saveEdit() {
    if (!edit?.name?.trim()) {
      setMsg("Item name required");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edit.id,
          location_id: edit.location_id || null,
          name: edit.name.trim(),
          category: edit.category,
          qty: Number(edit.qty) || 0,
          unit_cost_inr: Number(edit.unit_cost_inr) || 0,
          gst_pct: Number(edit.gst_pct) || 0,
          vendor: edit.vendor || null,
          notes: edit.notes || null,
          unit: edit.unit || "pcs",
          active: edit.active !== false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMsg("Updated.");
      cancelEdit();
      await load(locationId);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addItem(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMsg("Name required");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId || null,
          name: form.name.trim(),
          category: form.category,
          qty: Number(form.qty) || 0,
          unit_cost_inr: Number(form.unit_cost_inr) || 0,
          gst_pct: Number(form.gst_pct) || 0,
          vendor: form.vendor || null,
          notes: form.notes || null,
          purchase_date: new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setForm(emptyForm());
      setMsg("Saved.");
      await load(locationId);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <BrandHeader
        title="Inventory"
        subtitle="Editable: name · qty · unit cost · GST · total"
        right={
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        }
      />
      <main className="page" style={{ paddingBottom: 40 }}>
        {msg ? (
          <p className="muted" style={{ marginBottom: 10 }}>
            {msg}
          </p>
        ) : null}

        <div className="stat-grid">
          <div className="stat">
            <div className="label">Items shown</div>
            <div className="value" style={{ fontSize: "1.2rem" }}>
              {totals.count}
            </div>
          </div>
          <div className="stat">
            <div className="label">Value (shown)</div>
            <div className="value" style={{ fontSize: "1.2rem" }}>
              {formatInr(totals.total)}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Professional PDF reports</strong>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "6px 0 10px" }}>
            Branded with logo · item · qty · unit cost · GST · total
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  window.open(
                    locationId
                      ? `/api/reports/ops?type=inventory&location_id=${encodeURIComponent(locationId)}&format=pdf`
                      : "/api/reports/ops?type=inventory&format=pdf",
                    "_blank"
                  )
                }
              >
                {locationId
                  ? `PDF: ${locations.find((l) => l.id === locationId)?.name || "Area"}`
                  : "PDF: All areas"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  window.open(
                    locationId
                      ? `/api/reports/ops?type=inventory&location_id=${encodeURIComponent(locationId)}&format=xlsx`
                      : "/api/reports/ops?type=inventory&format=xlsx",
                    "_blank"
                  )
                }
              >
                Excel
              </button>
            </div>
            <Link href="/reports" className="btn btn-ghost">
              All reports (every section)
            </Link>
          </div>
        </div>

        <div className="card">
          <strong>Area</strong>
          <div className="chip-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`chip ${!locationId ? "active" : ""}`}
              onClick={() => filterLoc("")}
            >
              All
            </button>
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                className={`chip ${locationId === loc.id ? "active" : ""}`}
                onClick={() => filterLoc(loc.id)}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>

        <form className="card" style={{ marginTop: 12 }} onSubmit={addItem}>
          <strong>Add item</strong>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Item name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Dinner plates, Pillow, Bedsheet"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Qty</label>
              <input
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label>Unit cost ₹</label>
              <input
                value={form.unit_cost_inr}
                onChange={(e) =>
                  setForm({ ...form, unit_cost_inr: e.target.value })
                }
                inputMode="decimal"
                placeholder="0"
              />
            </div>
            <div className="field">
              <label>GST %</label>
              <input
                value={form.gst_pct}
                onChange={(e) => setForm({ ...form, gst_pct: e.target.value })}
                inputMode="decimal"
              />
            </div>
          </div>
          <div
            className="muted"
            style={{
              fontSize: "0.9rem",
              marginBottom: 10,
              padding: "8px 10px",
              background: "var(--green-soft, #e8f5ee)",
              borderRadius: 8,
            }}
          >
            GST amount: <strong>{formatInrExact(addPreview.gstAmt)}</strong>
            {" · "}
            Total (incl. GST):{" "}
            <strong>{formatInrExact(addPreview.total)}</strong>
          </div>
          <div className="field">
            <label>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {INV_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Vendor (optional)</label>
            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            Location for new item:{" "}
            <strong>
              {locationId
                ? locations.find((l) => l.id === locationId)?.name || "selected"
                : "pick an area chip first"}
            </strong>
          </p>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save to inventory"}
          </button>
        </form>

        <div className="card" style={{ marginTop: 12 }}>
          <strong>Stock list</strong>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "6px 0 0" }}>
            Tap <strong>Edit</strong> to change name, qty, unit cost, GST % — total
            and GST ₹ update automatically.
          </p>
          {items.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              No items yet.
            </p>
          ) : (
            items.map((it) => {
              const isEditing = editId === it.id && edit;
              if (isEditing) {
                return (
                  <div
                    key={it.id}
                    style={{
                      borderBottom: "1px solid var(--line)",
                      padding: "14px 0",
                    }}
                  >
                    <div className="field">
                      <label>Item name *</label>
                      <input
                        value={edit.name}
                        onChange={(e) =>
                          setEdit({ ...edit, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Location</label>
                      <select
                        value={edit.location_id}
                        onChange={(e) =>
                          setEdit({ ...edit, location_id: e.target.value })
                        }
                      >
                        <option value="">—</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Qty</label>
                        <input
                          value={edit.qty}
                          onChange={(e) =>
                            setEdit({ ...edit, qty: e.target.value })
                          }
                          inputMode="decimal"
                        />
                      </div>
                      <div className="field">
                        <label>Unit cost ₹</label>
                        <input
                          value={edit.unit_cost_inr}
                          onChange={(e) =>
                            setEdit({ ...edit, unit_cost_inr: e.target.value })
                          }
                          inputMode="decimal"
                        />
                      </div>
                      <div className="field">
                        <label>GST %</label>
                        <input
                          value={edit.gst_pct}
                          onChange={(e) =>
                            setEdit({ ...edit, gst_pct: e.target.value })
                          }
                          inputMode="decimal"
                        />
                      </div>
                    </div>
                    {editPreview ? (
                      <div
                        style={{
                          fontSize: "0.95rem",
                          marginBottom: 12,
                          padding: "10px 12px",
                          background: "var(--green-soft, #e8f5ee)",
                          borderRadius: 8,
                          border: "1px solid var(--green, #1a5c3a)",
                        }}
                      >
                        <div>
                          Base: {formatInrExact(editPreview.base)}
                        </div>
                        <div>
                          GST amount:{" "}
                          <strong>
                            {formatInrExact(editPreview.gstAmt)}
                          </strong>
                        </div>
                        <div>
                          Total price:{" "}
                          <strong>
                            {formatInrExact(editPreview.total)}
                          </strong>
                        </div>
                      </div>
                    ) : null}
                    <div className="field">
                      <label>Category</label>
                      <select
                        value={edit.category}
                        onChange={(e) =>
                          setEdit({ ...edit, category: e.target.value })
                        }
                      >
                        {INV_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Vendor</label>
                      <input
                        value={edit.vendor}
                        onChange={(e) =>
                          setEdit({ ...edit, vendor: e.target.value })
                        }
                      />
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={busy}
                        onClick={saveEdit}
                      >
                        Save changes
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={it.id}
                  style={{
                    borderBottom: "1px solid var(--line)",
                    padding: "12px 0",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{it.name}</div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {it.inv_locations?.name || "—"}
                    </div>
                    <div style={{ fontSize: "0.88rem", marginTop: 4 }}>
                      Qty <strong>{it.qty}</strong>
                      {" · "}
                      Unit <strong>{formatInrExact(it.unit_cost_inr)}</strong>
                      {" · "}
                      GST <strong>{it.gst_pct}%</strong> (
                      {formatInrExact(it.gst_amount_inr)})
                      {" · "}
                      Total{" "}
                      <strong style={{ color: "var(--green, #1a5c3a)" }}>
                        {formatInrExact(it.total_cost_inr)}
                      </strong>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    style={{ minHeight: 36, flexShrink: 0 }}
                    onClick={() => startEdit(it)}
                  >
                    Edit
                  </button>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
