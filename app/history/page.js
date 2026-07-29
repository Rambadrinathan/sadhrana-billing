"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatInr } from "@/lib/config";

export default function HistoryPage() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

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

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div>
          <h1>Bill history</h1>
          <p className="sub">All checkout extras</p>
        </div>
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
      </header>

      <main className="page">
        <div className="chip-row">
          {[
            ["", "All"],
            ["unpaid", "Unpaid"],
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
          ) : bills.length === 0 ? (
            <p className="muted">No bills found.</p>
          ) : (
            bills.map((b) => (
              <Link key={b.id} href={`/bills/${b.id}`} className="bill-list-item">
                <div className="bill-list-top">
                  <div>
                    <div style={{ fontWeight: 700 }}>{b.guest_name}</div>
                    <div className="muted" style={{ fontSize: "0.88rem" }}>
                      {b.bill_date} · {b.villa} · {b.bill_no}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800 }}>{formatInr(b.grand_total)}</div>
                    <span className={`badge badge-${b.status}`}>{b.status}</span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>

      <div className="fab-bar no-print">
        <Link href="/bills/new" className="btn btn-primary">
          + New checkout bill
        </Link>
      </div>
    </div>
  );
}
