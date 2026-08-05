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
  const [isAdmin, setIsAdmin] = useState(false);
  const [denied, setDenied] = useState(false);
  const [att, setAtt] = useState(null);
  const date = todayIst();

  // Today's attendance headline for the home tile
  useEffect(() => {
    fetch(`/api/attendance/day?date=${todayIst()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.entries) return;
        const done = d.entries.filter((e) => e.saved && e.in && e.out).length;
        const inNow = d.entries.filter((e) => e.saved && e.in && !e.out).length;
        const absent = d.entries.filter(
          (e) => e.saved && (e.status === "absent" || e.status === "leave")
        ).length;
        setAtt({
          in: inNow,
          done,
          absent,
          pending: d.entries.filter((e) => !e.saved).length,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      setDenied(new URLSearchParams(window.location.search).get("denied") === "1");
    } catch {
      /* ignore */
    }
  }, []);

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
        setIsAdmin(d.role === "admin");
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
              Logout
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

        {denied ? (
          <div className="card" style={{ marginBottom: 12, background: "#FBF8F2" }}>
            <strong style={{ color: "#C2562A" }}>Owner access only</strong>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
              That section needs the owner PIN. You have Bills and Purchases.
            </p>
          </div>
        ) : null}

        <Link
          href="/bills/new"
          className="card"
          style={{
            display: "block",
            marginBottom: 14,
            background: "var(--green-soft, #e8f5ee)",
            border: "2px solid var(--green, #1a5c3a)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--green, #1a5c3a)" }}>
            + F&amp;B tax invoice
          </div>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
            Guest · villa · menu items · GST 5% · PDF for WhatsApp
          </p>
        </Link>

        {/* Rooms are the bigger revenue line and used to go to the accountant. */}
        <Link
          href="/bills/stay"
          className="card"
          style={{
            display: "block",
            marginBottom: 14,
            background: "var(--green-soft, #e8f5ee)",
            border: "2px solid var(--green, #1a5c3a)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--green, #1a5c3a)" }}>
            + Room / stay invoice
          </div>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
            Nights priced from the rate card · GST 18% · company GSTIN supported
          </p>
        </Link>

        {/* Staff see Bills + Purchases only. Owner sees the full module. */}
        {isAdmin ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <Link href="/inventory" className="btn btn-secondary" style={{ textAlign: "center" }}>
              Inventory
            </Link>
            <Link href="/attendance" className="btn btn-secondary" style={{ textAlign: "center" }}>
              Attendance
            </Link>
            <Link href="/expenses" className="btn btn-secondary" style={{ textAlign: "center" }}>
              Expenses
            </Link>
            <Link href="/guests" className="btn btn-secondary" style={{ textAlign: "center" }}>
              Guests
            </Link>
            <Link href="/leads" className="btn btn-secondary" style={{ textAlign: "center" }}>
              Leads
            </Link>
            <Link href="/reports" className="btn btn-secondary" style={{ textAlign: "center" }}>
              Reports
            </Link>
          </div>
        ) : (
          <>
            <Link
              href="/expenses"
              className="card"
              style={{
                display: "block",
                marginBottom: 12,
                background: "#FBF8F2",
                border: "2px solid #C2562A",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#C2562A" }}>
                + Purchase / expense
              </div>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
                Supplier invoice · itemised · GST
              </p>
            </Link>

            <Link
              href="/attendance"
              className="card"
              style={{
                display: "block",
                marginBottom: 14,
                background: "#F2F6F4",
                border: "2px solid #2F6E60",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#2F6E60" }}>
                🕒 Attendance
              </div>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
                {att
                  ? `Today — in ${att.in} · done ${att.done} · absent ${att.absent}` +
                    (att.pending ? ` · ${att.pending} awaited` : "")
                  : "Clock the team in and out"}
              </p>
            </Link>
          </>
        )}

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
