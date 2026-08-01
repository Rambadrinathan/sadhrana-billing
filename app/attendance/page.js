"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayIst());
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/attendance?date=${date}`);
    const data = await res.json();
    setRows(data.rows || []);
  }

  useEffect(() => {
    load().catch(() => setRows([]));
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => setStaff(d.staff || []))
      .catch(() => setStaff([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function punch(action) {
    if (!pick) {
      setMsg("Select staff");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_name: pick, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg(String(data.message || "OK").replace(/\*/g, ""));
      await load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <BrandHeader
        title="Attendance"
        subtitle="Clock in / out · Telegram /attendance too"
        right={
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        }
      />
      <main className="page">
        {msg ? (
          <p className="muted" style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>
            {msg}
          </p>
        ) : null}

        <div className="card">
          <div className="field">
            <label>Staff</label>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Select…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => punch("in")}
            >
              Clock in
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => punch("out")}
            >
              Clock out
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
            Or in Telegram group: /attendance → tap name
          </p>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <strong>Log</strong>
          {rows.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              No punches this day. (If always empty: run SETUP_OPS.sql in Supabase.)
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                style={{
                  borderBottom: "1px solid var(--line)",
                  padding: "10px 0",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontWeight: 700 }}>{r.staff_name}</div>
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  {fmt(r.clock_in)} → {r.clock_out ? fmt(r.clock_out) : "in"}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
