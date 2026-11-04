// Branded Proforma Invoice (PDF). Usage:
//   node scripts/proforma-invoice.mjs [out.pdf]
// Edit the INVOICE block below, then run. Needs Chromium (playwright).
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const INVOICE = {
  no: "PI/VJD/26-27/46",
  date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-"),
  customer: {
    name: "RAJAT SHARMA",
    address: "S-39, First Floor, S-Block, Greater Kailash - 2, New Delhi",
    state: "Delhi, Code : 07",
    placeOfSupply: "Haryana",
    contact: "9811323679",
  },
  taxable: 358530, // GST 18% added on top (9% CGST + 9% SGST)
  rate: 18,
  hsn: "997212",
  description: "SALE OF RENTAL SERVICES ON IMMOVABLE PROPERTY",
};

const inr = (n) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function words(n) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""));
  const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + two(x % 100) : "") : two(x));
  let out = [];
  const cr = Math.floor(n / 1e7), lk = Math.floor((n % 1e7) / 1e5), th = Math.floor((n % 1e5) / 1e3), rest = n % 1e3;
  if (cr) out.push(two(cr) + " Crore");
  if (lk) out.push(two(lk) + " Lakh");
  if (th) out.push(two(th) + " Thousand");
  if (rest) out.push(three(rest));
  return out.join(" ") || "Zero";
}

const t = INVOICE.taxable;
const half = Math.round((t * INVOICE.rate) / 2 / 100 * 100) / 100; // 32267.70
const gross = t + half * 2;
const total = Math.round(gross);
const roundOff = Math.round((total - gross) * 100) / 100; // -0.40
const taxPaise = Math.round(half * 2 * 100);
const taxWords = `INR ${words(Math.floor(taxPaise / 100))}${taxPaise % 100 ? " and " + words(taxPaise % 100) + " paise" : ""} Only`;
const totalWords = `INR ${words(total)} Only`;

const logo = "data:image/png;base64," + fs.readFileSync(path.resolve("public/logo.png")).toString("base64");
const c = INVOICE.customer;
const same = true; // consignee == buyer
const party = (label) => `
  <div class="card">
    <div class="eyebrow">${label}</div>
    <div class="pname">${c.name}</div>
    <div class="paddr">${c.address}</div>
    <div class="pmeta"><span>State</span><b>${c.state}</b></div>
    <div class="pmeta"><span>Place of Supply</span><b>${c.placeOfSupply}</b></div>
    <div class="pmeta"><span>Contact</span><b>${c.contact}</b></div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap">
<style>
@page{size:A4;margin:0}
:root{--green:#1F4B43;--cream:#FBF8F2;--mint:#E7EFEC;--line:#DDD7CC;--muted:#6B6B66;--ink:#22201E;--terra:#C2562A}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm;height:297mm}
body{font-family:Inter,"Segoe UI",system-ui,sans-serif;font-size:11px;color:var(--ink);background:var(--cream);
 -webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;flex-direction:column}
.serif{font-family:"Cormorant Garamond",Georgia,serif}
.eyebrow{font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.head{background:var(--green);color:var(--cream);padding:9mm 12mm;display:flex;align-items:center;gap:6mm}
.head img{width:23mm;height:23mm;border-radius:50%;background:#fff;border:1.5px solid rgba(251,248,242,.6)}
.brand{flex:1}
.brand .w{font-size:25px;font-weight:600;letter-spacing:.14em;line-height:1.1}
.brand .s{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(251,248,242,.75);margin-top:4px}
.brand .a{font-size:9.5px;line-height:1.55;color:rgba(251,248,242,.85);margin-top:7px}
.title{text-align:right}
.title h1{font-size:30px;font-weight:600;letter-spacing:.06em;line-height:1}
.title p{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:rgba(251,248,242,.72);margin-top:6px}
.accent{height:3px;background:var(--terra)}
.main{padding:7mm 12mm 0;flex:1;display:flex;flex-direction:column;gap:5mm}
.meta{display:flex;background:var(--mint);border-radius:4px}
.meta div{flex:1;padding:8px 12px;border-right:1px solid #fff}.meta div:last-child{border:0}
.meta b{display:block;font-size:13px;margin-top:3px;color:var(--green)}
.parties{display:flex;gap:5mm}.card{flex:1;border:1px solid var(--line);border-radius:4px;padding:10px 12px;background:#fff}
.pname{font-size:19px;font-weight:700;color:var(--green);margin:4px 0 2px}
.paddr{color:var(--ink);line-height:1.45;margin-bottom:6px}
.pmeta{display:flex;justify-content:space-between;padding:2.5px 0;border-top:1px solid #efeae0}
.pmeta span{color:var(--muted)}
table.items{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:4px}
.items thead th{background:var(--green);color:var(--cream);font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;padding:8px 10px;text-align:left}
.items td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.r{text-align:right!important;font-variant-numeric:tabular-nums}
.items td.d b{font-size:12px;color:var(--green)}
.items td .sub{color:var(--muted);font-size:10px;margin-top:2px}
.lower{display:flex;gap:6mm;align-items:flex-start}
.words{flex:1}
.words .box{background:var(--mint);border-radius:4px;padding:9px 12px;margin-bottom:8px}
.words .box b{display:block;font-size:11.5px;color:var(--green);margin-top:3px;line-height:1.35}
.totals{width:75mm;background:#fff;border:1px solid var(--line);border-radius:4px;padding:6px 12px}
.totals .row{display:flex;justify-content:space-between;padding:4px 0;font-variant-numeric:tabular-nums}
.totals .row span:first-child{color:var(--muted)}
.totals .grand{border-top:1px solid var(--line);border-bottom:3px double var(--line);margin-top:4px;padding:8px 0;align-items:center}
.totals .grand span:first-child{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--green)}
.totals .grand span:last-child{font-size:21px;font-weight:700;color:var(--terra);letter-spacing:.02em}
.info{display:flex;gap:5mm}.info .card{background:#fff}
.bank .kv{display:flex;padding:2.5px 0}.bank .kv span{width:92px;color:var(--muted)}.bank .kv b{flex:1}
.decl{font-size:9.5px;color:var(--muted);line-height:1.5;margin-top:5px}
.sign{display:flex;gap:5mm;margin-top:auto;padding-bottom:5mm}
.sign>div{flex:1;border-top:1px solid var(--ink);padding-top:6px;height:24mm;font-size:10px}
.sign .co{text-align:right}.sign .co b{color:var(--green)}
.foot{background:var(--green);color:var(--cream);padding:7px 12mm;font-size:9px;letter-spacing:.04em;display:flex;justify-content:space-between}
.foot span:nth-child(2){text-align:center;opacity:.8}
</style></head><body>
<div class="head">
  <img src="${logo}">
  <div class="brand serif"><div class="w">SADHRANA BAGH</div>
    <div class="s" style="font-family:Inter">VJ Development Ventures LLP</div>
    <div class="a" style="font-family:Inter">K-135, South City, Gurugram, Haryana<br>GSTIN 06AAPFV9671F1ZJ &nbsp;·&nbsp; PAN AAPFV9671F &nbsp;·&nbsp; CIN AAJ-4939</div></div>
  <div class="title serif"><h1>Proforma<br>Invoice</h1><p style="font-family:Inter">Not a tax invoice</p></div>
</div>
<div class="accent"></div>
<div class="main">
  <div class="meta">
    <div><span class="eyebrow">Invoice No.</span><b>${INVOICE.no}</b></div>
    <div><span class="eyebrow">Date</span><b>${INVOICE.date}</b></div>
    <div><span class="eyebrow">Place of Supply</span><b>${c.placeOfSupply} (06)</b></div>
    <div><span class="eyebrow">Currency</span><b>INR (₹)</b></div>
  </div>
  <div class="parties">${party("Buyer · Bill to")}${party("Consignee · Ship to")}</div>
  <table class="items"><thead><tr><th style="width:8mm">#</th><th>Particulars</th><th style="width:20mm">HSN/SAC</th><th class="r" style="width:16mm">GST</th><th class="r" style="width:34mm">Amount (₹)</th></tr></thead>
  <tbody>
   <tr><td>1</td><td class="d"><b>${INVOICE.description.replace("SALE OF RENTAL","Sale of Rental").replace("SERVICES ON IMMOVABLE PROPERTY","Services on Immovable Property")}</b></td><td>${INVOICE.hsn}</td><td class="r">${INVOICE.rate}%</td><td class="r">${inr(t)}</td></tr>
   <tr><td></td><td>Output CGST @ ${INVOICE.rate / 2}%</td><td></td><td></td><td class="r">${inr(half)}</td></tr>
   <tr><td></td><td>Output SGST @ ${INVOICE.rate / 2}%</td><td></td><td></td><td class="r">${inr(half)}</td></tr>
   <tr><td></td><td><i>Less:</i> Rounded off</td><td></td><td></td><td class="r">(${roundOff < 0 ? "-" : "+"})${inr(Math.abs(roundOff))}</td></tr>
  </tbody></table>
  <div class="lower">
    <div class="words">
      <div class="box"><span class="eyebrow">Amount chargeable (in words)</span><b>${totalWords}</b></div>
      <div class="box" style="background:#fff;border:1px solid var(--line)"><span class="eyebrow">Tax amount (in words)</span><b>${taxWords}</b></div>
    </div>
    <div class="totals">
      <div class="row"><span>Taxable value</span><span>${inr(t)}</span></div>
      <div class="row"><span>CGST ${INVOICE.rate / 2}%</span><span>${inr(half)}</span></div>
      <div class="row"><span>SGST ${INVOICE.rate / 2}%</span><span>${inr(half)}</span></div>
      <div class="row"><span>Round off</span><span>(${roundOff < 0 ? "-" : "+"})${inr(Math.abs(roundOff))}</span></div>
      <div class="row grand"><span>Total</span><span class="serif">₹ ${inr(total)}</span></div>
    </div>
  </div>
  <div class="info">
    <div class="card bank"><div class="eyebrow" style="margin-bottom:5px">Company's bank details</div>
      <div class="kv"><span>A/c holder</span><b>VJ Development Ventures LLP</b></div>
      <div class="kv"><span>Bank</span><b>AXIS BANK LTD.</b></div>
      <div class="kv"><span>A/c no.</span><b>922020001553016</b></div>
      <div class="kv"><span>Branch &amp; IFSC</span><b>Sector-30, Gurgaon &amp; UTIB0001970</b></div></div>
    <div class="card"><div class="eyebrow" style="margin-bottom:5px">Remarks</div><div style="height:12mm"></div>
      <div class="eyebrow">Declaration</div><div class="decl">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. E. &amp; O.E.</div></div>
  </div>
  <div class="sign"><div>Customer's seal and signature</div><div class="co"><b>for VJ Development Ventures LLP</b><br><br><br>Authorised Signatory</div></div>
</div>
<div class="foot"><span>www.sadhranabagh.com</span><span>Subject to Haryana jurisdiction · This is a computer generated invoice</span><span>sadhranabagh@gmail.com · +91 92209 02135</span></div>
</body></html>`;

const out = path.resolve(process.argv[2] || "out/Proforma_Invoice_Rajat_Sharma.pdf");
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log({ out, no: INVOICE.no, date: INVOICE.date, taxable: t, cgst: half, sgst: half, roundOff, total });
console.log(totalWords, "|", taxWords);
