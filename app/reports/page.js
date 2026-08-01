"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function monthStartIst() {
  const t = todayIst();
  return t.slice(0, 8) + "01";
}

export default function ReportsPage() {
  const [locations, setLocations] = useState([]);
  const [from, setFrom] = useState(monthStartIst());
  const [to, setTo] = useState(todayIst());
  const [attFrom, setAttFrom] = useState(monthStartIst());
  const [attTo, setAttTo] = useState(todayIst());
  const [guestFrom, setGuestFrom] = useState("");
  const [guestTo, setGuestTo] = useState("");
  const [leadFrom, setLeadFrom] = useState(monthStartIst());
  const [leadTo, setLeadTo] = useState(todayIst());

  useEffect(() => {
    fetch("/api/inventory")
      .then((r) => r.json())
      .then((d) => setLocations(d.locations || []))
      .catch(() => setLocations([]));
  }, []);

  function open(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function qs(params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") q.set(k, v);
    });
    return q.toString();
  }

  function dualButtons(baseParams) {
    const p = qs(baseParams);
    return (
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => open(`/api/reports/ops?${p}&format=pdf`)}
        >
          PDF
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => open(`/api/reports/ops?${p}&format=xlsx`)}
        >
          Excel
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ maxWidth: 720 }}>
      <BrandHeader
        title="Reports"
        subtitle="Branded PDF + Excel · date ranges where dynamic"
        homeHref="/admin"
        right={
          <Link href="/admin" className="btn btn-ghost">
            Admin
          </Link>
        }
      />
      <main className="page">
        <p className="muted" style={{ marginBottom: 16, fontSize: "0.92rem" }}>
          Logo and brand colours on every file. Inventory is a full asset
          register (no date range). Attendance, guests, leads, and expenses
          support <strong>date ranges</strong> plus <strong>PDF</strong> and{" "}
          <strong>Excel</strong>.
        </p>

        {/* Pack */}
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Operations pack (PDF summary)</strong>
          <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 12px" }}>
            One-page overview of all areas.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => open("/api/reports/ops?type=pack&format=pdf")}
          >
            Download ops pack PDF
          </button>
        </div>

        {/* Inventory — no date range */}
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Inventory</strong>
          <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 10px" }}>
            Static asset register — no date range. One report per area or full
            property.
          </p>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                open("/api/reports/ops?type=inventory&format=pdf")
              }
            >
              Full PDF
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                open("/api/reports/ops?type=inventory&format=xlsx")
              }
            >
              Full Excel
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {locations.map((loc) => (
              <div
                key={loc.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  borderTop: "1px solid var(--line)",
                  paddingTop: 8,
                }}
              >
                <span style={{ flex: 1, fontWeight: 600, minWidth: 120 }}>
                  {loc.name}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 36 }}
                  onClick={() =>
                    open(
                      `/api/reports/ops?type=inventory&location_id=${encodeURIComponent(loc.id)}&format=pdf`
                    )
                  }
                >
                  PDF
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 36 }}
                  onClick={() =>
                    open(
                      `/api/reports/ops?type=inventory&location_id=${encodeURIComponent(loc.id)}&format=xlsx`
                    )
                  }
                >
                  Excel
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Expenses */}
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Expenses</strong>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label>To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {dualButtons({ type: "expenses", from, to })}
        </div>

        {/* Attendance */}
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Attendance</strong>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
            Date range on punch dates (IST).
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>From</label>
              <input
                type="date"
                value={attFrom}
                onChange={(e) => setAttFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label>To</label>
              <input
                type="date"
                value={attTo}
                onChange={(e) => setAttTo(e.target.value)}
              />
            </div>
          </div>
          {dualButtons({ type: "attendance", from: attFrom, to: attTo })}
        </div>

        {/* Guests */}
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Guests</strong>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
            Optional range = when guest was <em>added</em>. Leave blank for all.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>From</label>
              <input
                type="date"
                value={guestFrom}
                onChange={(e) => setGuestFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label>To</label>
              <input
                type="date"
                value={guestTo}
                onChange={(e) => setGuestTo(e.target.value)}
              />
            </div>
          </div>
          {dualButtons({
            type: "guests",
            from: guestFrom,
            to: guestTo,
          })}
        </div>

        {/* Leads */}
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Leads / enquiries</strong>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
            Date range = when the enquiry was created.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>From</label>
              <input
                type="date"
                value={leadFrom}
                onChange={(e) => setLeadFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label>To</label>
              <input
                type="date"
                value={leadTo}
                onChange={(e) => setLeadTo(e.target.value)}
              />
            </div>
          </div>
          {dualButtons({ type: "leads", from: leadFrom, to: leadTo })}
        </div>

        <div className="card">
          <strong>Billing Excel</strong>
          <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 12px" }}>
            Invoice collections workbook (owner admin).
          </p>
          <Link href="/admin" className="btn btn-secondary">
            Admin → Reports tab
          </Link>
        </div>
      </main>
    </div>
  );
}
