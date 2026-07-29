"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROPERTY, formatInr } from "@/lib/config";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function HomePage() {
  const router = useRouter();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const date = todayIst();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bills?date=${date}&limit=40`);
        const data = await res.json();
        if (!cancelled) {
          setBills(data.bills || []);
          setDemo(Boolean(data.demo));
        }
      } catch {
        if (!cancelled) setBills([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const stats = useMemo(() => {
    const active = bills.filter((b) => b.status !== "void");
    const paid = active.filter((b) => b.status === "paid");
    const unpaid = active.filter((b) => b.status === "unpaid");
    const collected = paid.reduce((s, b) => s + Number(b.grand_total || 0), 0);
    const pending = unpaid.reduce((s, b) => s + Number(b.grand_total || 0), 0);
    return { count: active.length, collected, pending, unpaidCount: unpaid.length };
  }, [bills]);

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div>
          <h1>{PROPERTY.name}</h1>
          <p className="sub">Checkout extras · {date}</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={logout}>
          Lock
        </button>
      </header>

      <main className="page">
        {demo ? (
          <div className="card" style={{ marginBottom: 12, background: "#fff8e8" }}>
            <strong>Demo mode</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Supabase not configured yet. You can still try New Bill; bills won’t persist until env is set.
            </p>
          </div>
        ) : null}

        <div className="stat-grid">
          <div className="stat">
            <div className="label">Collected today</div>
            <div className="value">{formatInr(stats.collected)}</div>
          </div>
          <div className="stat">
            <div className="label">Pending</div>
            <div className="value">{formatInr(stats.pending)}</div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Today’s bills</strong>
            <span className="muted" style={{ fontSize: "0.9rem" }}>
              {stats.count} · {stats.unpaidCount} unpaid
            </span>
          </div>

          {loading ? (
            <p className="muted" style={{ marginTop: 16 }}>
              Loading…
            </p>
          ) : bills.length === 0 ? (
            <p className="muted" style={{ marginTop: 16 }}>
              No bills yet. Create one when the guest is checking out.
            </p>
          ) : (
            bills.map((b) => (
              <Link key={b.id} href={`/bills/${b.id}`} className="bill-list-item">
                <div className="bill-list-top">
                  <div>
                    <div style={{ fontWeight: 700 }}>{b.guest_name}</div>
                    <div className="muted" style={{ fontSize: "0.88rem" }}>
                      {b.villa} · {b.bill_no}
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

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <Link href="/history" className="btn btn-secondary">
            All bills / history
          </Link>
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
