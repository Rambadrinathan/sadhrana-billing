/**
 * Fetch Rohit commission expenses from Supabase and write settlement PDFs
 * into tmp-commission-pdfs/ using the app's PDF builder (via jiti + @ alias).
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  for (const name of [".env.vercel.pull", ".env.local"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      v = v.replace(/\\n/g, "\n").trim();
      if (/_KEY$|_TOKEN$|_URL$|_PIN$/.test(m[1])) v = v.replace(/\s+/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

loadEnv();

const ids = [
  "3c8da375-1632-4291-b9c8-57ffbe057129",
  "06fce0ef-180a-41f7-8a22-e35003dff76a",
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\s+/g, ""),
  { auth: { persistSession: false } }
);

const { data: expenses, error } = await supabase
  .from("expenses")
  .select("*")
  .in("id", ids);
if (error) throw error;
if (!expenses?.length) throw new Error("No expenses found");

// Resolve @/ → project root for the PDF module graph
const require = createRequire(import.meta.url);
const Module = require("module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(root, request.slice(2));
  }
  return orig.call(this, request, parent, isMain, options);
};

const { buildCommissionSettlementPdf } = await import(
  pathToFileURL(path.join(root, "lib/commission-settlement-pdf.js")).href
);

const outDir = path.join(root, "tmp-commission-pdfs");
fs.mkdirSync(outDir, { recursive: true });

for (const expense of expenses) {
  let city = "New Delhi";
  const m = String(expense.title || "").match(/\(([^)]+)\)\s*$/);
  if (m) city = m[1];
  const buf = await buildCommissionSettlementPdf(expense, {
    payee: expense.vendor || "Mr. Rohit",
    city,
    note: "Commission",
  });
  const fname = `Commission-Rohit-${Number(expense.total_inr)}-${expense.expense_date}.pdf`;
  const out = path.join(outDir, fname);
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length);
}

console.log("FOLDER=" + outDir);
