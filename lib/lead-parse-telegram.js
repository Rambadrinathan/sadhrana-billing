/**
 * Parse free-form / multi-line Telegram lead pastes into structured fields.
 */
import { parseVillaList } from "@/lib/config";

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parse ranges like:
 * "July 30 to Aug 01, 2026"
 * "30 Jul - 1 Aug 2026"
 * "2026-07-30 to 2026-08-01"
 */
export function parseDateRange(text) {
  const t = String(text || "");
  // ISO
  const iso = t.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:to|–|-|until|thru|through)\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (iso) return { check_in: iso[1], check_out: iso[2] };

  // Month name day to Month day, year
  const re =
    /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|–|-|until)\s*([A-Za-z]+)?\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i;
  const m = t.match(re);
  if (m) {
    const y = Number(m[5]) || new Date().getFullYear();
    const m1 = MONTHS[m[1].toLowerCase()];
    const m2 = MONTHS[(m[3] || m[1]).toLowerCase()];
    const d1 = Number(m[2]);
    const d2 = Number(m[4]);
    if (m1 && m2 && d1 && d2) {
      return { check_in: ymd(y, m1, d1), check_out: ymd(y, m2, d2) };
    }
  }

  // "30 July to 1 August 2026"
  const re2 =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s*(?:to|–|-)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:,?\s*(\d{4}))?/i;
  const m2 = t.match(re2);
  if (m2) {
    const y = Number(m2[5]) || new Date().getFullYear();
    const mo1 = MONTHS[m2[2].toLowerCase()];
    const mo2 = MONTHS[m2[4].toLowerCase()];
    if (mo1 && mo2) {
      return {
        check_in: ymd(y, mo1, Number(m2[1])),
        check_out: ymd(y, mo2, Number(m2[3])),
      };
    }
  }

  return { check_in: null, check_out: null };
}

/**
 * @param {string} raw - full message after /lead
 */
export function parseLeadTelegramText(raw) {
  const text = String(raw || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let name = null;
  let phone = null;
  let email = null;
  let notes = [];
  let preferred_dates = null;
  let villaHint = "";
  let enquiry_type = "stay";

  // Pipe format: Name | phone | type | b2c | notes
  if (text.includes("|") && lines.length === 1) {
    const parts = text.split("|").map((p) => p.trim());
    name = parts[0] || null;
    phone = parts[1] || null;
    if (parts[2] && /stay|event|fnb|other/i.test(parts[2])) {
      enquiry_type = parts[2].toLowerCase();
    }
    let restStart = 3;
    let customer_segment = null;
    if (parts[3] && /^(b2b|b2c)$/i.test(parts[3])) {
      customer_segment = parts[3].toLowerCase();
      restStart = 4;
    }
    notes = parts.slice(restStart).join(" | ");
    const dates = parseDateRange(notes);
    const villas = parseVillaList(notes + " " + text);
    return {
      name,
      phone,
      email,
      notes: notes || null,
      enquiry_type,
      customer_segment,
      preferred_dates: notes,
      check_in: dates.check_in,
      check_out: dates.check_out,
      villas,
      villa:
        villas.length > 1
          ? villas.join(" + ")
          : villas[0] || null,
    };
  }

  for (const line of lines) {
    const guestM = line.match(
      /^(?:guest\s*name|name|guest)\s*[:\-–]\s*(.+)$/i
    );
    if (guestM) {
      name = guestM[1].trim();
      continue;
    }
    const dateM = line.match(/^(?:date|dates|check[\s-]?in)\s*[:\-–]\s*(.+)$/i);
    if (dateM) {
      preferred_dates = dateM[1].trim();
      continue;
    }
    // Bare date line: "July 30 to Aug 01, 2026"
    const bareDates = parseDateRange(line);
    if (bareDates.check_in && bareDates.check_out && line.length < 80) {
      preferred_dates = preferred_dates || line;
      continue;
    }
    const roomsM = line.match(
      /^(?:number\s*of\s*rooms|rooms?|villas?)\s*[:\-–]\s*(.+)$/i
    );
    if (roomsM) {
      villaHint += " " + roomsM[1];
      notes.push(line);
      continue;
    }
    // Bare rooms line: "02 (Library & Bamboo)" or "Library & Bamboo"
    if (
      /library|bamboo|beri|kerala|entire\s*property|buyout/i.test(line) &&
      !/guest|phone|email/i.test(line)
    ) {
      villaHint += " " + line;
      notes.push(line);
      continue;
    }
    const phoneM = line.match(
      /^(?:phone|mobile|tel)\s*[:\-–]\s*(.+)$/i
    );
    if (phoneM) {
      phone = phoneM[1].trim();
      continue;
    }
    // Phone-looking line
    if (/^\+?\d[\d\s\-]{8,}$/.test(line.replace(/\s/g, " ").trim())) {
      phone = line.trim();
      continue;
    }
    // "Sadhrana Bagh, Gurgaon" as first line = place not guest
    if (
      !name &&
      /sadhrana|gurgaon|gurugram/i.test(line) &&
      !/guest|mr\.|mrs\.|ms\./i.test(line)
    ) {
      notes.push(line);
      continue;
    }
    if (!name && /^(mr\.|mrs\.|ms\.|dr\.)\s+/i.test(line)) {
      name = line;
      continue;
    }
    // Unlabelled multi-line paste: first person-like line is the guest name
    if (
      !name &&
      lines.length >= 2 &&
      line.length >= 2 &&
      line.length <= 50 &&
      !/\d{4}/.test(line) &&
      !/to\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line)
    ) {
      name = line;
      continue;
    }
    notes.push(line);
  }

  // Fallback name: first line with Mr/Ms or first non-meta line
  if (!name) {
    for (const line of lines) {
      if (/guest name|date:|number of rooms|sadhrana bagh/i.test(line))
        continue;
      if (/\d{4}-\d{2}-\d{2}|to\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line))
        continue;
      if (/library|bamboo|beri|kerala/i.test(line) && line.length < 40) continue;
      if (line.length < 60) {
        name = line;
        break;
      }
    }
  }

  const blob = text + " " + villaHint;
  const dates = parseDateRange(preferred_dates || blob);
  const villas = parseVillaList(blob);

  if (/event|day spend|day-spend|hi tea|high tea|lunch only/i.test(blob)) {
    enquiry_type = "event";
  }
  if (villas.length || dates.check_in) {
    enquiry_type = "stay";
  }

  return {
    name: name || "Guest",
    phone,
    email,
    notes: notes.join("\n") || null,
    preferred_dates: preferred_dates || (dates.check_in
      ? `${dates.check_in} → ${dates.check_out}`
      : null),
    check_in: dates.check_in,
    check_out: dates.check_out,
    villas,
    villa:
      villas.length > 1
        ? villas.join(" + ")
        : villas[0] || null,
    enquiry_type,
    customer_segment: null,
  };
}
