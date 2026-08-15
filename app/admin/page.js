"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatInr, PROPERTY, CATEGORY_LABELS } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";
import VersionHistory from "@/components/VersionHistory";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState("invoices"); // invoices | reports | catalog | dayend | staff
  const [bills, setBills] = useState([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  // Rooms and F&B are two different businesses at two different GST rates.
  // "" = both, but the totals below always break them out separately.
  const [kindFilter, setKindFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [catBusy, setCatBusy] = useState(false);
  const [catMsg, setCatMsg] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [staffRoster, setStaffRoster] = useState([]);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffMsg, setStaffMsg] = useState("");
  const [newStaff, setNewStaff] = useState({
    name: "",
    phone: "",
    daily_rate_inr: "",
    pay_type: "daily",
  });
  const [editStaff, setEditStaff] = useState(null);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "fnb",
    rate_inr: "",
    gst_pct: "5",
    hsn_sac: PROPERTY.defaultHsn,
  });

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "200" });
      if (status) params.set("status", status);
      if (search.trim()) params.set("q", search.trim());
      if (staffFilter) params.set("created_by", staffFilter);
      try {
        const res = await fetch(`/api/bills?${params}`);
        const data = await res.json();
        if (!cancelled) setBills(data.bills || []);
      } catch {
        if (!cancelled) setBills([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [status, search, staffFilter]);

  useEffect(() => {
    // Active staff for filter chips + full roster when on Staff tab
    fetch(tab === "staff" ? "/api/staff?all=1" : "/api/staff")
      .then((r) => r.json())
      .then((d) => setStaffRoster(d.staff || []))
      .catch(() => setStaffRoster([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== "catalog") return;
    fetch("/api/catalog?all=1")
      .then((r) => r.json())
      .then((d) => setCatalog(d.items || []))
      .catch(() => setCatalog([]));
  }, [tab]);

  const filtered = useMemo(() => {
    let list = bills;
    if (from) list = list.filter((b) => String(b.bill_date) >= from);
    if (to) list = list.filter((b) => String(b.bill_date) <= to);
    if (kindFilter) {
      // Rows written before the split default to restaurant.
      list = list.filter((b) => (b.invoice_kind || "restaurant") === kindFilter);
    }
    return list;
  }, [bills, from, to, kindFilter]);

  /**
   * Rooms vs F&B, always separate.
   * Mixing a 5% supply and an 18% supply into one revenue number is exactly the
   * "all confused and jumbled up" problem — and it is also what the GST return
   * splits on, so the two must never be added together in the UI.
   */
  const byKind = useMemo(() => {
    const base = { taxable: 0, tax: 0, total: 0, count: 0 };
    const out = {
      accommodation: { ...base, label: "Rooms", gstPct: 18, sac: "997212" },
      restaurant: { ...base, label: "F&B", gstPct: 5, sac: "996331" },
    };
    let dateList = bills;
    if (from) dateList = dateList.filter((b) => String(b.bill_date) >= from);
    if (to) dateList = dateList.filter((b) => String(b.bill_date) <= to);
    for (const b of dateList) {
      if (b.status === "void") continue;
      const k = (b.invoice_kind || "restaurant") === "accommodation"
        ? "accommodation"
        : "restaurant";
      out[k].taxable += Number(b.subtotal) || 0;
      out[k].tax += Number(b.tax_total) || 0;
      out[k].total += Number(b.grand_total) || 0;
      out[k].count += 1;
    }
    return out;
  }, [bills, from, to]);

  const stats = useMemo(() => {
    const active = filtered.filter((b) => b.status !== "void");
    const paid = active.filter((b) => b.status === "paid");
    const unpaid = active.filter(
      (b) => b.status === "unpaid" || b.status === "partial"
    );
    const collected = active.reduce((s, b) => {
      if (b.status === "paid") return s + Number(b.grand_total || 0);
      return s + Number(b.amount_paid || 0);
    }, 0);
    const pending = unpaid.reduce((s, b) => {
      return (
        s +
        Math.max(0, Number(b.grand_total || 0) - Number(b.amount_paid || 0))
      );
    }, 0);
    const gstTotal = active.reduce((s, b) => s + Number(b.tax_total || 0), 0);
    const taxable = active.reduce((s, b) => s + Number(b.subtotal || 0), 0);
    const edited = active.filter((b) => Number(b.version) > 1).length;
    return {
      count: active.length,
      paid: paid.length,
      unpaid: unpaid.length,
      collected,
      pending,
      gstTotal,
      taxable,
      edited,
    };
  }, [filtered]);

  const dayEnd = useMemo(() => {
    const today = todayIst();
    const day = bills.filter(
      (b) => String(b.bill_date) === today && b.status !== "void"
    );
    const byMode = { upi: 0, cash: 0, card: 0, other: 0 };
    let collected = 0;
    let pending = 0;
    let gst = 0;
    let billed = 0;
    for (const b of day) {
      billed += Number(b.grand_total || 0);
      gst += Number(b.tax_total || 0);
      const paidAmt =
        b.status === "paid"
          ? Number(b.grand_total || 0)
          : Number(b.amount_paid || 0);
      collected += paidAmt;
      pending += Math.max(0, Number(b.grand_total || 0) - paidAmt);
      const mode = String(b.payment_mode || "other").toLowerCase();
      if (paidAmt > 0) {
        if (byMode[mode] != null) byMode[mode] += paidAmt;
        else byMode.other += paidAmt;
      }
    }
    return {
      today,
      count: day.length,
      billed,
      collected,
      pending,
      gst,
      byMode,
      bills: day,
    };
  }, [bills]);

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  function exportExcel() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);
    window.location.href = `/api/reports/export?${params.toString()}`;
  }

  async function saveCatalogItem(item) {
    setCatBusy(true);
    setCatMsg("");
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setCatMsg("Saved.");
      setEditItem(null);
      const list = await fetch("/api/catalog?all=1").then((r) => r.json());
      setCatalog(list.items || []);
      setNewItem({
        name: "",
        category: "fnb",
        rate_inr: "",
        gst_pct: "5",
        hsn_sac: PROPERTY.defaultHsn,
      });
    } catch (e) {
      setCatMsg(e.message);
    } finally {
      setCatBusy(false);
    }
  }

  async function deactivateItem(id) {
    if (!confirm("Deactivate this menu item?")) return;
    setCatBusy(true);
    try {
      const res = await fetch(`/api/catalog?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setCatalog((c) => c.map((x) => (x.id === id ? { ...x, active: false } : x)));
    } catch (e) {
      setCatMsg(e.message);
    } finally {
      setCatBusy(false);
    }
  }

  async function saveStaff(item) {
    setStaffBusy(true);
    setStaffMsg("");
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStaffMsg("Staff saved.");
      setEditStaff(null);
      setNewStaff({ name: "", phone: "" });
      const list = await fetch("/api/staff?all=1").then((r) => r.json());
      setStaffRoster(list.staff || []);
    } catch (e) {
      setStaffMsg(e.message);
    } finally {
      setStaffBusy(false);
    }
  }

  async function deactivateStaffMember(id) {
    if (!confirm("Remove this staff from the active list?")) return;
    setStaffBusy(true);
    try {
      const res = await fetch(`/api/staff?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStaffRoster((s) => s.map((x) => (x.id === id ? { ...x, active: false } : x)));
    } catch (e) {
      setStaffMsg(e.message);
    } finally {
      setStaffBusy(false);
    }
  }

  const activeStaffNames = useMemo(() => {
    const names = new Set(
      (staffRoster || []).filter((s) => s.active !== false).map((s) => s.name)
    );
    // also include names seen on bills (historical)
    for (const b of bills) {
      if (b.created_by) names.add(b.created_by);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [staffRoster, bills]);

  return (
    <div className="app-shell" style={{ maxWidth: 720 }}>
      <BrandHeader
        title="Owner dashboard"
        subtitle="Billing · ops · reports"
        homeHref="/admin"
        right={
          <>
            <Link href="/" className="btn btn-ghost" style={{ minHeight: 36 }}>
              Staff view
            </Link>
            <button className="btn btn-ghost" type="button" onClick={logout}>
              Logout
            </button>
          </>
        }
      />

      <main className="page">
        {/* Primary action */}
        <Link
          href="/bills/new"
          className="card"
          style={{
            display: "block",
            marginBottom: 12,
            background: "var(--green-soft, #e8f5ee)",
            border: "2px solid var(--green, #1a5c3a)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--green, #1a5c3a)" }}>
            + Create tax invoice
          </div>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.88rem" }}>
            Guest · villa · menu · PDF
          </p>
        </Link>

        {/* Ops shortcuts — full-width wrap, not in header */}
        <div className="chip-row" style={{ marginBottom: 12 }}>
          {[
            ["/inventory", "Inventory"],
            ["/expenses", "Expenses"],
            ["/leads", "Leads"],
            ["/guests", "Guests"],
            ["/attendance", "Attendance"],
            ["/month", "📊 Month end"],
            ["/reports", "Reports PDF/Excel"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="chip" style={{ textDecoration: "none" }}>
              {label}
            </Link>
          ))}
        </div>

        {/* Admin tabs */}
        <div className="chip-row">
          {[
            ["invoices", "Invoices"],
            ["purchases", "Purchases"],
            ["reports", "Billing Excel"],
            ["dayend", "Day-end"],
            ["catalog", "Menu"],
            ["staff", "Staff"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="stat">
            <div className="label">Collected</div>
            <div className="value">{formatInr(stats.collected)}</div>
          </div>
          <div className="stat">
            <div className="label">Pending</div>
            <div className="value">{formatInr(stats.pending)}</div>
          </div>
          <div className="stat">
            <div className="label">GST component</div>
            <div className="value" style={{ fontSize: "1.1rem" }}>
              {formatInr(stats.gstTotal)}
            </div>
          </div>
          <div className="stat">
            <div className="label">Final billed</div>
            <div className="value" style={{ fontSize: "1.1rem" }}>
              {formatInr(stats.collected + stats.pending)}
            </div>
          </div>
        </div>

        {tab === "reports" ? (
          <div className="card">
            <strong>Reports &amp; Excel export</strong>
            <p className="muted" style={{ fontSize: "0.9rem", margin: "8px 0 14px" }}>
              Branded workbook: summary, invoices, line items, by customer.
            </p>
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div className="card" style={{ background: "var(--green-soft)", marginBottom: 14 }}>
              <div style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
                <div>
                  Invoices: <strong>{stats.count}</strong> (edited: {stats.edited})
                </div>
                <div>
                  Taxable: <strong>{formatInr(stats.taxable)}</strong>
                </div>
                <div>
                  GST: <strong>{formatInr(stats.gstTotal)}</strong>
                </div>
                <div>
                  Final billed:{" "}
                  <strong>{formatInr(stats.collected + stats.pending)}</strong>
                </div>
              </div>
            </div>
            <button className="btn btn-primary" type="button" onClick={exportExcel}>
              Download Excel report
            </button>
          </div>
        ) : null}

        {tab === "dayend" ? (
          <div className="card">
            <strong>Day-end close · {dayEnd.today}</strong>
            <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 14px" }}>
              Cash till match for today (Asia/Kolkata). Print or copy for night audit.
            </p>
            <div style={{ lineHeight: 1.7, fontSize: "0.95rem" }}>
              <div>
                Invoices today: <strong>{dayEnd.count}</strong>
              </div>
              <div>
                Gross billed: <strong>{formatInr(dayEnd.billed)}</strong>
              </div>
              <div>
                GST component: <strong>{formatInr(dayEnd.gst)}</strong>
              </div>
              <div>
                Collected: <strong>{formatInr(dayEnd.collected)}</strong>
              </div>
              <div>
                Still due: <strong>{formatInr(dayEnd.pending)}</strong>
              </div>
              <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "12px 0" }} />
              <div>
                UPI: <strong>{formatInr(dayEnd.byMode.upi)}</strong>
              </div>
              <div>
                Cash: <strong>{formatInr(dayEnd.byMode.cash)}</strong>
              </div>
              <div>
                Card: <strong>{formatInr(dayEnd.byMode.card)}</strong>
              </div>
              {dayEnd.byMode.other > 0 ? (
                <div>
                  Other: <strong>{formatInr(dayEnd.byMode.other)}</strong>
                </div>
              ) : null}
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              style={{ marginTop: 14 }}
              onClick={() => window.print()}
            >
              Print day-end
            </button>
            <div style={{ marginTop: 16 }}>
              {dayEnd.bills.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: "0.88rem",
                  }}
                >
                  <span>
                    {b.bill_no} · {b.guest_name}
                    {b.created_by ? ` · ${b.created_by}` : ""}
                  </span>
                  <span>
                    {formatInr(b.grand_total)}{" "}
                    <span className={`badge badge-${b.status}`}>{b.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "catalog" ? (
          <div className="card">
            <strong>Menu / price list</strong>
            <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 12px" }}>
              Edit rates, GST %, HSN. Staff bills lock to these rates.
            </p>
            {catMsg ? (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                {catMsg}
              </p>
            ) : null}

            <div className="card" style={{ background: "var(--green-soft)", marginBottom: 14 }}>
              <strong style={{ fontSize: "0.9rem" }}>Add item</strong>
              <div className="field" style={{ marginTop: 8 }}>
                <label>Name</label>
                <input
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
              </div>
              <div className="row">
                <div className="field">
                  <label>Rate ₹</label>
                  <input
                    value={newItem.rate_inr}
                    onChange={(e) => setNewItem({ ...newItem, rate_inr: e.target.value })}
                    inputMode="decimal"
                  />
                </div>
                <div className="field">
                  <label>GST %</label>
                  <input
                    value={newItem.gst_pct}
                    onChange={(e) => setNewItem({ ...newItem, gst_pct: e.target.value })}
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  >
                    <option value="fnb">F&amp;B</option>
                    <option value="experience">Experience</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label>HSN/SAC</label>
                  <input
                    value={newItem.hsn_sac}
                    onChange={(e) => setNewItem({ ...newItem, hsn_sac: e.target.value })}
                  />
                </div>
              </div>
              <button
                className="btn btn-primary"
                type="button"
                disabled={catBusy || !newItem.name}
                onClick={() =>
                  saveCatalogItem({
                    name: newItem.name,
                    category: newItem.category,
                    rate_inr: Number(newItem.rate_inr) || 0,
                    gst_pct: Number(newItem.gst_pct) || 0,
                    hsn_sac: newItem.hsn_sac,
                    sort_order: (catalog.length + 1) * 10,
                    active: true,
                  })
                }
              >
                Add to menu
              </button>
            </div>

            {catalog.map((item) => (
              <div
                key={item.id}
                style={{
                  borderBottom: "1px solid var(--line)",
                  padding: "12px 0",
                  opacity: item.active === false ? 0.5 : 1,
                }}
              >
                {editItem?.id === item.id ? (
                  <div>
                    <input
                      className="search-input"
                      value={editItem.name}
                      onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
                    />
                    <div className="row">
                      <input
                        className="search-input"
                        type="number"
                        value={editItem.rate_inr}
                        onChange={(e) =>
                          setEditItem({ ...editItem, rate_inr: e.target.value })
                        }
                        placeholder="Rate"
                      />
                      <input
                        className="search-input"
                        type="number"
                        value={editItem.gst_pct}
                        onChange={(e) =>
                          setEditItem({ ...editItem, gst_pct: e.target.value })
                        }
                        placeholder="GST%"
                      />
                      <input
                        className="search-input"
                        value={editItem.hsn_sac || ""}
                        onChange={(e) =>
                          setEditItem({ ...editItem, hsn_sac: e.target.value })
                        }
                        placeholder="HSN"
                      />
                    </div>
                    <div className="row">
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={catBusy}
                        onClick={() =>
                          saveCatalogItem({
                            id: editItem.id,
                            name: editItem.name,
                            category: editItem.category,
                            rate_inr: Number(editItem.rate_inr),
                            gst_pct: Number(editItem.gst_pct),
                            hsn_sac: editItem.hsn_sac,
                            sort_order: editItem.sort_order,
                            active: true,
                          })
                        }
                      >
                        Save
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setEditItem(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {item.name}
                        {item.active === false ? " (off)" : ""}
                      </div>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {formatInr(item.rate_inr)} · GST {item.gst_pct}% · HSN{" "}
                        {item.hsn_sac || PROPERTY.defaultHsn} ·{" "}
                        {CATEGORY_LABELS[item.category] || item.category}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        style={{ minHeight: 36 }}
                        onClick={() => setEditItem({ ...item })}
                      >
                        Edit
                      </button>
                      {item.active !== false ? (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ minHeight: 36 }}
                          disabled={catBusy}
                          onClick={() => deactivateItem(item.id)}
                        >
                          Off
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {tab === "staff" ? (
          <div className="card">
            <strong>Staff roster</strong>
            <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 12px" }}>
              Add shift staff (e.g. Ravi, Vijay). Name + phone. Every invoice picks who created it;
              filter invoices by staff on the Invoices tab.
            </p>
            {staffMsg ? (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                {staffMsg}
              </p>
            ) : null}

            <div className="card" style={{ background: "var(--green-soft)", marginBottom: 14 }}>
              <strong style={{ fontSize: "0.9rem" }}>Add staff</strong>
              <div className="field" style={{ marginTop: 8 }}>
                <label>Name *</label>
                <input
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  placeholder="Ravi"
                />
              </div>
              <div className="field">
                <label>Phone / WhatsApp number</label>
                <input
                  value={newStaff.phone}
                  onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                  placeholder="98xxxxxxxx"
                  inputMode="tel"
                />
              </div>
              <div className="field">
                <label>How they are paid</label>
                <select
                  value={newStaff.pay_type}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, pay_type: e.target.value })
                  }
                >
                  <option value="daily">Daily wage</option>
                  <option value="monthly">Monthly salary</option>
                </select>
              </div>
              {newStaff.pay_type === "daily" ? (
              <div className="field">
                <label>Daily wage ₹</label>
                <input
                  value={newStaff.daily_rate_inr}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, daily_rate_inr: e.target.value })
                  }
                  placeholder="e.g. 600"
                  inputMode="decimal"
                />
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  Wage for one full day. A half day pays half.
                </span>
              </div>
              ) : null}
              <button
                className="btn btn-primary"
                type="button"
                disabled={staffBusy || !newStaff.name.trim()}
                onClick={() =>
                  saveStaff({
                    name: newStaff.name.trim(),
                    phone: newStaff.phone.trim() || null,
                    daily_rate_inr: newStaff.daily_rate_inr,
                    pay_type: newStaff.pay_type,
                    sort_order: (staffRoster.length + 1) * 10,
                    active: true,
                  })
                }
              >
                Add staff
              </button>
            </div>

            {staffRoster.length === 0 ? (
              <p className="muted">No staff yet. Add Ravi, Vijay, etc. above.</p>
            ) : (
              staffRoster.map((s) => (
                <div
                  key={s.id}
                  style={{
                    borderBottom: "1px solid var(--line)",
                    padding: "12px 0",
                    opacity: s.active === false ? 0.5 : 1,
                  }}
                >
                  {editStaff?.id === s.id ? (
                    <div>
                      <div className="field">
                        <label>Name</label>
                        <input
                          value={editStaff.name}
                          onChange={(e) =>
                            setEditStaff({ ...editStaff, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Phone</label>
                        <input
                          value={editStaff.phone || ""}
                          onChange={(e) =>
                            setEditStaff({ ...editStaff, phone: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>How they are paid</label>
                        <select
                          value={editStaff.pay_type || "daily"}
                          onChange={(e) =>
                            setEditStaff({ ...editStaff, pay_type: e.target.value })
                          }
                        >
                          <option value="daily">Daily wage</option>
                          <option value="monthly">Monthly salary</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Daily wage ₹</label>
                        <input
                          disabled={editStaff.pay_type === "monthly"}
                          value={editStaff.daily_rate_inr ?? ""}
                          onChange={(e) =>
                            setEditStaff({
                              ...editStaff,
                              daily_rate_inr: e.target.value,
                            })
                          }
                          placeholder="Blank = monthly salary"
                          inputMode="decimal"
                        />
                      </div>
                      <div className="row">
                        <button
                          className="btn btn-primary"
                          type="button"
                          disabled={staffBusy}
                          onClick={() =>
                            saveStaff({
                              id: editStaff.id,
                              name: editStaff.name,
                              phone: editStaff.phone,
                              daily_rate_inr: editStaff.daily_rate_inr,
                              pay_type: editStaff.pay_type,
                              sort_order: editStaff.sort_order,
                              active: true,
                            })
                          }
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => setEditStaff(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {s.name}
                          {s.active === false ? " (inactive)" : ""}
                        </div>
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {s.phone || "No phone"}
                          {s.pay_type === "monthly"
                            ? " · monthly salary"
                            : s.daily_rate_inr
                              ? ` · ${formatInr(s.daily_rate_inr)}/day`
                              : " · daily, no rate set"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ minHeight: 36 }}
                          onClick={() => setEditStaff({ ...s })}
                        >
                          Edit
                        </button>
                        {s.active !== false ? (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            style={{ minHeight: 36 }}
                            disabled={staffBusy}
                            onClick={() => deactivateStaffMember(s.id)}
                          >
                            Off
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : null}

        {/* Live purchases. Admin previously listed purchases ONLY in the deleted
            audit trail, so a correctly-saved purchase appeared nowhere here and
            read as "not saved". */}
        {tab === "purchases" ? <PurchasesPanel /> : null}

        {tab === "invoices" ? (
          <>
            <input
              className="search-input"
              type="search"
              placeholder="Search bill no, guest, or staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="chip-row">
              <button
                type="button"
                className={`chip ${staffFilter === "" ? "active" : ""}`}
                onClick={() => setStaffFilter("")}
              >
                All staff
              </button>
              {activeStaffNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`chip ${staffFilter === name ? "active" : ""}`}
                  onClick={() => setStaffFilter(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            {/* Rooms and F&B kept visibly apart — two supplies, two GST rates,
                and the split the GST return is filed on. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              {[
                ["accommodation", byKind.accommodation],
                ["restaurant", byKind.restaurant],
              ].map(([key, k]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKindFilter(kindFilter === key ? "" : key)}
                  className="card"
                  style={{
                    margin: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    border:
                      kindFilter === key
                        ? "2px solid #1F4B43"
                        : "1px solid #E6E9E3",
                    background: kindFilter === key ? "#F2F7F4" : undefined,
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      color: "#5A6B5F",
                    }}
                  >
                    {k.label} · SAC {k.sac} · {k.gstPct}%
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>
                    {formatInr(k.total)}
                  </div>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    {k.count} invoice(s) · taxable {formatInr(k.taxable)} · GST{" "}
                    {formatInr(k.tax)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.74rem",
                      marginTop: 4,
                      color: "#1F4B43",
                      fontWeight: 600,
                    }}
                  >
                    {kindFilter === key ? "Showing only these ✓" : "Tap to filter"}
                  </div>
                </button>
              ))}
            </div>

            <div className="chip-row">
              {[
                ["", "Rooms + F&B"],
                ["accommodation", "🛏 Rooms only"],
                ["restaurant", "🍽 F&B only"],
              ].map(([key, label]) => (
                <button
                  key={key || "both"}
                  type="button"
                  className={`chip ${kindFilter === key ? "active" : ""}`}
                  onClick={() => setKindFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="chip-row">
              {[
                ["", "All"],
                ["unpaid", "Unpaid"],
                ["partial", "Partial"],
                ["paid", "Paid"],
                ["void", "Void"],
              ].map(([key, label]) => (
                <button
                  key={key || "all"}
                  type="button"
                  className={`chip ${status === key ? "active" : ""}`}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="card">
              {loading ? (
                <p className="muted">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="muted">No invoices yet.</p>
              ) : (
                filtered.map((b) => (
                  <div
                    key={b.id}
                    style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}
                  >
                    <div className="bill-list-top">
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {b.bill_no}
                          {b.version > 1 ? ` · v${b.version}` : ""}
                          {Number(b.version) > 1 ? (
                            <span
                              className="badge"
                              style={{
                                marginLeft: 6,
                                background: "#e8f0fe",
                                color: "#1a56db",
                              }}
                            >
                              edited
                            </span>
                          ) : null}
                        </div>
                        <div className="muted" style={{ fontSize: "0.88rem" }}>
                          {b.bill_date} · {b.guest_name} · {b.villa}
                          {b.gst_applied === false ? " · No GST" : " · GST"}
                          {b.created_by ? (
                            <strong style={{ color: "var(--green-dark)" }}>
                              {" "}
                              · Staff: {b.created_by}
                            </strong>
                          ) : (
                            " · Staff: —"
                          )}
                          {b.payment_mode
                            ? ` · ${String(b.payment_mode).toUpperCase()}`
                            : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800 }}>{formatInr(b.grand_total)}</div>
                        <span className={`badge badge-${b.status}`}>{b.status}</span>
                        {/* Which business this invoice belongs to, on the row
                            itself, so a mixed list is never ambiguous. */}
                        <div
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            marginTop: 4,
                            color:
                              (b.invoice_kind || "restaurant") === "accommodation"
                                ? "#1F4B43"
                                : "#C2562A",
                          }}
                        >
                          {(b.invoice_kind || "restaurant") === "accommodation"
                            ? "🛏 ROOM · 18%"
                            : "🍽 F&B · 5%"}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a
                        className="btn btn-ghost"
                        href={`/invoice/${b.id}`}
                        style={{ minHeight: 36 }}
                      >
                        View
                      </a>
                      <a
                        className="btn btn-ghost"
                        href={`/api/bills/${b.id}/pdf`}
                        style={{ minHeight: 36 }}
                      >
                        PDF
                      </a>
                      {/* The photographed slip this bill was read from. The PDF
                          above is our transcription; this is the evidence. */}
                      {b.source_photo_url ? (
                        <a
                          href={b.source_photo_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Open the original slip"
                          style={{ lineHeight: 0 }}
                        >
                          <img
                            src={b.source_photo_url}
                            alt="Original slip for this bill"
                            style={{
                              height: 36,
                              width: 48,
                              objectFit: "cover",
                              objectPosition: "top",
                              borderRadius: 6,
                              border: "1.5px solid #D8DCD5",
                              display: "block",
                            }}
                          />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ minHeight: 36 }}
                        onClick={() =>
                          setExpandedId(expandedId === b.id ? null : b.id)
                        }
                      >
                        {expandedId === b.id ? "Hide history" : "Version history"}
                      </button>
                    </div>
                    {expandedId === b.id ? (
                      <VersionHistory
                        billId={b.id}
                        currentVersion={b.version}
                        currentTotal={b.grand_total}
                      />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}

        <DeletedRecords />
      </main>
    </div>
  );
}

/**
 * Audit trail. Deleting a bill or purchase only hides it from the working
 * view; the row is kept here so the owner can check what was removed, by
 * whom, and put it back.
 */
/**
 * Live purchases with the photographed paper shown inline.
 *
 * The paper is the source of truth — the row is a transcription of it — so it is
 * rendered as a visible thumbnail, not a text link. An entry with no photo says
 * so in red rather than looking identical to one that has evidence behind it.
 */
function PurchasesPanel() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/expenses")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : d.expenses || []))
      .catch((e) => setErr(e.message || "Could not load purchases"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(r) {
    setErr("");
    setEditId(r.id);
    setForm({
      title: r.title || "",
      expense_date: r.expense_date || "",
      category: r.category || "other",
      vendor: r.vendor || "",
      total_inr: String(r.total_inr ?? ""),
      gst_amount_inr: String(r.gst_amount_inr ?? "0"),
    });
  }

  async function save(id) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          expense_date: form.expense_date,
          category: form.category,
          vendor: form.vendor,
          total_inr: Number(form.total_inr) || 0,
          gst_amount_inr: Number(form.gst_amount_inr) || 0,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save");
      setEditId(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(r) {
    // Soft delete — it lands in Deleted records and can be restored.
    if (
      !window.confirm(
        `Delete "${r.title || "purchase"}" of ${formatInr(r.total_inr)}?\n\nIt moves to Deleted records and can be restored.`
      )
    ) {
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/expenses/${r.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Deleted from owner dashboard" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not delete");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !rows) return <div className="card">{err}</div>;
  if (!rows) return <div className="card">Loading purchases…</div>;
  if (!rows.length) return <div className="card">No purchases recorded yet.</div>;

  const withPhoto = rows.filter((r) => r.invoice_pdf_url).length;

  return (
    <div className="card">
      <div style={{ fontWeight: 800, marginBottom: 4 }}>
        Purchases ({rows.length})
      </div>
      <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 12 }}>
        {withPhoto} of {rows.length} have the paper on file.
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            borderTop: "1px solid #E6E9E3",
            padding: "12px 0",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          {r.invoice_pdf_url ? (
            <a href={r.invoice_pdf_url} target="_blank" rel="noreferrer">
              <img
                src={r.invoice_pdf_url}
                alt="Photo of the purchase paper"
                style={{
                  width: 96,
                  height: 96,
                  objectFit: "cover",
                  objectPosition: "top",
                  borderRadius: 8,
                  border: "1.5px solid #D8DCD5",
                  display: "block",
                }}
              />
            </a>
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 8,
                border: "1.5px dashed #C2562A",
                color: "#C2562A",
                fontSize: "0.7rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 6,
              }}
            >
              No photo
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editId === r.id ? (
              <div style={{ display: "grid", gap: 6 }}>
                <input
                  className="search-input"
                  value={form.title}
                  placeholder="What was bought"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input
                    className="search-input"
                    type="date"
                    style={{ flex: "1 1 130px" }}
                    value={form.expense_date}
                    onChange={(e) =>
                      setForm({ ...form, expense_date: e.target.value })
                    }
                  />
                  <select
                    className="search-input"
                    style={{ flex: "1 1 130px" }}
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                  >
                    {["inventory", "fnb_ops", "utilities", "maintenance", "other"].map(
                      (c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <input
                  className="search-input"
                  value={form.vendor}
                  placeholder="Vendor (optional)"
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <label style={{ flex: "1 1 130px", fontSize: "0.78rem" }}>
                    Total ₹
                    <input
                      className="search-input"
                      type="number"
                      step="0.01"
                      value={form.total_inr}
                      onChange={(e) =>
                        setForm({ ...form, total_inr: e.target.value })
                      }
                    />
                  </label>
                  <label style={{ flex: "1 1 130px", fontSize: "0.78rem" }}>
                    of which GST ₹
                    <input
                      className="search-input"
                      type="number"
                      step="0.01"
                      value={form.gst_amount_inr}
                      onChange={(e) =>
                        setForm({ ...form, gst_amount_inr: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => save(r.id)}
                    style={{ minHeight: 36 }}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditId(null)}
                    style={{ minHeight: 36 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>{r.title || "Purchase"}</div>
                <div className="muted" style={{ fontSize: "0.82rem" }}>
                  {r.expense_date} · {r.category}
                  {r.vendor ? ` · ${r.vendor}` : ""}
                </div>
                <div style={{ fontWeight: 800, marginTop: 4 }}>
                  {formatInr(r.total_inr)}
                  {Number(r.gst_amount_inr) > 0 ? (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {" "}
                      (incl. GST {formatInr(r.gst_amount_inr)})
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 8,
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => startEdit(r)}
                    style={{ minHeight: 34 }}
                  >
                    ✎ Edit
                  </button>
                  <a
                    className="btn btn-ghost"
                    href="/expenses"
                    style={{ minHeight: 34 }}
                  >
                    Edit items
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => remove(r)}
                    style={{ minHeight: 34, color: "#C2562A" }}
                  >
                    🗑 Delete
                  </button>
                  {r.invoice_pdf_url ? (
                    <a
                      href={r.invoice_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "0.8rem" }}
                    >
                      Open full photo
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeletedRecords() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/admin/deleted");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not load");
      setData(d);
    } catch (e) {
      setMsg(e.message);
    }
  }

  useEffect(() => {
    if (open && !data) load();
  }, [open, data]);

  async function restore(kind, id) {
    setMsg("");
    try {
      const res = await fetch("/api/admin/deleted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not restore");
      setMsg("Restored.");
      setData(null);
      await load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  const count = data ? (data.bills?.length || 0) + (data.expenses?.length || 0) : null;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontWeight: 800,
          fontSize: "1rem",
          cursor: "pointer",
          color: "#1F4B43",
        }}
      >
        {open ? "▾" : "▸"} Deleted records{count !== null ? ` (${count})` : ""}
      </button>
      <p className="muted" style={{ fontSize: "0.82rem", margin: "6px 0 0" }}>
        Nothing is ever really destroyed. Staff deletions land here.
      </p>

      {open ? (
        <div style={{ marginTop: 10 }}>
          {msg ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {msg}
            </p>
          ) : null}
          {!data ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading…
            </p>
          ) : (
            <>
              <strong style={{ fontSize: "0.9rem" }}>
                Invoices ({data.bills?.length || 0})
              </strong>
              {(data.bills || []).length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  None.
                </p>
              ) : (
                data.bills.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      borderTop: "1px solid var(--line)",
                      padding: "8px 0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>{b.bill_no}</strong> · {b.guest_name} ·{" "}
                    {formatInr(b.grand_total)}
                    <div className="muted" style={{ fontSize: "0.78rem" }}>
                      deleted {String(b.deleted_at).slice(0, 16).replace("T", " ")}
                      {b.deleted_by ? ` by ${b.deleted_by}` : ""}
                      {b.delete_reason ? ` — "${b.delete_reason}"` : ""}
                    </div>
                    <button
                      type="button"
                      onClick={() => restore("bill", b.id)}
                      style={{
                        marginTop: 4,
                        background: "none",
                        border: "1px solid #1F4B43",
                        borderRadius: 5,
                        color: "#1F4B43",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        padding: "3px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}

              <strong style={{ fontSize: "0.9rem", display: "block", marginTop: 12 }}>
                Purchases ({data.expenses?.length || 0})
              </strong>
              {(data.expenses || []).length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  None.
                </p>
              ) : (
                data.expenses.map((x) => (
                  <div
                    key={x.id}
                    style={{
                      borderTop: "1px solid var(--line)",
                      padding: "8px 0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>{x.title}</strong> · {formatInr(x.total_inr)} ·{" "}
                    {x.expense_date}
                    <div className="muted" style={{ fontSize: "0.78rem" }}>
                      deleted {String(x.deleted_at).slice(0, 16).replace("T", " ")}
                      {x.deleted_by ? ` by ${x.deleted_by}` : ""}
                      {x.delete_reason ? ` — "${x.delete_reason}"` : ""}
                    </div>
                    <button
                      type="button"
                      onClick={() => restore("expense", x.id)}
                      style={{
                        marginTop: 4,
                        background: "none",
                        border: "1px solid #1F4B43",
                        borderRadius: 5,
                        color: "#1F4B43",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        padding: "3px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
