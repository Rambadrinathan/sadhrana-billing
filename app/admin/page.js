"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatInr } from "@/lib/config";

export default function AdminDashboard() {
  const router = useRouter();
  const [bills, setBills] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const q = status ? `?status=${status}&limit=100` : "?limit=100";
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

  const stats = useMemo(() => {
    const active = bills.filter((b) => b.status !== "void");
    const paid = active.filter((b) => b.status === "paid");
    const unpaid = active.filter((b) => b.status === "unpaid");
    const collected = paid.reduce((s, b) => s + Number(b.grand_total || 0), 0);
    const pending = unpaid.reduce((s, b) => s + Number(b.grand_total || 0), 0);
    const withGst = active.filter((b) => b.gst_applied !== false).length;
    const noGst = active.filter((b) => b.gst_applied === false).length;
    return {
      count: active.length,
      paid: paid.length,
      unpaid: unpaid.length,
      collected,
      pending,
      withGst,
      noGst,
    };
  }, [bills]);

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell" style={{ maxWidth: 720 }}>
      <header className="topbar no-print">
        <div>
          <h1>Owner dashboard</h1>
          <p className="sub">Invoices · payments · collections</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" className="btn btn-ghost">
            Staff
          </Link>
          <button className="btn btn-ghost" type="button" onClick={logout}>
            Lock
          </button>
        </div>
      </header>

      <main className="page">
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
            <div className="label">Invoices</div>
            <div className="value">{stats.count}</div>
          </div>
          <div className="stat">
            <div className="label">Paid / Unpaid</div>
            <div className="value" style={{ fontSize: "1.05rem" }}>
              {stats.paid} / {stats.unpaid}
            </div>
          </div>
        </div>

        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 12 }}>
          GST on: {stats.withGst} · GST off: {stats.noGst}
        </p>

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
          ) : bills.length === 0 ? (
            <p className="muted">No invoices yet.</p>
          ) : (
            bills.map((b) => (
              <div key={b.id} className="bill-list-item" style={{ display: "block" }}>
                <div className="bill-list-top">
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {b.bill_no}
                      {b.version > 1 ? ` · v${b.version}` : ""}
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
                    View invoice
                  </a>
                  <a className="btn btn-ghost" href={`/api/bills/${b.id}/pdf`} style={{ minHeight: 36 }}>
                    PDF
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
