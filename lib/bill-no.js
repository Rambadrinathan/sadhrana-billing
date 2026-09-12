/**
 * CA invoice series (locked 2026-09 from accountant):
 *
 *   Stay / Room  →  VJD/2026_27/NNN     (last issued 035 → next 036)
 *   F&B          →  VJD/RS/26_27/NNN    (last issued 030 → next 031)
 *
 * Underscores in the FY segment match the CA paper exactly (not hyphens).
 * Old app numbers (SB-2026-… / SB/STAY/…) remain on historical rows only.
 */
import { invoiceKind } from "@/lib/config";

/** Last numbers the CA has already issued — counters start AFTER these. */
export const CA_SERIES_FLOOR = {
  accommodation: 35, // VJD/2026_27/035 issued
  restaurant: 30, // VJD/RS/26_27/030 issued
};

/**
 * Indian FY labels as the CA prints them.
 * Stay uses full start year; F&B uses two-digit start year.
 */
export function caFyLabels(date = new Date()) {
  const ist = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const y = ist.getFullYear();
  const m = ist.getMonth() + 1; // 1–12
  const startY = m >= 4 ? y : y - 1;
  const endYY = String(startY + 1).slice(-2);
  return {
    stayFy: `${startY}_${endYY}`, // 2026_27
    fnbFy: `${String(startY).slice(-2)}_${endYY}`, // 26_27
  };
}

export function caSeriesSpec(kindKey) {
  const kind = invoiceKind(kindKey).key;
  const { stayFy, fnbFy } = caFyLabels();
  if (kind === "accommodation") {
    return {
      kind,
      fy: stayFy,
      prefix: `VJD/${stayFy}/`,
      floor: CA_SERIES_FLOOR.accommodation,
      pad: 3,
      format(n) {
        return `VJD/${stayFy}/${String(n).padStart(3, "0")}`;
      },
    };
  }
  return {
    kind: "restaurant",
    fy: fnbFy,
    prefix: `VJD/RS/${fnbFy}/`,
    floor: CA_SERIES_FLOOR.restaurant,
    pad: 3,
    format(n) {
      return `VJD/RS/${fnbFy}/${String(n).padStart(3, "0")}`;
    },
  };
}

function parseSerial(billNo, prefix) {
  if (!billNo || !String(billNo).startsWith(prefix)) return null;
  const tail = String(billNo).slice(prefix.length);
  const n = parseInt(tail, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Increment bill_series_counters with optimistic locking.
 * Avoids the legacy next_bill_no_for(text) RPC (had ambiguous "fy").
 */
async function allocateViaCounterTable(supabase, spec) {
  // Ensure row exists at CA floor
  await supabase.from("bill_series_counters").upsert(
    { kind: spec.kind, fy: spec.fy, last_n: spec.floor },
    { onConflict: "kind,fy", ignoreDuplicates: true }
  );

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: row, error: readErr } = await supabase
      .from("bill_series_counters")
      .select("last_n")
      .eq("kind", spec.kind)
      .eq("fy", spec.fy)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const current = Math.max(spec.floor, Number(row?.last_n) || spec.floor);
    const next = current + 1;

    const { data: updated, error: updErr } = await supabase
      .from("bill_series_counters")
      .update({ last_n: next })
      .eq("kind", spec.kind)
      .eq("fy", spec.fy)
      .eq("last_n", current) // optimistic lock
      .select("last_n")
      .maybeSingle();

    if (updErr) throw new Error(updErr.message);
    if (updated && Number(updated.last_n) === next) {
      return spec.format(next);
    }
    // Lost the race — retry
  }
  throw new Error("Could not allocate bill number (counter busy)");
}

/**
 * Fallback when counters table is missing: max(CA floor, max VJD… in bills)+1.
 */
async function allocateViaBillScan(supabase, spec) {
  const { data: rows, error } = await supabase
    .from("bills")
    .select("bill_no")
    .like("bill_no", `${spec.prefix}%`)
    .order("bill_no", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not allocate bill number: " + error.message);

  let maxN = spec.floor;
  for (const r of rows || []) {
    const n = parseSerial(r.bill_no, spec.prefix);
    if (n != null && n > maxN) maxN = n;
  }
  return spec.format(maxN + 1);
}

/**
 * Allocate the next CA bill number for this supply type.
 */
export async function allocateBillNo(supabase, kindKey) {
  const kind = invoiceKind(kindKey).key;
  const spec = caSeriesSpec(kind);

  // Prefer counter table (present after SETUP_CA_INVOICE_SERIES.sql).
  const probe = await supabase
    .from("bill_series_counters")
    .select("kind")
    .limit(1);
  if (!probe.error) {
    return allocateViaCounterTable(supabase, spec);
  }

  return allocateViaBillScan(supabase, spec);
}
