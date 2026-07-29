/**
 * Entity + branding from sample tax invoice:
 * VJD/RS/26-27/019 — VJ Development Ventures LLP
 * Menu: 5% GST on all F&B prices (CGST 2.5% + SGST 2.5%)
 * HSN/SAC 996331 restaurant service
 */
export const PROPERTY = {
  tradeName: process.env.NEXT_PUBLIC_PROPERTY_NAME || "Sadhrana Bagh",
  name: process.env.NEXT_PUBLIC_PROPERTY_NAME || "Sadhrana Bagh",
  legalName:
    process.env.NEXT_PUBLIC_LEGAL_NAME || "VJ Development Ventures LLP",
  address:
    process.env.NEXT_PUBLIC_PROPERTY_ADDRESS ||
    "K-135, South City, Gurugram, Haryana",
  phone: process.env.NEXT_PUBLIC_PROPERTY_PHONE || "+91 92209 02135",
  email: process.env.NEXT_PUBLIC_PROPERTY_EMAIL || "sadhranabagh@gmail.com",
  gstin: process.env.NEXT_PUBLIC_GSTIN || "06AAPFV9671F1ZJ",
  pan: process.env.NEXT_PUBLIC_PAN || "AAPFV9671F",
  cin: process.env.NEXT_PUBLIC_CIN || "AAJ-4939",
  stateName: "Haryana",
  stateCode: "06",
  upi: process.env.NEXT_PUBLIC_UPI_ID || "",
  // Bank (from sample invoice)
  bankName: process.env.NEXT_PUBLIC_BANK_NAME || "AXIS BANK LTD.",
  bankAccount: process.env.NEXT_PUBLIC_BANK_ACCOUNT || "922020001553016",
  bankBranch: process.env.NEXT_PUBLIC_BANK_BRANCH || "Sector-30, Gurgaon",
  bankIfsc: process.env.NEXT_PUBLIC_BANK_IFSC || "UTIB0001970",
  // Default tax
  defaultGstPct: 5,
  defaultHsn: "996331",
  cgstPct: 2.5,
  sgstPct: 2.5,
  invoicePrefix: process.env.INVOICE_PREFIX || "VJD/RS",
};

export const VILLAS = [
  "Bamboo House",
  "Beri House",
  "Kerala House",
  "The Library",
  "Other / shared",
];

export const CATEGORY_LABELS = {
  fnb: "Food & Beverage",
  experience: "Experiences",
  other: "Other",
};

export function formatInr(n) {
  const num = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatInrExact(n) {
  const num = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function amountInWords(n) {
  const num = Math.round(Number(n) || 0);
  if (num === 0) return "Zero Only";
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function two(n) {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  }
  function three(n) {
    if (n < 100) return two(n);
    return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "");
  }
  let out = "";
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num / 100000) % 100);
  const thousand = Math.floor((num / 1000) % 100);
  const rest = num % 1000;
  if (crore) out += three(crore) + " Crore ";
  if (lakh) out += two(lakh) + " Lakh ";
  if (thousand) out += two(thousand) + " Thousand ";
  if (rest) out += three(rest) + " ";
  return ("INR " + out.trim() + " Only").replace(/\s+/g, " ");
}
