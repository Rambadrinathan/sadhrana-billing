"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatInr, PROPERTY } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";
import VersionHistory from "@/components/VersionHistory";

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState("invoices"); // invoices | reports
  const [bills, setBills] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const q = status ? `?status=${status}&limit=200` : "?limit=200";
      try {
        const res = await fetch(`/api/bills${q}`);
        const data = await res.json();
        if (!cancelled) setBills(data.bills || []);
      } catch {
        if (!cancelled) setBills([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const filtered = useMemo(() => {
    let list = bills;
    if (from) list = list.filter((b) => String(b.bill_date) >= from);
    if (to) list = list.filter((b) => String(b.bill_date) <= to);
    return list;
  }, [bills, from, to]);

  const stats = useMemo(() => {
    const active = filtered.filter((b) => b.status !== "void");
    const paid = active.filter((b) => b.status === "paid");
    const unpaid = active.filter((b) => b.status === "unpaid");
    const collected = paid.reduce((s, b) => s + Number(b.grand_total || 0), 0);
    const pending = unpaid.reduce((s, b) => s + Number(b.grand_total || 0), 0);
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

  return (
    <div className="app-shell" style={{ maxWidth: 720 }}>
      <BrandHeader
        title="Owner dashboard"
        subtitle="Invoices · payments · reports"
        homeHref="/admin"
        right={
          <>
            <Link href="/" className="btn btn-ghost">
              Staff
            </Link>
            <button className="btn btn-ghost" type="button" onClick={logout}>
              Lock
            </button>
          </>
        }
      />

      <main className="page">
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${tab === "invoices" ? "active" : ""}`}
            onClick={() => setTab("invoices")}
          >
            Invoices
          </button>
          <button
            type="button"
            className={`chip ${tab === "reports" ? "active" : ""}`}
            onClick={() => setTab("reports")}
          >
            Reports
          </button>
        </div>

        <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="stat">
            <div className="label">Collected (paid)</div>
            <div className="value">{formatInr(stats.collected)}</div>
          </div>
          <div className="stat">
            <div className="label">Pending (unpaid)</div>
            <div className="value">{formatInr(stats.pending)}</div>
          </div>
          <div className="stat">
            <div className="label">GST component</div>
            <div className="value" style={{ fontSize: "1.1rem" }}>
              {formatInr(stats.gstTotal)}
            </div>
          </div>
          <div className="stat">
            <div className="label">Final billed total</div>
            <div className="value" style={{ fontSize: "1.1rem" }}>
              {formatInr(stats.collected + stats.pending)}
            </div>
          </div>
        </div>

        {tab === "reports" ? (
          <div className="card">
            <strong>Reports &amp; Excel export</strong>
            <p className="muted" style={{ fontSize: "0.9rem", margin: "8px 0 14px" }}>
              Branded workbook for {PROPERTY.tradeName}: summary, invoices, line items, by
              customer (including how many invoices were edited).
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
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Snapshot (filtered)
              </div>
              <div style={{ marginTop: 8, fontSize: "0.95rem", lineHeight: 1.6 }}>
                <div>
                  Invoices: <strong>{stats.count}</strong> (edited: {stats.edited})
                </div>
                <div>
                  Taxable / subtotal: <strong>{formatInr(stats.taxable)}</strong>
                </div>
                <div>
                  GST due/collected in period: <strong>{formatInr(stats.gstTotal)}</strong>
                </div>
                <div>
                  Final billed:{" "}
                  <strong>{formatInr(stats.collected + stats.pending)}</strong>
                </div>
                <div>
                  Paid {formatInr(stats.collected)} · Unpaid {formatInr(stats.pending)}
                </div>
              </div>
            </div>

            <button className="btn btn-primary" type="button" onClick={exportExcel}>
              Download Excel report
            </button>
            <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
              Sheets: Summary · Invoices · Line items · By customer
            </p>
          </div>
        ) : null}

        {tab === "invoices" ? (
          <>
            <div className="chip-row">
              {[
                ["", "All"],
                ["paid", "Paid"],
                ["unpaid", "Unpaid"],
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
                  <div key={b.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
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
                          {b.gst_applied === false ? " · No GST" : " · GST 5%"}
                          {b.payment_mode ? ` · ${String(b.payment_mode).toUpperCase()}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800 }}>{formatInr(b.grand_total)}</div>
                        <span className={`badge badge-${b.status}`}>{b.status}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a className="btn btn-ghost" href={`/invoice/${b.id}`} style={{ minHeight: 36 }}>
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
