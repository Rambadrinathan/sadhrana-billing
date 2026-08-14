"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatInr } from "@/lib/config";
import BrandHeader from "@/components/BrandHeader";

/**
 * The supervisor's dashboard.
 *
 * Built for one person holding a phone who is not an accountant and will not
 * filter, sort or download anything to find an answer. So every block leads
 * with the answer as a sentence-sized number, and the table underneath is
 * supporting detail he can ignore.
 *
 * What is deliberately NOT here: GST, SAC codes, taxable value, B2B splits.
 * Those are the accountant's questions and they live on the owner's month view.
 */

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function monthStart(d = todayIst()) {
  return `${d.slice(0, 7)}-01`;
}

function addMonths(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastDayOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

function prettyDate(d) {
  if (!d) return "";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** One big number with its question above it. The question is the label. */
function Answer({ question, value, hint, tone }) {
  const colour =
    tone === "bad" ? "#C2562A" : tone === "good" ? "#1F4B43" : "inherit";
  return (
    <div className="card" style={{ margin: 0 }}>
      <div
        style={{
          fontSize: "0.74rem",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          color: "#5A6B5F",
          marginBottom: 4,
        }}
      >
        {question}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: colour }}>
        {value}
      </div>
      {hint ? (
        <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
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
const TD = { padding: "8px 10px 8px 0", whiteSpace: "nowrap" };
const NUM = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const NUMH = { ...TH, textAlign: "right" };

function Grid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
        gap: 12,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

export default function SummaryPage() {
  const thisMonth = todayIst().slice(0, 7);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIst());
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f, t) => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/reports/period?from=${f}&to=${t}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not load these dates");
      setData(d);
    } catch (e) {
      setErr(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(from, to);
  }, [from, to, load]);

  const presets = useMemo(
    () => [
      ["This month", monthStart(), todayIst()],
      [
        "Last month",
        `${addMonths(thisMonth, -1)}-01`,
        lastDayOf(addMonths(thisMonth, -1)),
      ],
      ["Today", todayIst(), todayIst()],
    ],
    [thisMonth]
  );

  const rev = data?.revenue;
  const exp = data?.expenses;
  const fnb = data?.fnb;
  const ppl = data?.people;

  return (
    <div className="app-shell">
      <BrandHeader
        title="How we are doing"
        subtitle="Money in · money out · the team"
        right={
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        }
      />
      <main className="page" style={{ paddingBottom: 80, maxWidth: 1000 }}>
        {/* Dates. Presets first, because they cover almost every real use. */}
        <div className="card">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {presets.map(([label, f, t]) => {
              const on = from === f && to === t;
              return (
                <button
                  key={label}
                  type="button"
                  className={on ? "btn btn-primary" : "btn btn-ghost"}
                  style={{ minHeight: 38 }}
                  onClick={() => {
                    setFrom(f);
                    setTo(t);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="row">
            <div className="field">
              <label>From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label>To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        {err ? <div className="error">{err}</div> : null}
        {loading ? <div className="card">Loading…</div> : null}

        {data && !loading ? (
          <>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 12px" }}>
              {prettyDate(data.start)} to {prettyDate(data.end)} · {data.daysInRange}{" "}
              day{data.daysInRange === 1 ? "" : "s"}
            </p>

            {/* ---------------------------------------------- money in --- */}
            <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Money in</h2>
            <Grid>
              <Answer
                question="Rooms"
                value={formatInr(rev.rooms)}
                hint="villa stays billed"
              />
              <Answer
                question="F&B"
                value={formatInr(rev.fnb)}
                hint="restaurant bills"
              />
              <Answer
                question="Received"
                value={formatInr(rev.collected)}
                hint={`of ${formatInr(rev.total)} billed`}
                tone="good"
              />
              <Answer
                question="Still to collect"
                value={formatInr(rev.pending)}
                hint={rev.pending > 0 ? "chase these" : "nothing outstanding"}
                tone={rev.pending > 0 ? "bad" : undefined}
              />
            </Grid>

            {/* ---------------------------------------------- money out --- */}
            <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Money out</h2>
            <Grid>
              <Answer
                question="Total spent"
                value={formatInr(exp.total)}
                hint={`${exp.count} purchase${exp.count === 1 ? "" : "s"}`}
              />
              <Answer
                question="On F&B provisions"
                value={formatInr(exp.fnbSpend)}
                hint="kitchen buying"
              />
              <Answer
                question="In minus out"
                value={formatInr(rev.total - exp.total)}
                hint="billed less spent — not profit"
              />
            </Grid>

            {exp.byCategory.length ? (
              <div className="card">
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  What the money went on
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {exp.byCategory.map((c) => (
                      <tr key={c.category} style={{ borderTop: "1px solid #E6E9E3" }}>
                        <td style={TD}>{c.label}</td>
                        <td style={NUM} className="muted">
                          {c.count}
                        </td>
                        <td style={NUM}>
                          <strong>{formatInr(c.total)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {exp.withoutPhoto > 0 ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: "0.82rem",
                      color: "#C2562A",
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {exp.withoutPhoto} of {exp.count} purchase
                    {exp.count === 1 ? "" : "s"} have no photo of the bill.
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* --------------------------------------------- F&B margin --- */}
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 2 }}>The kitchen</div>
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 10 }}>
                F&B sales less what was bought for the kitchen. Staff time and gas
                are not in this.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 18,
                  flexWrap: "wrap",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    Sold
                  </div>
                  <strong style={{ fontSize: "1.1rem" }}>
                    {formatInr(fnb.revenue)}
                  </strong>
                </div>
                <div style={{ fontSize: "1.1rem" }}>−</div>
                <div>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    Bought
                  </div>
                  <strong style={{ fontSize: "1.1rem" }}>
                    {formatInr(fnb.spend)}
                  </strong>
                </div>
                <div style={{ fontSize: "1.1rem" }}>=</div>
                <div>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    Left over
                  </div>
                  <strong
                    style={{
                      fontSize: "1.3rem",
                      color: fnb.margin < 0 ? "#C2562A" : "#1F4B43",
                    }}
                  >
                    {formatInr(fnb.margin)}
                    {fnb.marginPct != null ? (
                      <span
                        className="muted"
                        style={{ fontSize: "0.85rem", fontWeight: 500 }}
                      >
                        {" "}
                        ({fnb.marginPct}%)
                      </span>
                    ) : null}
                  </strong>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------- people --- */}
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 2 }}>The team</div>
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 10 }}>
                Counted over {ppl.daysExpected} day
                {ppl.daysExpected === 1 ? "" : "s"} up to {prettyDate(data.countedThrough)}.
                A half day counts as ½. Days nobody marked show as absent.
              </div>
              {ppl.rows.length === 0 ? (
                <div className="muted">Nobody marked in these dates.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={TH}>Person</th>
                        <th style={NUMH}>Came</th>
                        <th style={NUMH}>Half</th>
                        <th style={NUMH}>Leave</th>
                        <th style={NUMH}>Absent</th>
                        <th style={NUMH}>Days</th>
                        {ppl.wagesAvailable ? <th style={NUMH}>To pay</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {ppl.rows.map((r) => (
                        <tr key={r.name} style={{ borderTop: "1px solid #E6E9E3" }}>
                          <td style={TD}>
                            <strong>{r.name}</strong>
                            {!r.onRoster ? (
                              <span className="muted" style={{ fontSize: "0.75rem" }}>
                                {" "}
                                (off roster)
                              </span>
                            ) : null}
                          </td>
                          <td style={NUM}>{r.present}</td>
                          <td style={NUM}>{r.half || "—"}</td>
                          <td style={NUM}>{r.leave || "—"}</td>
                          <td style={{ ...NUM, color: r.absent ? "#C2562A" : "inherit" }}>
                            {r.absent}
                          </td>
                          <td style={NUM}>
                            <strong>{r.daysWorked}</strong>
                          </td>
                          {ppl.wagesAvailable ? (
                            <td style={NUM}>
                              {r.payable != null ? (
                                <strong>{formatInr(r.payable)}</strong>
                              ) : (
                                <span className="muted">no rate</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                      {ppl.wagesAvailable && ppl.totalPayable > 0 ? (
                        <tr style={{ borderTop: "2px solid #1F4B43" }}>
                          <td style={TD} colSpan={5}>
                            <strong>Total wages</strong>
                          </td>
                          <td style={NUM}>
                            <strong>{ppl.totalDaysWorked}</strong>
                          </td>
                          <td style={NUM}>
                            <strong>{formatInr(ppl.totalPayable)}</strong>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
              {ppl.wagesAvailable && ppl.ratesMissing > 0 ? (
                <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                  {ppl.ratesMissing} person(s) have no daily wage set, so no amount
                  is shown for them. Set it under Admin → Staff.
                </div>
              ) : null}
              <div style={{ marginTop: 10 }}>
                <a
                  className="btn btn-ghost"
                  style={{ minHeight: 38 }}
                  href={`/api/reports/ops?type=attendance&format=xlsx&from=${data.start}&to=${data.end}`}
                >
                  Download attendance (Excel)
                </a>
              </div>
            </div>

            {data.warnings?.length ? (
              <div className="card" style={{ borderColor: "#C2562A" }}>
                {data.warnings.map((w) => (
                  <div key={w} style={{ color: "#C2562A", fontSize: "0.84rem" }}>
                    ⚠️ {w}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
