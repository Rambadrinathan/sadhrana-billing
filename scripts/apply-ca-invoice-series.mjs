/**
 * Apply SETUP_CA_INVOICE_SERIES.sql via Supabase Management API if
 * SUPABASE_ACCESS_TOKEN is set; otherwise print the SQL editor link.
 *
 *   set SUPABASE_ACCESS_TOKEN=sbp_...
 *   node scripts/apply-ca-invoice-series.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(
  path.join(root, "supabase/SETUP_CA_INVOICE_SERIES.sql"),
  "utf8"
);
const projectRef = "bkpynofvujxocvzudjba";
const token = process.env.SUPABASE_ACCESS_TOKEN || "";

console.log("SQL editor:", `https://supabase.com/dashboard/project/${projectRef}/sql/new`);
console.log("--- paste file supabase/SETUP_CA_INVOICE_SERIES.sql ---\n");

if (!token) {
  console.log("No SUPABASE_ACCESS_TOKEN — open the SQL editor and run the file once.");
  process.exit(0);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  }
);
const text = await res.text();
console.log(res.status, text.slice(0, 500));
process.exit(res.ok ? 0 : 1);
