/**
 * One-shot: create two commission payouts for Mr. Rohit (New Delhi).
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local — same prod DB as Vercel.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const candidates = [".env.vercel.pull", ".env.local", ".env"];
  let loaded = false;
  for (const name of candidates) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      v = v.replace(/\\n/g, "\n").replace(/\\r/g, "").trim();
      // Vercel pull sometimes leaves stray whitespace inside JWT values
      if (/_KEY$|_TOKEN$|_URL$/.test(m[1])) {
        v = v.replace(/\s+/g, "");
      }
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
    loaded = true;
  }
  if (!loaded) throw new Error("Missing .env.vercel.pull / .env.local");
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function splitInclusive(totalInr, gstPct = 18) {
  const total = round2(totalInr);
  const taxable = round2(total / (1 + gstPct / 100));
  const gst = round2(total - taxable);
  return { total, taxable, gst, gstPct };
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Supabase URL/key missing in .env.local");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const amounts = [9000, 12000];

const created = [];
for (const amount of amounts) {
  const split = splitInclusive(amount, 18);
  const title = `Commission — Mr. Rohit (New Delhi)`;
  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      title,
      category: "commission",
      amount_inr: split.taxable,
      gst_amount_inr: split.gst,
      total_inr: split.total,
      expense_date: today,
      vendor: "Mr. Rohit",
      source: "web",
      created_by: "system",
    })
    .select()
    .single();
  if (error) throw new Error(`expense ${amount}: ${error.message}`);

  const { error: lineErr } = await supabase.from("expense_lines").insert({
    expense_id: expense.id,
    sort_order: 0,
    description: "Commission",
    qty: 1,
    unit: "job",
    unit_cost_inr: split.taxable,
    gst_pct: 18,
    amount_inr: split.taxable,
    hsn_sac: "998559",
  });
  if (lineErr) {
    console.warn(`line warn for ${expense.id}:`, lineErr.message);
  }

  created.push({
    id: expense.id,
    total: split.total,
    taxable: split.taxable,
    gst: split.gst,
    date: today,
    pdf: `https://sadhrana-billing.vercel.app/api/expenses/${expense.id}/pdf`,
  });
}

console.log(JSON.stringify({ ok: true, created }, null, 2));
