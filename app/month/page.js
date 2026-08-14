"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatInr, CATEGORY_LABELS } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";

function thisMonthIst() {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 7);
}

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Wide table that scrolls on its own rather than the page. */
function Scroll({ children }) {
  return <div style={{ overflowX: "auto" }}>{children}</div>;
}

const TH = {
  textAlign: "left",
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "#5A6B5F",
  padding: "6px 10px 6px 0",
  whiteSpace: "nowrap",
};
const TD = { padding: "7px 10px 7px 0", whiteSpace: "nowrap" };
const NUM = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const NUMH = { ...TH, textAlign: "right" };

/**
 * Month-end view — the replacement for the hand-built pivot tables.
 *
 * Laid out for a laptop: revenue split by supply type (which IS the GST return
 * split), expenses by category, and attendance per person for payroll.
 */
export default function MonthPage() {
  const [month, setMonth] = useState(thisMonthIst());
  const [data, setData] = useState(null);
  const [gst, setGst] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m) => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/reports/month?month=${m}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not load the month");
      setData(d);
      // The accountant's view comes from the period report. Kept as a separate
      // call so a change here can never disturb the figures above.
      try {
        const g = await fetch(`/api/reports/period?month=${m}`);
        setGst(g.ok ? (await g.json()).gst : null);
      } catch {
        setGst(null);
      }
    } catch (e) {
      setErr(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  const rev = data?.revenue;
  const exp = data?.expenses;
  const att = data?.attendance;

  return (
    <div className="app-shell">
      <BrandHeader
        title="Month end"
        subtitle="Revenue · GST · expenses · attendance"
        right={
          <Link href="/admin" className="btn btn-ghost">
            Dashboard
          </Link>
        }
      />
      <main className="page" style={{ paddingBottom: 80, maxWidth: 1100 }}>
        <div
          className="card"
          style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            style={{ minHeight: 38 }}
          >
            ← Previous
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || thisMonthIst())}
            className="search-input"
            style={{ maxWidth: 170 }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            style={{ minHeight: 38 }}
          >
            Next →
          </button>
          <strong style={{ marginLeft: "auto" }}>{monthLabel(month)}</strong>
        </div>

        {err ? <div className="error">{err}</div> : null}
        {loading ? <div className="card">Loading {monthLabel(month)}…</div> : null}

        {data && !loading ? (
          <>
            {/* Headline numbers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              {[
                ["Invoiced", formatInr(rev.total), `${rev.count} invoice(s)`],
                ["GST collected", formatInr(rev.tax), "payable on sales"],
                ["Expenses", formatInr(exp.total), `${exp.count} purchase(s)`],
                [
                  "Invoiced less spend",
                  formatInr(data.net),
                  "cash view, not a P&L",
                ],
              ].map(([label, value, hint]) => (
                <div className="card" key={label} style={{ margin: 0 }}>
                  <div style={TH}>{label}</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>{value}</div>
                  <div className="muted" style={{ fontSize: "0.76rem" }}>
                    {hint}
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue by supply type — this split is what gets filed */}
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 2 }}>
                Sales by supply type
              </div>
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 10 }}>
                This split is the GST return: each SAC is filed at its own rate.
              </div>
              {rev.byKind.length === 0 ? (
                <div className="muted">No invoices this month.</div>
              ) : (
                <Scroll>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={TH}>Supply</th>
                        <th style={TH}>SAC</th>
                        <th style={NUMH}>Rate</th>
                        <th style={NUMH}>Invoices</th>
                        <th style={NUMH}>Taxable</th>
                        <th style={NUMH}>GST</th>
                        <th style={NUMH}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rev.byKind.map((r) => (
                        <tr key={r.kind} style={{ borderTop: "1px solid #E6E9E3" }}>
                          <td style={TD}>
                            <strong>{r.label}</strong>
                          </td>
                          <td style={TD}>{r.hsnSac}</td>
                          <td style={NUM}>{r.gstPct}%</td>
                          <td style={NUM}>{r.count}</td>
                          <td style={NUM}>{formatInr(r.taxable)}</td>
                          <td style={NUM}>{formatInr(r.tax)}</td>
                          <td style={NUM}>
                            <strong>{formatInr(r.total)}</strong>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid #1F4B43" }}>
                        <td style={TD} colSpan={4}>
                          <strong>Total</strong>
                        </td>
                        <td style={NUM}>
                          <strong>{formatInr(rev.taxable)}</strong>
                        </td>
                        <td style={NUM}>
                          <strong>{formatInr(rev.tax)}</strong>
                        </td>
                        <td style={NUM}>
                          <strong>{formatInr(rev.total)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Scroll>
              )}
              <div
                className="muted"
                style={{ fontSize: "0.8rem", marginTop: 10, lineHeight: 1.6 }}
              >
                Collected {formatInr(rev.collected)} · outstanding{" "}
                <strong>{formatInr(rev.pending)}</strong>
                {rev.b2bCount > 0
                  ? ` · ${rev.b2bCount} invoice(s) to companies with a GSTIN`
                  : ""}
              </div>
            </div>

            {/* Expenses */}
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 10 }}>
                Expenses by category
              </div>
              {exp.byCategory.length === 0 ? (
                <div className="muted">No purchases recorded this month.</div>
              ) : (
                <Scroll>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={TH}>Category</th>
                        <th style={NUMH}>Entries</th>
                        <th style={NUMH}>GST in it</th>
                        <th style={NUMH}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exp.byCategory.map((c) => (
                        <tr key={c.category} style={{ borderTop: "1px solid #E6E9E3" }}>
                          <td style={TD}>
                            {CATEGORY_LABELS?.[c.category] || c.category}
                          </td>
                          <td style={NUM}>{c.count}</td>
                          <td style={NUM}>{formatInr(c.gst)}</td>
                          <td style={NUM}>
                            <strong>{formatInr(c.total)}</strong>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid #1F4B43" }}>
                        <td style={TD}>
                          <strong>Total</strong>
                        </td>
                        <td style={NUM}>
                          <strong>{exp.count}</strong>
                        </td>
                        <td style={NUM}>
                          <strong>{formatInr(exp.gst)}</strong>
                        </td>
                        <td style={NUM}>
                          <strong>{formatInr(exp.total)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Scroll>
              )}
              {exp.withoutPhoto > 0 ? (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: "0.8rem",
                    color: "#C2562A",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {exp.withoutPhoto} of {exp.count} purchase(s) have no photo of
                  the paper — unverifiable at audit.
                </div>
              ) : null}
            </div>

            {/* Attendance */}
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 2 }}>Attendance</div>
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 10 }}>
                {att.daysWithData} day(s) marked this month. A half day counts as
                0.5 worked.
              </div>
              {att.staff.length === 0 ? (
                <div className="muted">No attendance marked this month.</div>
              ) : (
                <Scroll>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={TH}>Person</th>
                        <th style={NUMH}>Present</th>
                        <th style={NUMH}>Half</th>
                        <th style={NUMH}>Absent</th>
                        <th style={NUMH}>Leave</th>
                        <th style={NUMH}>Days worked</th>
                        <th style={NUMH}>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {att.staff.map((s) => (
                        <tr key={s.name} style={{ borderTop: "1px solid #E6E9E3" }}>
                          <td style={TD}>
                            <strong>{s.name}</strong>
                          </td>
                          <td style={NUM}>{s.present}</td>
                          <td style={NUM}>{s.half}</td>
                          <td style={NUM}>{s.absent}</td>
                          <td style={NUM}>{s.leave}</td>
                          <td style={NUM}>
                            <strong>{s.daysWorked}</strong>
                          </td>
                          <td style={NUM}>{s.hours || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroll>
              )}
            </div>

            {/* For the accountant: the return, and the questions asked of it */}
            {gst ? (
              <div className="card">
                <div style={{ fontWeight: 800, marginBottom: 2 }}>
                  For the accountant
                </div>
                <div
                  className="muted"
                  style={{ fontSize: "0.8rem", marginBottom: 10 }}
                >
                  Output tax is known in full. Input credit is only claimable
                  against a purchase carrying a vendor GSTIN.
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr style={{ borderTop: "1px solid #E6E9E3" }}>
                      <td style={TD}>GST bills</td>
                      <td style={NUM}>
                        <strong>{gst.gstBills}</strong>
                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid #E6E9E3" }}>
                      <td style={TD}>Non-GST bills</td>
                      <td style={NUM}>
                        <strong>{gst.nonGstBills}</strong>
                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid #E6E9E3" }}>
                      <td style={TD}>B2B (buyer has a GSTIN)</td>
                      <td style={NUM}>
                        {gst.b2b.reduce((a, x) => a + x.count, 0)}
                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid #E6E9E3" }}>
                      <td style={TD}>B2C</td>
                      <td style={NUM}>{gst.b2c.count}</td>
                    </tr>
                    <tr style={{ borderTop: "1px solid #E6E9E3" }}>
                      <td style={TD}>Output GST on sales</td>
                      <td style={NUM}>{formatInr(gst.outputTotal)}</td>
                    </tr>
                    <tr style={{ borderTop: "1px solid #E6E9E3" }}>
                      <td style={TD}>Less input GST claimable</td>
                      <td style={NUM}>{formatInr(gst.inputClaimable)}</td>
                    </tr>
                    <tr style={{ borderTop: "2px solid #1F4B43" }}>
                      <td style={TD}>
                        <strong>Net GST payable</strong>
                      </td>
                      <td style={NUM}>
                        <strong>{formatInr(gst.netPayable)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {gst.purchasesWithoutGstin > 0 ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: "0.8rem",
                      color: "#C2562A",
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {gst.purchasesWithoutGstin} purchase(s) carrying{" "}
                    {formatInr(gst.inputUnclaimable)} of GST have no vendor
                    GSTIN, so that credit cannot be claimed.
                  </div>
                ) : null}
                <div style={{ marginTop: 12 }}>
                  <a
                    className="btn btn-primary"
                    href={`/api/reports/ops?type=gst-pack&format=xlsx&from=${data.start}&to=${data.end}`}
                    style={{ minHeight: 38 }}
                  >
                    Download accountant pack (Excel)
                  </a>
                </div>
              </div>
            ) : null}

            {/* Downloads */}
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 10 }}>
                Download for the accountant
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  [`Sales (Excel)`, `/api/reports/export?from=${data.start}&to=${data.end}`],
                  [
                    `Expenses (Excel)`,
                    `/api/reports/ops?type=expenses&format=xlsx&from=${data.start}&to=${data.end}`,
                  ],
                  [
                    `Attendance (Excel)`,
                    `/api/reports/ops?type=attendance&format=xlsx&from=${data.start}&to=${data.end}`,
                  ],
                  [
                    `Expenses (PDF)`,
                    `/api/reports/ops?type=expenses&format=pdf&from=${data.start}&to=${data.end}`,
                  ],
                  [
                    `Attendance (PDF)`,
                    `/api/reports/ops?type=attendance&format=pdf&from=${data.start}&to=${data.end}`,
                  ],
                ].map(([label, href]) => (
                  <a
                    key={label}
                    className="btn btn-ghost"
                    href={href}
                    style={{ minHeight: 38 }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
