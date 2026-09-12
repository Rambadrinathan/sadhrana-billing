import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    // Vercel env pull sometimes embeds literal \r\n inside the quoted value.
    v = v
      .replace(/\\r\\n/g, "")
      .replace(/\\n/g, "")
      .replace(/\\r/g, "")
      .replace(/\\"/g, '"')
      .replace(/\r/g, "")
      .trim();
    out[k] = v;
  }
  return out;
}

const envPath = path.join(root, ".env.vercel.pull");
const env = parseEnvFile(envPath);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
console.log("url", url);
console.log("keylen", key && key.length, "dots", key && key.split(".").length);

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("bills")
  .select("bill_no, invoice_kind, bill_date")
  .order("created_at", { ascending: false })
  .limit(30);
console.log("bills_err", error && error.message);
for (const b of data || []) {
  console.log(`${b.invoice_kind || "?"} | ${b.bill_no} | ${b.bill_date}`);
}
const c1 = await sb.from("bill_counters").select("*");
console.log("bill_counters", JSON.stringify(c1.data), c1.error && c1.error.message);
const c2 = await sb.from("bill_series_counters").select("*");
console.log(
  "bill_series_counters",
  JSON.stringify(c2.data),
  c2.error && c2.error.message
);
