// Branded Proforma Invoice (PDF). Usage:
//   node scripts/proforma-invoice.mjs [out.pdf]
// Edit the INVOICE block below, then run. Needs Chromium (playwright).
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const INVOICE = {
  no: "PI/VJD/26-27/01",
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
const party = (label) => `
  <div class="lbl">${label}</div>
  <div class="nm">${c.name}</div>
  <div>${c.address}</div>
  <table class="kv"><tr><td>State Name</td><td>: ${c.state}</td></tr>
  <tr><td>Place of Supply</td><td>: ${c.placeOfSupply}</td></tr>
  <tr><td>Contact</td><td>: ${c.contact}</td></tr></table>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;margin:0}
h1{text-align:center;font-size:16px;margin:0 0 3px}
.box{border:1px solid #444}
table{border-collapse:collapse;width:100%}
.top .kv td,.kv td{border:0!important;padding:0 6px 0 0;vertical-align:top}.kv td:first-child{width:105px;white-space:nowrap}
.top td{vertical-align:top;border:1px solid #444;padding:4px 6px}
.logo{width:70px;height:70px;border-radius:50%}
.co{font-size:13px;font-weight:bold}
.nm{font-weight:bold;font-size:13px;margin:1px 0}
.lbl{font-size:10px}
.items th{border:1px solid #444;padding:3px;font-weight:normal}
.items td{padding:3px 6px;vertical-align:top}
.items tr.body td{border-left:1px solid #444;border-right:1px solid #444;height:300px}
.r{text-align:right}.b{font-weight:bold}
.big{font-size:15px;font-weight:bold}
.sec{border:1px solid #444;border-top:0;padding:4px 6px}
</style></head><body>
<h1>Proforma Invoice</h1>
<table class="top"><tr>
<td rowspan="2" style="width:62%;padding:0">
  <table><tr><td style="border:0;width:84px"><img class="logo" src="${logo}"></td>
  <td style="border:0"><div class="co">VJ Development Ventures LLP</div>K-135, South City<br>Gurugram<br>
  GSTIN/UIN: 06AAPFV9671F1ZJ<br>State Name : Haryana, Code : 06<br>CIN: AAJ-4939</td></tr></table>
  <div style="border-top:1px solid #444;padding:4px 6px">${party("Consignee (Ship to)")}</div>
  <div style="border-top:1px solid #444;padding:4px 6px">${party("Buyer (Bill to)")}</div>
</td>
<td style="height:40px">Invoice No.<br><b>${INVOICE.no}</b></td>
<td>Dated<br><b>${INVOICE.date}</b></td></tr>
<tr><td colspan="2"></td></tr></table>
<table class="items" style="border:1px solid #444;border-top:0">
<tr><th style="width:28px">SI No.</th><th>Particulars</th><th style="width:70px">HSN/SAC</th><th style="width:50px">GST Rate</th><th style="width:120px">Amount</th></tr>
<tr class="body"><td>1</td>
<td><div class="b" style="font-size:12px">${INVOICE.description}</div>
<div class="r b" style="margin-top:14px">OUTPUT CGST</div><div class="r b">OUTPUT SGST</div>
<div style="margin-top:14px"><i>Less :</i> <b>ROUNDED OFF</b></div></td>
<td>${INVOICE.hsn}</td><td>${INVOICE.rate} %</td>
<td class="r b">${inr(t)}<br><br><div style="margin-top:2px">${inr(half)}</div><div>${inr(half)}</div><div style="margin-top:14px">(${roundOff < 0 ? "-" : "+"})${inr(Math.abs(roundOff))}</div></td></tr>
<tr><td colspan="4" class="r" style="border-top:1px solid #444">Total</td><td class="r big" style="white-space:nowrap;border-top:1px solid #444">₹ ${inr(total)}</td></tr></table>
<div class="sec">Amount Chargeable (in words) <span style="float:right"><i>E. &amp; O.E</i></span><br><b style="font-size:12px">${totalWords}</b></div>
<div class="sec r">Taxable Value<br>${inr(t)}<br><b>Total: ${inr(t)}</b></div>
<div class="sec">Tax Amount (in words) : <b style="font-size:12px">${taxWords}</b><br>Remarks:<br>&nbsp;<br>&nbsp;</div>
<table style="border:1px solid #444;border-top:0"><tr>
<td style="width:50%;padding:4px 6px;vertical-align:top">Company's PAN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <b>AAPFV9671F</b><br><br>Declaration<br>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</td>
<td style="padding:4px 6px;vertical-align:top;border-left:1px solid #444">Company's Bank Details<br>
<table class="kv"><tr><td>A/c Holder's Name</td><td>: <b>VJ Development Ventures LLP</b></td></tr>
<tr><td>Bank Name</td><td>: <b>AXIS BANK LTD.</b></td></tr><tr><td>A/c No.</td><td>: <b>922020001553016</b></td></tr>
<tr><td>Branch &amp; IFS Code</td><td>: <b>Sector-30, Gurgaon &amp; UTIB0001970</b></td></tr></table></td></tr>
<tr><td style="padding:4px 6px;border-top:1px solid #444;height:70px;vertical-align:top">Customer's Seal and Signature</td>
<td style="padding:4px 6px;border-top:1px solid #444;border-left:1px solid #444;vertical-align:top" class="r"><b>for VJ Development Ventures LLP</b><br><br><br><br>Authorised Signatory</td></tr></table>
<div style="text-align:center;margin-top:6px;font-size:12px">SUBJECT TO HARYANA JURISDICTION<br><span style="font-size:11px">This is a Computer Generated Invoice</span></div>
</body></html>`;

const out = path.resolve(process.argv[2] || "out/Proforma_Invoice_Rajat_Sharma.pdf");
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.pdf({ path: out, format: "A4", printBackground: true });
await browser.close();
console.log({ out, no: INVOICE.no, date: INVOICE.date, taxable: t, cgst: half, sgst: half, roundOff, total });
console.log(totalWords, "|", taxWords);
