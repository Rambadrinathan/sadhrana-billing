"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatInr } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";

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
      <BrandHeader
        title="Bill history"
        subtitle="All invoices · open for version history"
        right={
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        }
      />

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
                    <div style={{ fontWeight: 700 }}>
                      {b.guest_name}
                      {Number(b.version) > 1 ? (
                        <span
                          className="badge"
                          style={{
                            marginLeft: 6,
                            background: "#e8f0fe",
                            color: "#1a56db",
                          }}
                        >
                          v{b.version}
                        </span>
                      ) : null}
                    </div>
                    <div className="muted" style={{ fontSize: "0.88rem" }}>
                      {b.bill_date} · {b.villa} · {b.bill_no}
                      {b.gst_applied === false ? " · No GST" : ""}
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
