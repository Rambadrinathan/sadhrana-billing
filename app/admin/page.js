"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [newStaff, setNewStaff] = useState({ name: "", phone: "" });
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
    return list;
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
        subtitle="Invoices · staff · menu · reports · day-end"
        homeHref="/admin"
        right={
          <>
            <Link href="/" className="btn btn-ghost">
              Staff
            </Link>
            <button className="btn btn-ghost" type="button" onClick={logout}>
              Logout
            </button>
          </>
        }
      />

      <main className="page">
        <div className="chip-row">
          {[
            ["invoices", "Invoices"],
            ["reports", "Reports"],
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
              <button
                className="btn btn-primary"
                type="button"
                disabled={staffBusy || !newStaff.name.trim()}
                onClick={() =>
                  saveStaff({
                    name: newStaff.name.trim(),
                    phone: newStaff.phone.trim() || null,
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
      </main>
    </div>
  );
}
