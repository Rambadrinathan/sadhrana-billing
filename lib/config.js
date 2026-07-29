export const PROPERTY = {
  name: process.env.NEXT_PUBLIC_PROPERTY_NAME || "Sadhrana Bagh",
  phone: process.env.NEXT_PUBLIC_PROPERTY_PHONE || "+91 92209 02135",
  email: process.env.NEXT_PUBLIC_PROPERTY_EMAIL || "sadhranabagh@gmail.com",
  address:
    process.env.NEXT_PUBLIC_PROPERTY_ADDRESS ||
    "Sadhrana Village, near Sultanpur National Park, Gurugram",
  upi: process.env.NEXT_PUBLIC_UPI_ID || "",
  gstin: process.env.NEXT_PUBLIC_GSTIN || "",
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
