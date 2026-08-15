"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import {
  STATUSES,
  STATUS_LABEL,
  nextStatus,
  defaultTimes,
  hoursFor,
  summarise,
  isValidTime,
} from "@/lib/attendance-roster";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function shiftDate(d, days) {
  const dt = new Date(`${d}T12:00:00+05:30`);
  dt.setDate(dt.getDate() + days);
  return dt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function prettyDate(d) {
  try {
    return new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

const STATUS_COLOR = {
  present: "#1F4B43",
  absent: "#C2562A",
  half: "#B7791F",
  leave: "#6B7280",
};

export default function AttendancePage() {
  const [date, setDate] = useState(todayIst());
  const [entries, setEntries] = useState([]);
  const [openTimes, setOpenTimes] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function load(d) {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/attendance/day?date=${d}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load");
      setEntries(data.entries || []);
      setDirty(false);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const summary = useMemo(() => summarise(entries), [entries]);
  const unsaved = entries.filter((e) => !e.saved).length;

  function cycle(i) {
    setEntries((cur) => {
      const next = [...cur];
      const status = nextStatus(next[i].status);
      next[i] = { ...next[i], status, ...defaultTimes(status) };
      return next;
    });
    setDirty(true);
  }

  function setStatus(i, status) {
    setEntries((cur) => {
      const next = [...cur];
      next[i] = { ...next[i], status, ...defaultTimes(status) };
      return next;
    });
    setDirty(true);
  }

  function setTime(i, field, value) {
    setEntries((cur) => {
      const next = [...cur];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
    setDirty(true);
  }

  function markAllPresent() {
    setEntries((cur) =>
      cur.map((e) => ({ ...e, status: "present", ...defaultTimes("present") }))
    );
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/attendance/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, entries, source: "web" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setEntries(data.entries || []);
      setDirty(false);
      setMsg(`Saved ${data.saved} of ${entries.length} for ${prettyDate(date)}.`);
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
        subtitle="Mark the team for the day"
        right={
          // Marking the day and asking "so what do I owe them" are the same
          // errand ten seconds apart. Going home first to find it is a step
          // that gets skipped.
          <Link href="/summary" className="btn btn-ghost">
            Days &amp; wages
          </Link>
        }
      />
      <main className="page">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setDate(shiftDate(date, -1))}
          >
            ◀
          </button>
          <div style={{ textAlign: "center" }}>
            <strong>{prettyDate(date)}</strong>
            {date === todayIst() ? (
              <div className="muted" style={{ fontSize: "0.75rem" }}>
                today
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDate(todayIst())}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1F4B43",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                jump to today
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= todayIst()}
          >
            ▶
          </button>
        </div>

        {msg ? (
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            {msg}
          </p>
        ) : null}

        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={markAllPresent}
              disabled={loading}
            >
              Mark all present
            </button>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {entries.length} staff
              {unsaved ? ` · ${unsaved} not yet marked` : ""}
            </span>
          </div>

          {loading ? (
            <p className="muted">Loading roster…</p>
          ) : entries.length === 0 ? (
            <p className="muted">
              No active staff. Add them under Owner → Staff.
            </p>
          ) : (
            entries.map((e, i) => {
              const timed = e.status === "present" || e.status === "half";
              const badTime =
                timed &&
                (!isValidTime(e.in) || !isValidTime(e.out) || hoursFor(e) <= 0);
              return (
                <div
                  key={e.name}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    padding: "10px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => cycle(i)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        flex: 1,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: "1rem" }}>
                        {e.name}
                      </span>
                      <span
                        style={{
                          marginLeft: 10,
                          color: STATUS_COLOR[e.status],
                          fontWeight: 700,
                          fontSize: "0.9rem",
                        }}
                      >
                        {STATUS_LABEL[e.status]}
                      </span>
                      {!e.saved ? (
                        <span
                          className="muted"
                          style={{ marginLeft: 8, fontSize: "0.75rem" }}
                        >
                          unsaved
                        </span>
                      ) : null}
                    </button>

                    {timed ? (
                      <button
                        type="button"
                        onClick={() => setOpenTimes(openTimes === i ? null : i)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          color: badTime ? "#C2562A" : "#1F4B43",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.in || "--:--"}–{e.out || "--:--"} ✎
                      </button>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(i, s)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          border: `1px solid ${
                            e.status === s ? STATUS_COLOR[s] : "var(--line, #ddd)"
                          }`,
                          background: e.status === s ? STATUS_COLOR[s] : "#fff",
                          color: e.status === s ? "#fff" : "#555",
                        }}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                    {timed ? (
                      <span
                        className="muted"
                        style={{ fontSize: "0.78rem", alignSelf: "center" }}
                      >
                        {hoursFor(e)} hrs
                      </span>
                    ) : null}
                  </div>

                  {openTimes === i && timed ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        marginTop: 8,
                        alignItems: "center",
                      }}
                    >
                      <label style={{ fontSize: "0.8rem" }}>
                        In{" "}
                        <input
                          type="time"
                          value={e.in || ""}
                          onChange={(ev) => setTime(i, "in", ev.target.value)}
                        />
                      </label>
                      <label style={{ fontSize: "0.8rem" }}>
                        Out{" "}
                        <input
                          type="time"
                          value={e.out || ""}
                          onChange={(ev) => setTime(i, "out", ev.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}

                  {badTime ? (
                    <p
                      style={{
                        color: "#C2562A",
                        fontSize: "0.78rem",
                        margin: "6px 0 0",
                      }}
                    >
                      Check the in/out times.
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div
          className="card"
          style={{
            marginTop: 12,
            position: "sticky",
            bottom: 8,
            background: "#FBF8F2",
          }}
        >
          <div style={{ fontSize: "0.88rem", marginBottom: 8 }}>
            Present <strong>{summary.present}</strong> · Half{" "}
            <strong>{summary.half}</strong> · Absent{" "}
            <strong>{summary.absent}</strong> · Leave{" "}
            <strong>{summary.leave}</strong>
            <br />
            <span className="muted">Total {summary.hours} hrs</span>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={save}
            disabled={busy || loading || entries.length === 0}
            style={{ width: "100%" }}
          >
            {busy ? "Saving…" : "Save day"}
          </button>
        </div>
      </main>
    </div>
  );
}
