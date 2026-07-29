"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROPERTY, formatInr } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function HomePage() {
  const router = useRouter();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [staffName, setStaffName] = useState("");
  const date = todayIst();

  useEffect(() => {
    try {
      setStaffName(localStorage.getItem("sb_staff_name") || "");
    } catch {
      /* ignore */
    }
    fetch("/api/login")
      .then((r) => r.json())
      .then((d) => {
        if (d.name) setStaffName(d.name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ date, limit: "40" });
        if (search.trim()) params.set("q", search.trim());
        const res = await fetch(`/api/bills?${params}`);
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
  }, [date, search]);

  const stats = useMemo(() => {
    const active = bills.filter((b) => b.status !== "void");
    const paid = active.filter((b) => b.status === "paid");
    const unpaid = active.filter(
      (b) => b.status === "unpaid" || b.status === "partial"
    );
    const collected = active.reduce(
      (s, b) => s + Number(b.amount_paid || (b.status === "paid" ? b.grand_total : 0) || 0),
      0
    );
    const pending = unpaid.reduce((s, b) => {
      const due =
        Number(b.grand_total || 0) - Number(b.amount_paid || 0);
      return s + Math.max(0, due);
    }, 0);
    return { count: active.length, collected, pending, unpaidCount: unpaid.length };
  }, [bills]);

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <BrandHeader
        title="Staff checkout"
        subtitle={
          staffName
            ? `${date} · ${staffName}`
            : `${date} · extras & F&B`
        }
        right={
          <>
            <Link href="/history" className="btn btn-ghost">
              History
            </Link>
            <button className="btn btn-ghost" type="button" onClick={logout}>
              Lock
            </button>
          </>
        }
      />

      <main className="page">
        {demo ? (
          <div className="card" style={{ marginBottom: 12, background: "#fff8e8" }}>
            <strong>Demo mode</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Supabase not configured yet.
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

        <input
          className="search-input"
          type="search"
          placeholder="Search bill no or guest name…"
          value={search}
          onChange={(e) => {
            setLoading(true);
            setSearch(e.target.value);
          }}
        />

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{search.trim() ? "Search results" : "Today’s bills"}</strong>
            <span className="muted" style={{ fontSize: "0.9rem" }}>
              {stats.count} · {stats.unpaidCount} open
            </span>
          </div>

          {loading ? (
            <p className="muted" style={{ marginTop: 16 }}>
              Loading…
            </p>
          ) : bills.length === 0 ? (
            <p className="muted" style={{ marginTop: 16 }}>
              {search.trim()
                ? "No matching bills."
                : "No bills yet. Create one when the guest is checking out."}
            </p>
          ) : (
            bills.map((b) => (
              <Link key={b.id} href={`/bills/${b.id}`} className="bill-list-item">
                <div className="bill-list-top">
                  <div>
                    <div style={{ fontWeight: 700 }}>{b.guest_name}</div>
                    <div className="muted" style={{ fontSize: "0.88rem" }}>
                      {b.villa} · {b.bill_no}
                      {b.version > 1 ? ` · v${b.version}` : ""}
                      {b.gst_applied === false ? " · No GST" : ""}
                      {b.created_by ? ` · ${b.created_by}` : ""}
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
            All bills &amp; version history
          </Link>
        </div>
        <p className="muted" style={{ textAlign: "center", fontSize: "0.75rem", marginTop: 12 }}>
          {PROPERTY.tradeName}
        </p>
      </main>

      <div className="fab-bar no-print">
        <Link href="/bills/new" className="btn btn-primary">
          + New checkout bill
        </Link>
      </div>
    </div>
  );
}
