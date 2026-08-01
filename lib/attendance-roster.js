/**
 * Supervisor-marked attendance. Munish marks the whole team for a day;
 * nobody self-punches. Pure helpers — no I/O.
 */

export const STATUSES = ["present", "absent", "half", "leave"];

export const STATUS_LABEL = {
  present: "Present",
  absent: "Absent",
  half: "Half day",
  leave: "Leave",
};

export const STATUS_MARK = {
  present: "●",
  absent: "○",
  half: "◐",
  leave: "◌",
};

/** Standard shift. Half day ends at lunch. Overridable per person per day. */
export const SHIFT = {
  start: process.env.NEXT_PUBLIC_SHIFT_START || "09:00",
  end: process.env.NEXT_PUBLIC_SHIFT_END || "18:00",
  halfEnd: process.env.NEXT_PUBLIC_SHIFT_HALF_END || "13:00",
};

export function nextStatus(current) {
  const i = STATUSES.indexOf(current);
  return STATUSES[(i + 1) % STATUSES.length];
}

/** Times a status implies by default. Absent/leave carry none. */
export function defaultTimes(status) {
  if (status === "present") return { in: SHIFT.start, out: SHIFT.end };
  if (status === "half") return { in: SHIFT.start, out: SHIFT.halfEnd };
  return { in: "", out: "" };
}

export function isValidTime(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ""));
}

/** Hours worked, or 0 when times are missing/invalid/reversed. */
export function hoursFor(entry) {
  if (entry.status === "absent" || entry.status === "leave") return 0;
  if (!isValidTime(entry.in) || !isValidTime(entry.out)) return 0;
  const [h1, m1] = entry.in.split(":").map(Number);
  const [h2, m2] = entry.out.split(":").map(Number);
  const mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins <= 0) return 0;
  return Math.round((mins / 60) * 100) / 100;
}

/** Build the day's rows from the roster plus whatever is already saved. */
export function buildDay(staff, saved = []) {
  const byName = new Map(
    saved.map((r) => [String(r.staff_name || "").toLowerCase(), r])
  );
  return (staff || []).map((s) => {
    const row = byName.get(String(s.name || "").toLowerCase());
    if (!row) {
      // Nobody is present until someone says so. Pre-filling 09:00-18:00 here
      // invented attendance for people who never turned up.
      return {
        staff_id: s.id || null,
        name: s.name,
        status: "absent",
        ...defaultTimes("absent"),
        saved: false,
      };
    }
    const status = STATUSES.includes(row.status) ? row.status : "present";
    return {
      staff_id: s.id || row.staff_id || null,
      name: s.name,
      status,
      in: hhmm(row.clock_in),
      out: hhmm(row.clock_out),
      saved: true,
    };
  });
}

/** Timestamp -> "HH:MM" in IST. */
export function hhmm(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * "2026-08-01" + "09:00" -> ISO instant.
 * IST is UTC+5:30 with no DST, so a fixed offset is correct and avoids
 * depending on the server's timezone.
 */
export function istToIso(dateStr, time) {
  if (!dateStr || !isValidTime(time)) return null;
  return new Date(`${dateStr}T${time}:00+05:30`).toISOString();
}

export function summarise(entries) {
  const out = { present: 0, absent: 0, half: 0, leave: 0, hours: 0 };
  for (const e of entries || []) {
    if (out[e.status] !== undefined) out[e.status] += 1;
    out.hours += hoursFor(e);
  }
  out.hours = Math.round(out.hours * 100) / 100;
  out.marked = (entries || []).length;
  return out;
}

/** One-line summary for Telegram / headers. */
export function summaryLine(entries) {
  const s = summarise(entries);
  return `Present ${s.present} · Half ${s.half} · Absent ${s.absent} · Leave ${s.leave} · ${s.hours} hrs`;
}

/** Validate before save. Returns array of human-readable problems. */
export function validateDay(entries) {
  const problems = [];
  for (const e of entries || []) {
    if (!STATUSES.includes(e.status)) {
      problems.push(`${e.name}: unknown status`);
      continue;
    }
    if (e.status === "present" || e.status === "half") {
      if (!isValidTime(e.in) || !isValidTime(e.out)) {
        problems.push(`${e.name}: needs both in and out times`);
      } else if (hoursFor(e) <= 0) {
        problems.push(`${e.name}: out time must be after in time`);
      }
    }
  }
  return problems;
}
