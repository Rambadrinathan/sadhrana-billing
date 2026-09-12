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
      prefix: `VJD/${stayFy}/`,
      floor: CA_SERIES_FLOOR.accommodation,
      pad: 3,
      format(n) {
        return `VJD/${stayFy}/${String(n).padStart(3, "0")}`;
      },
    };
  }
  // restaurant (F&B) and any other kind default to F&B series
  return {
    kind: "restaurant",
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

let caRpcReady = null; // null unknown · true CA migration present · false legacy

async function caSeriesRpcAvailable(supabase) {
  if (caRpcReady != null) return caRpcReady;
  // bill_series_counters only exists after SETUP_CA_INVOICE_SERIES.sql
  const probe = await supabase
    .from("bill_series_counters")
    .select("kind")
    .limit(1);
  caRpcReady = !probe.error;
  return caRpcReady;
}

/**
 * Allocate the next CA bill number for this supply type.
 * Prefers Postgres `next_bill_no_for` once the CA migration is applied;
 * otherwise max(CA floor, max VJD… in DB)+1 so we never burn the old SB counter.
 */
export async function allocateBillNo(supabase, kindKey) {
  const kind = invoiceKind(kindKey).key;
  const spec = caSeriesSpec(kind);

  if (await caSeriesRpcAvailable(supabase)) {
    const rpc = await supabase.rpc("next_bill_no_for", { p_kind: kind });
    if (!rpc.error && rpc.data && String(rpc.data).startsWith(spec.prefix)) {
      return String(rpc.data);
    }
  }

  // Fallback: highest serial already in this CA prefix, or the CA floor.
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
