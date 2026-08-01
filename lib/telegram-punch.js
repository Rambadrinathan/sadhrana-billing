/**
 * Telegram attendance punch board.
 *
 * Munish taps IN when someone arrives and OUT when they leave. Every tap
 * writes straight to the day's record — there is no draft and no Save step,
 * because a clock-in must be true at the moment it is tapped.
 * Anyone never tapped IN is absent by definition.
 */

import { sendPlain, sendRich, rosterKeyboard } from "@/lib/telegram";
import { getDayPunches } from "@/lib/attendance";
import { listStaff } from "@/lib/staff";

export function hrsMins(a, b) {
  if (!a || !b) return "";
  const mins = Math.round((new Date(b) - new Date(a)) / 60000);
  if (mins <= 0) return "";
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** Group the day into what Munish actually needs to see. */
export function groupPunches(rows) {
  return {
    working: rows.filter((r) => r.state === "in"),
    done: rows.filter((r) => r.state === "done"),
    away: rows.filter((r) => r.state === "absent" || r.state === "leave"),
    pending: rows.filter((r) => r.state === "out"),
  };
}

export function formatPunchBoard(date, rows, note = "") {
  const g = groupPunches(rows);
  const lines = [`🕒 *Attendance · ${date}*`];

  if (g.working.length) {
    lines.push("");
    lines.push("*Working now*");
    for (const r of g.working) lines.push(`▶ *${r.name}* — in ${r.in}`);
  }
  if (g.done.length) {
    lines.push("");
    lines.push("*Finished*");
    for (const r of g.done) {
      const dur = hrsMins(r.clock_in, r.clock_out);
      lines.push(`✓ *${r.name}* — ${r.in}–${r.out}${dur ? ` · ${dur}` : ""}`);
    }
  }
  if (g.away.length) {
    lines.push("");
    lines.push("*Absent / leave*");
    for (const r of g.away) {
      lines.push(`✖ ${r.name}${r.state === "leave" ? " (leave)" : ""}`);
    }
  }
  if (g.pending.length) {
    lines.push("");
    lines.push("*Not arrived yet*");
    for (const r of g.pending) lines.push(`· ${r.name}`);
  }

  lines.push("");
  lines.push(
    `In ${g.working.length} · Done ${g.done.length} · Absent ${g.away.length} · Awaited ${g.pending.length}`
  );
  if (note) {
    lines.push("");
    lines.push(note);
  }
  lines.push("");
  lines.push("_Tap a name to clock IN. Tap again to clock OUT. Saved instantly._");

  return lines.join("\n");
}

export async function sendPunchBoard(chatId, date, note = "") {
  let rows;
  try {
    rows = await getDayPunches(date);
  } catch (e) {
    await sendPlain(chatId, "Could not load attendance: " + (e.message || e));
    return;
  }
  if (!rows.length) {
    await sendPlain(chatId, "No active staff. Add them under Owner -> Staff.");
    return;
  }
  await sendRich(chatId, formatPunchBoard(date, rows, note), {
    reply_markup: rosterKeyboard(rows),
  });
}

/**
 * Button labels are truncated to fit Telegram, so map a fragment back to the
 * real staff row. Exact match wins, then unique prefix.
 */
export async function resolveStaffName(fragment) {
  const staff = await listStaff({ includeInactive: false });
  const f = String(fragment || "").trim().toLowerCase();
  if (!f) return null;
  const exact = staff.find((s) => String(s.name).toLowerCase() === f);
  if (exact) return exact;
  const pref = staff.filter((s) => String(s.name).toLowerCase().startsWith(f));
  return pref.length === 1 ? pref[0] : pref[0] || null;
}
