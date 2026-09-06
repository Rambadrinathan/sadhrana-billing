/**
 * Write Rohit commission settlement PDFs to tmp-commission-pdfs/
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { createJiti } = require("jiti");

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

async function main() {
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

  const jiti = createJiti(__filename, {
    alias: { "@": root },
    interopDefault: true,
  });
  const { buildCommissionSettlementPdf } = jiti(
    path.join(root, "lib/commission-settlement-pdf.js")
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
