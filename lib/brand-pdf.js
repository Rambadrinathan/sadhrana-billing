/**
 * Sadhrana Bagh visual brand for PDFs (from property photography).
 * Terracotta roof · deep wood · teal interior · sand courtyard · leaf canopy.
 */
import { rgb } from "pdf-lib";
import { PROPERTY } from "@/lib/config";
import fs from "fs";
import path from "path";

export const BRAND = {
  terracotta: rgb(0.77, 0.36, 0.15), // roof tiles #C45C26
  deepEarth: rgb(0.24, 0.17, 0.12), // wood beams #3D2B1F
  teal: rgb(0.18, 0.36, 0.34), // lounge sofas #2F5D56
  sand: rgb(0.95, 0.93, 0.89), // stone courtyard #F3EDE4
  leaf: rgb(0.25, 0.42, 0.29), // greenery #3F6B4A
  rug: rgb(0.64, 0.23, 0.17), // accent #A33B2B
  ink: rgb(0.11, 0.1, 0.09),
  muted: rgb(0.42, 0.4, 0.38),
  white: rgb(1, 1, 1),
  softTeal: rgb(0.9, 0.94, 0.93),
  line: rgb(0.78, 0.72, 0.65),
};

export function brandWebsite() {
  return (
    process.env.NEXT_PUBLIC_WEBSITE ||
    PROPERTY.website ||
    "https://www.sadhranabagh.com/"
  ).replace(/\/$/, "");
}

/** Helvetica WinAnsi-safe string */
export function winAnsi(str) {
  return String(str ?? "")
    .replace(/\u2192|\u21d2|\u27a1/g, "->")
    .replace(/[\u2013\u2014\u2212\u2010\u2011]/g, "-")
    .replace(/\u00b7|\u2022|\u2023|\u25cf/g, "-")
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/\u20b9/g, "Rs ")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadPublicImage(relPath) {
  try {
    const full = path.join(process.cwd(), "public", relPath);
    if (fs.existsSync(full)) return fs.readFileSync(full);
  } catch {
    /* continue */
  }
  try {
    const base =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://sadhrana-billing.vercel.app";
    const res = await fetch(
      `${base.replace(/\/$/, "")}/${String(relPath).replace(/^\//, "")}`
    );
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  } catch {
    /* continue */
  }
  return null;
}

export async function loadLogoBytes() {
  return loadPublicImage("logo.png");
}

/**
 * Dark earth footer with booking CTA + website + phone + email.
 * @returns height consumed from bottom (for layout clearance)
 */
export function drawBookingFooter(page, { font, fontBold, W, margin = 36 }) {
  const h = 78;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: W,
    height: h,
    color: BRAND.deepEarth,
  });
  // Terracotta accent strip
  page.drawRectangle({
    x: 0,
    y: h - 4,
    width: W,
    height: 4,
    color: BRAND.terracotta,
  });

  const text = (str, x, y, size, bold, color) => {
    const s = winAnsi(str).slice(0, 100);
    if (!s) return;
    page.drawText(s, {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  text(
    "For more information or to book a villa:",
    margin,
    54,
    8,
    true,
    BRAND.sand
  );
  text(
    `Call: ${PROPERTY.phone || "+91 92209 02135"}`,
    margin,
    40,
    9,
    true,
    BRAND.white
  );
  text(
    `Email: ${PROPERTY.email || "sadhranabagh@gmail.com"}`,
    margin + 200,
    40,
    9,
    false,
    BRAND.white
  );
  text(brandWebsite(), margin, 24, 10, true, BRAND.terracotta);
  text(
    `${PROPERTY.tradeName || "Sadhrana Bagh"}  |  Gurugram`,
    margin,
    12,
    7,
    false,
    BRAND.muted
  );
  return h;
}

/**
 * Top brand bar (title on terracotta or deep earth).
 */
export function drawBrandHeaderBar(
  page,
  { title, subtitle, font, fontBold, W, barH = 44, color = BRAND.terracotta }
) {
  page.drawRectangle({
    x: 0,
    y: 841.89 - barH,
    width: W,
    height: barH,
    color,
  });
  // teal accent under bar
  page.drawRectangle({
    x: 0,
    y: 841.89 - barH - 3,
    width: W,
    height: 3,
    color: BRAND.teal,
  });
  const text = (str, x, y, size, bold, col) => {
    const s = winAnsi(str).slice(0, 80);
    if (!s) return;
    page.drawText(s, {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color: col,
    });
  };
  text(title, 36, 841.89 - barH + 16, 14, true, BRAND.white);
  if (subtitle) {
    text(subtitle, 36 + Math.min(160, title.length * 8), 841.89 - barH + 18, 8, false, BRAND.sand);
  }
}
