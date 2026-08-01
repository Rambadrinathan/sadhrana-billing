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
