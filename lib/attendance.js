import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

export async function getOpenAttendance(staffName) {
  if (!isSupabaseConfigured()) return null;
  const name = String(staffName || "").trim();
  if (!name) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("staff_name", name)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/could not find the table|attendance/i.test(error.message || "")) return null;
    throw new Error(error.message);
  }
  return data;
}

export async function clockIn({ staffName, staffId = null, chatId = null, source = "telegram" }) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const name = String(staffName || "").trim();
  if (!name) throw new Error("Staff name required");

  const open = await getOpenAttendance(name);
  if (open) {
    return {
      alreadyOpen: true,
      row: open,
      message: `${name} is already clocked in since ${fmtTime(open.clock_in)}. Use clock-out first.`,
    };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance")
    .insert({
      staff_name: name,
      staff_id: staffId || null,
      clock_in: new Date().toISOString(),
      date_ist: todayIst(),
      source,
      chat_id: chatId ? String(chatId) : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    alreadyOpen: false,
    row: data,
    message: `✅ ${name} clocked *in* at ${fmtTime(data.clock_in)} (IST)`,
  };
}

export async function clockOut({ staffName, chatId = null }) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const name = String(staffName || "").trim();
  if (!name) throw new Error("Staff name required");

  const open = await getOpenAttendance(name);
  if (!open) {
    return {
      noOpen: true,
      message: `${name} has no open shift. Clock in first.`,
    };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance")
    .update({
      clock_out: new Date().toISOString(),
      chat_id: chatId ? String(chatId) : open.chat_id,
    })
    .eq("id", open.id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const mins = Math.round(
    (new Date(data.clock_out) - new Date(data.clock_in)) / 60000
  );
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;

  return {
    noOpen: false,
    row: data,
    message: `⏹ ${name} clocked *out* at ${fmtTime(data.clock_out)} (IST)\nShift: ${hrs}h ${m}m (in ${fmtTime(data.clock_in)})`,
  };
}

export async function listAttendance({
  date = null,
  from = null,
  to = null,
  limit = 200,
} = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("attendance")
    .select("*")
    .order("clock_in", { ascending: false })
    .limit(limit);
  if (date) q = q.eq("date_ist", date);
  if (from) q = q.gte("date_ist", from);
  if (to) q = q.lte("date_ist", to);
  const { data, error } = await q;
  if (error) {
    if (/could not find the table|attendance/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export { fmtTime, todayIst };

/* ------------------------------------------------------------------ *
 * Supervisor roster marking (Munish marks the whole team for a day)
 * ------------------------------------------------------------------ */

/**
 * Save a whole day in one go. Upserts on (staff_name, date_ist) so re-marking
 * corrects the existing row instead of adding a second one.
 * entries: [{ name, staff_id, status, in, out }]
 */
export async function saveDayAttendance({
  date,
  entries = [],
  markedBy = null,
  source = "web",
}) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const { istToIso, validateDay, STATUSES } = await import(
    "@/lib/attendance-roster"
  );
  if (!date) throw new Error("Date required");

  const problems = validateDay(entries);
  if (problems.length) throw new Error(problems.join("; "));

  const rows = entries
    .filter((e) => e.name && STATUSES.includes(e.status))
    .map((e) => {
      const timed = e.status === "present" || e.status === "half";
      return {
        staff_name: String(e.name).trim(),
        staff_id: e.staff_id || null,
        status: e.status,
        clock_in: timed ? istToIso(date, e.in) : null,
        clock_out: timed ? istToIso(date, e.out) : null,
        date_ist: date,
        marked_by: markedBy || null,
        source,
      };
    });

  if (!rows.length) return { saved: 0 };

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "staff_name,date_ist" })
    .select();
  if (error) throw new Error(error.message);
  return { saved: (data || []).length, rows: data || [] };
}

/** The roster for a date: every active staff member, marked or not. */
export async function getDayRoster(date) {
  const { listStaff } = await import("@/lib/staff");
  const { buildDay } = await import("@/lib/attendance-roster");
  const [staff, saved] = await Promise.all([
    listStaff({ includeInactive: false }),
    listAttendance({ date }),
  ]);
  return buildDay(staff, saved);
}

/* ------------------------------------------------------------------ *
 * Punch model — Munish taps IN when someone arrives, OUT when they
 * leave. Times are real (now()), never pre-filled. Anyone with no row
 * for the day is absent by definition.
 * One row per person per day (unique staff_name, date_ist).
 * ------------------------------------------------------------------ */

/** Raw rows for a date, keyed by lowercased name. */
async function punchRowsFor(date) {
  const rows = await listAttendance({ date });
  const map = new Map();
  for (const r of rows) map.set(String(r.staff_name || "").toLowerCase(), r);
  return map;
}

/**
 * The day as Munish sees it: every active staff member with a derived state.
 * state: "out" (not arrived) | "in" (working) | "done" | "absent" | "leave"
 */
export async function getDayPunches(date) {
  const { listStaff } = await import("@/lib/staff");
  const [staff, map] = await Promise.all([
    listStaff({ includeInactive: false }),
    punchRowsFor(date),
  ]);
  return (staff || []).map((s) => {
    const r = map.get(String(s.name || "").toLowerCase());
    let state = "out";
    if (r) {
      if (r.status === "absent") state = "absent";
      else if (r.status === "leave") state = "leave";
      else if (r.clock_in && r.clock_out) state = "done";
      else if (r.clock_in) state = "in";
      else state = "absent";
    }
    return {
      staff_id: s.id || r?.staff_id || null,
      name: s.name,
      state,
      status: r?.status || null,
      clock_in: r?.clock_in || null,
      clock_out: r?.clock_out || null,
      in: r?.clock_in ? fmtTime(r.clock_in) : "",
      out: r?.clock_out ? fmtTime(r.clock_out) : "",
      marked: Boolean(r),
    };
  });
}

/** Tap IN — records the actual arrival time. */
export async function punchIn({ staffName, staffId = null, date = null, source = "telegram", chatId = null, markedBy = null }) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const name = String(staffName || "").trim();
  if (!name) throw new Error("Staff name required");
  const day = date || todayIst();
  const map = await punchRowsFor(day);
  const existing = map.get(name.toLowerCase());

  if (existing?.clock_in && !existing.clock_out) {
    return { ok: false, message: `${name} is already IN since ${fmtTime(existing.clock_in)}.` };
  }

  const supabase = getSupabase();
  const row = {
    staff_name: name,
    staff_id: staffId || existing?.staff_id || null,
    status: "present",
    clock_in: new Date().toISOString(),
    clock_out: null,
    date_ist: day,
    marked_by: markedBy || null,
    source,
    chat_id: chatId ? String(chatId) : null,
  };
  const { data, error } = await supabase
    .from("attendance")
    .upsert(row, { onConflict: "staff_name,date_ist" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, row: data, message: `${name} IN at ${fmtTime(data.clock_in)}` };
}

/** Tap OUT — records the actual departure time. */
export async function punchOut({ staffName, date = null, markedBy = null }) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const name = String(staffName || "").trim();
  const day = date || todayIst();
  const map = await punchRowsFor(day);
  const existing = map.get(name.toLowerCase());

  if (!existing || !existing.clock_in) {
    return { ok: false, message: `${name} was never clocked IN today.` };
  }
  if (existing.clock_out) {
    return { ok: false, message: `${name} already went OUT at ${fmtTime(existing.clock_out)}.` };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance")
    .update({ clock_out: new Date().toISOString(), marked_by: markedBy || existing.marked_by })
    .eq("id", existing.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const mins = Math.round(
    (new Date(data.clock_out) - new Date(data.clock_in)) / 60000
  );
  return {
    ok: true,
    row: data,
    message: `${name} OUT at ${fmtTime(data.clock_out)} · ${Math.floor(mins / 60)}h ${mins % 60}m`,
  };
}

/** Undo a mistaken tap — clears the person's row for the day. */
export async function punchClear({ staffName, date = null }) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const day = date || todayIst();
  const supabase = getSupabase();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("staff_name", String(staffName || "").trim())
    .eq("date_ist", day);
  if (error) throw new Error(error.message);
  return { ok: true, message: `${staffName} cleared for ${day}.` };
}

/** Set an explicit status (absent / leave), no times. */
export async function punchStatus({ staffName, status, date = null, markedBy = null }) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  if (!["absent", "leave"].includes(status)) throw new Error("Status must be absent or leave");
  const day = date || todayIst();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      {
        staff_name: String(staffName || "").trim(),
        status,
        clock_in: null,
        clock_out: null,
        date_ist: day,
        marked_by: markedBy || null,
        source: "telegram",
      },
      { onConflict: "staff_name,date_ist" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, row: data, message: `${data.staff_name} marked ${status}.` };
}

/**
 * End of day: everyone still untouched is recorded absent, so the day is a
 * complete record rather than a silence.
 */
export async function markRestAbsent({ date = null, markedBy = null }) {
  const day = date || todayIst();
  const rows = await getDayPunches(day);
  const pending = rows.filter((r) => !r.marked);
  for (const p of pending) {
    await punchStatus({ staffName: p.name, status: "absent", date: day, markedBy });
  }
  return { marked: pending.length, names: pending.map((p) => p.name) };
}
