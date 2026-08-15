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
  // Which person's payment form is open, and what is in it. One at a time:
  // this is a phone, and two open forms is two chances to type into the wrong
  // one. `editing` holds a payment id when correcting rather than adding.
  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", paid_on: "", note: "" });
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState("");

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

  function openPayment(person, existing = null) {
    setPayMsg("");
    setPayFor({ name: person.name, id: existing?.id || null });
    setPayForm(
      existing
        ? { amount: String(existing.amount), paid_on: existing.paidOn, note: existing.note || "" }
        : {
            // Prefill with what is actually still owed — the overwhelmingly
            // common payment. He can overwrite it for a part payment.
            amount: person.stillDue > 0 ? String(person.stillDue) : "",
            paid_on: todayIst(),
            note: "",
          }
    );
  }

  async function savePayment() {
    if (!payFor) return;
    setPayBusy(true);
    setPayMsg("");
    try {
      const body = {
        id: payFor.id || undefined,
        staff_name: payFor.name,
        amount_inr: Number(payForm.amount),
        paid_on: payForm.paid_on,
        note: payForm.note,
      };
      const res = await fetch("/api/staff-payments", {
        method: payFor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save the payment");
      setPayFor(null);
      await load(from, to);
    } catch (e) {
      setPayMsg(e.message);
    } finally {
      setPayBusy(false);
    }
  }

  async function removePayment(person, payment) {
    if (
      !window.confirm(
        `Remove this payment?

${person.name} · ${formatInr(payment.amount)} on ${payment.paidOn}

It stops counting against what he is owed.`
      )
    ) {
      return;
    }
    setPayBusy(true);
    setPayMsg("");
    try {
      const res = await fetch(`/api/staff-payments?id=${payment.id}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not remove it");
      await load(from, to);
    } catch (e) {
      setPayMsg(e.message);
    } finally {
      setPayBusy(false);
    }
  }

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
            <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>The team</h2>
            {ppl.wagesAvailable && (ppl.totalPayable > 0 || ppl.totalPaid > 0) ? (
              <Grid>
                <Answer
                  question="Earned so far"
                  value={formatInr(ppl.totalPayable)}
                  hint={`${ppl.totalDaysWorked} days worked`}
                />
                <Answer
                  question="Already paid"
                  value={formatInr(ppl.totalPaid)}
                  hint={`${ppl.paymentsRecorded} payment(s) recorded`}
                  tone="good"
                />
                <Answer
                  question={`Still due as of ${prettyDate(data.countedThrough)}`}
                  value={formatInr(ppl.totalStillDue)}
                  hint="earned less paid"
                  tone={ppl.totalStillDue > 0 ? "bad" : undefined}
                />
              </Grid>
            ) : null}

            <div className="card">
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                Counted over {ppl.daysExpected} day
                {ppl.daysExpected === 1 ? "" : "s"}, {prettyDate(data.start)} to{" "}
                {prettyDate(data.countedThrough)}. A half day counts as ½ and pays
                half. Days nobody marked count as absent.
              </div>
              {payMsg ? <div className="error">{payMsg}</div> : null}

              {ppl.rows.length === 0 ? (
                <div className="muted">Nobody marked in these dates.</div>
              ) : (
                ppl.rows.map((r) => (
                  <div
                    key={r.name}
                    style={{ borderTop: "1px solid #E6E9E3", padding: "12px 0" }}
                  >
                    {/* The answer first: who, and what is STILL owed — that is
                        the number he acts on, not what they have earned. */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "1.02rem" }}>
                        {r.name}
                        {!r.onRoster ? (
                          <span className="muted" style={{ fontSize: "0.74rem", fontWeight: 500 }}>
                            {" "}
                            (off roster)
                          </span>
                        ) : null}
                      </div>
                      {r.stillDue != null ? (
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: "1.15rem",
                            color:
                              r.stillDue > 0
                                ? "#C2562A"
                                : r.stillDue < 0
                                  ? "#8A6518"
                                  : "#1F4B43",
                          }}
                        >
                          {formatInr(r.stillDue)}
                          <span
                            className="muted"
                            style={{ fontSize: "0.72rem", fontWeight: 600 }}
                          >
                            {r.stillDue > 0
                              ? " due"
                              : r.stillDue < 0
                                ? " over-paid"
                                : " settled"}
                          </span>
                        </div>
                      ) : (
                        <div className="muted" style={{ fontSize: "0.82rem" }}>
                          {r.daysWorked} day{r.daysWorked === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>

                    {/* Then the working — the answer to "why that much?" */}
                    {r.workingOut ? (
                      <div style={{ fontSize: "0.88rem", marginTop: 3 }}>
                        Came {r.workingOut} earned
                        {r.paid > 0 ? (
                          <>
                            {" "}
                            · paid {formatInr(r.paid)} ·{" "}
                            <strong>still due {formatInr(r.stillDue)}</strong>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: "0.82rem", marginTop: 3 }}>
                        {r.monthly
                          ? "On a monthly salary — attendance recorded, nothing due by the day."
                          : "No daily wage set — days only. Set it under Admin → Staff."}
                      </div>
                    )}

                    {/* Then the evidence: one square per day, countable by eye. */}
                    {r.marks?.length ? (
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 7 }}
                        aria-label={`${r.present} of ${r.daysExpected} days present`}
                      >
                        {r.marks.map((m, i) => (
                          <span
                            key={i}
                            title={`Day ${i + 1}: ${
                              m === "P"
                                ? "came"
                                : m === "H"
                                  ? "half day"
                                  : m === "L"
                                    ? "leave"
                                    : "not marked"
                            }`}
                            style={{
                              width: 13,
                              height: 13,
                              borderRadius: 3,
                              background:
                                m === "P"
                                  ? "#2F6E60"
                                  : m === "H"
                                    ? "#8FBFB2"
                                    : m === "L"
                                      ? "#D8D2C2"
                                      : "#F0DCD3",
                              border: m ? "none" : "1px solid #E3C7BA",
                            }}
                          />
                        ))}
                      </div>
                    ) : null}

                    <div className="muted" style={{ fontSize: "0.78rem", marginTop: 6 }}>
                      {r.present} came
                      {r.half ? ` · ${r.half} half` : ""}
                      {r.leave ? ` · ${r.leave} leave` : ""}
                      {r.absent ? (
                        <span style={{ color: "#C2562A", fontWeight: 600 }}>
                          {" "}
                          · {r.absent} not marked
                        </span>
                      ) : null}
                    </div>

                    {/* Payments already made — every one correctable, because
                        the entry was made one-handed and will sometimes be
                        wrong, and a fix that needs a laptop never happens. */}
                    {r.paidList?.length ? (
                      <div style={{ marginTop: 8 }}>
                        {r.paidList.map((pmt) => (
                          <div
                            key={pmt.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 8,
                              fontSize: "0.82rem",
                              padding: "3px 0",
                            }}
                          >
                            <span style={{ color: "#1F4B43", fontWeight: 700 }}>
                              {formatInr(pmt.amount)}
                            </span>
                            <span className="muted">on {prettyDate(pmt.paidOn)}</span>
                            {pmt.note ? <span className="muted">· {pmt.note}</span> : null}
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ minHeight: 28, padding: "2px 8px", fontSize: "0.76rem" }}
                              onClick={() => openPayment(r, pmt)}
                              disabled={payBusy}
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{
                                minHeight: 28,
                                padding: "2px 8px",
                                fontSize: "0.76rem",
                                color: "#C2562A",
                              }}
                              onClick={() => removePayment(r, pmt)}
                              disabled={payBusy}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* Record a payment. Only offered where there is a rate —
                        without one there is no "earned" for it to net against. */}
                    {!r.monthly && r.dailyRate != null ? (
                      payFor?.name === r.name ? (
                        <div
                          className="card"
                          style={{ marginTop: 10, background: "var(--green-soft)" }}
                        >
                          <strong style={{ fontSize: "0.9rem" }}>
                            {payFor.id ? "Change this payment" : `Pay ${r.name}`}
                          </strong>
                          <div className="row" style={{ marginTop: 8 }}>
                            <div className="field">
                              <label>Amount ₹</label>
                              <input
                                value={payForm.amount}
                                onChange={(e) =>
                                  setPayForm({ ...payForm, amount: e.target.value })
                                }
                                inputMode="decimal"
                                autoFocus
                              />
                            </div>
                            <div className="field">
                              <label>Paid on</label>
                              <input
                                type="date"
                                value={payForm.paid_on}
                                onChange={(e) =>
                                  setPayForm({ ...payForm, paid_on: e.target.value })
                                }
                              />
                            </div>
                          </div>
                          <div className="field">
                            <label>Note (optional)</label>
                            <input
                              value={payForm.note}
                              onChange={(e) =>
                                setPayForm({ ...payForm, note: e.target.value })
                              }
                              placeholder="advance, cash, UPI…"
                            />
                          </div>
                          <div className="row" style={{ gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={savePayment}
                              disabled={payBusy || !payForm.amount}
                            >
                              {payBusy ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setPayFor(null)}
                              disabled={payBusy}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ minHeight: 34, marginTop: 8, fontSize: "0.84rem" }}
                          onClick={() => openPayment(r)}
                          disabled={payBusy}
                        >
                          + Record a payment
                        </button>
                      )
                    ) : null}
                  </div>
                ))
              )}

              {ppl.wagesAvailable && ppl.totalStillDue !== 0 ? (
                <div
                  style={{
                    borderTop: "2px solid #1F4B43",
                    marginTop: 8,
                    paddingTop: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 800,
                  }}
                >
                  <span>Still due as of {prettyDate(data.countedThrough)}</span>
                  <span>{formatInr(ppl.totalStillDue)}</span>
                </div>
              ) : null}

              {ppl.wagesAvailable && ppl.ratesMissing > 0 ? (
                <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                  {ppl.ratesMissing} person(s) have no daily wage set, so no amount
                  is shown for them. Set it under Admin → Staff.
                </div>
              ) : null}

              <div style={{ marginTop: 12 }}>
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
