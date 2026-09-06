const fs = require("fs");
const path = require("path");
const { createJiti } = require("jiti");

const root = path.join(__dirname, "..");

// Load public brand env if present (optional — config has defaults)
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

const expenses = [
  {
    id: "3c8da375-1632-4291-b9c8-57ffbe057129",
    title: "Commission — Mr. Rohit (New Delhi)",
    category: "commission",
    vendor: "Mr. Rohit",
    expense_date: "2026-09-06",
    amount_inr: 7627.12,
    gst_amount_inr: 1372.88,
    total_inr: 9000,
  },
  {
    id: "06fce0ef-180a-41f7-8a22-e35003dff76a",
    title: "Commission — Mr. Rohit (New Delhi)",
    category: "commission",
    vendor: "Mr. Rohit",
    expense_date: "2026-09-06",
    amount_inr: 10169.49,
    gst_amount_inr: 1830.51,
    total_inr: 12000,
  },
];

async function main() {
  const jiti = createJiti(__filename, {
    alias: { "@": root },
    interopDefault: true,
  });
  const mod = jiti(path.join(root, "lib/commission-settlement-pdf.js"));
  const build = mod.buildCommissionSettlementPdf || mod.default;

  const outDir = path.join(root, "tmp-commission-pdfs");
  fs.mkdirSync(outDir, { recursive: true });

  for (const expense of expenses) {
    const buf = await build(expense, {
      payee: "Mr. Rohit",
      city: "New Delhi",
      note: "Commission",
    });
    const fname = `Commission-Rohit-${Number(expense.total_inr)}-${expense.expense_date}.pdf`;
    const out = path.join(outDir, fname);
    fs.writeFileSync(out, Buffer.from(buf));
    console.log("wrote", out, Buffer.from(buf).length);
  }
  console.log("FOLDER=" + outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
