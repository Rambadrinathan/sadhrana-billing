/**
 * Estimate enquiry / deal value.
 * - Stay: villa night rates × nights (+ room GST)
 * - Event / F&B: catalog menu rates × pax
 */
import { getCatalog } from "@/lib/bills";
import {
  VILLAS,
  getVillaNightRate,
  nightsBetween,
  estimateStayDeal,
  parseVillaList,
  VILLA_NIGHT_RATES,
  VILLA_GST_PCT,
} from "@/lib/config";
import { parseDateRange } from "@/lib/lead-parse-telegram";

function findRate(catalog, predicates, fallback) {
  for (const p of predicates) {
    const hit = catalog.find((c) => p(String(c.name || "").toLowerCase()));
    if (hit) return Number(hit.rate_inr) || fallback;
  }
  return fallback;
}

export function detectSegment({ name, notes, email, pax, phone } = {}) {
  const blob = [name, notes, email, phone].filter(Boolean).join(" ").toLowerCase();
  const b2bHints =
    /\b(b2b|corp|corporate|company|pvt\.?\s*ltd|limited|office|team outing|team building|hr\b|organization|organisation|invoice to company|gstin|bulk|conference|offsite|mnc|agency|travel agent|tmc)\b/i.test(
      blob
    );
  const b2cHints =
    /\b(family|birthday|anniversary|personal|friends|wedding guest|b2c)\b/i.test(
      blob
    );
  const largeGroup = Number(pax) >= 15;
  if (b2bHints) return "b2b";
  if (b2cHints && !largeGroup) return "b2c";
  if (largeGroup) return "b2b";
  const emailStr = String(email || "");
  if (
    /@/.test(emailStr) &&
    !/@(gmail|yahoo|hotmail|outlook|icloud|rediffmail|proton)\./i.test(emailStr)
  ) {
    return "b2b";
  }
  return "b2c";
}

export function parsePaxBreakdown(notes, pax) {
  const text = String(notes || "");
  const adultsM = text.match(/(\d+)\s*adults?/i);
  const kidsM = text.match(/(\d+)\s*kids?|(\d+)\s*children/i);
  let adults = adultsM ? Number(adultsM[1]) : null;
  let kids = kidsM ? Number(kidsM[1] || kidsM[2]) : null;
  if (adults == null && kids == null && pax != null) {
    adults = Number(pax) || 0;
    kids = 0;
  }
  if (adults == null) adults = Number(pax) || 0;
  if (kids == null) kids = 0;
  return { adults, kids, total: adults + kids };
}

/** Infer villa / buyout from free text */
export function detectVilla(text) {
  const t = String(text || "").toLowerCase();
  if (
    /entire property|full property|whole property|buy\s*out|buyout|all\s*4\s*villas|all villas|complete estate/i.test(
      t
    )
  ) {
    return "Entire property";
  }
  for (const v of VILLAS) {
    if (v === "Other / shared") continue;
    const key = v.toLowerCase().split(" ")[0];
    if (t.includes(key) || t.includes(v.toLowerCase())) return v;
  }
  return null;
}

/**
 * Build estimate: stay uses villa rack rates; event/fnb uses menu.
 */
export async function estimateLeadValue(lead) {
  const catalog = await getCatalog({ includeInactive: false }).catch(() => []);
  const notes = String(lead.notes || "");
  const type = String(lead.enquiry_type || "stay").toLowerCase();
  const { adults, kids, total } = parsePaxBreakdown(lead.notes, lead.pax);

  const blob = [lead.villa, lead.preferred_dates, notes, lead.name]
    .filter(Boolean)
    .join("\n");

  // Multi-villa from free text (Library & Bamboo) or explicit list
  let villas = Array.isArray(lead.villas) ? [...lead.villas] : [];
  if (!villas.length) {
    villas = parseVillaList(blob);
  }
  const villa =
    lead.villa ||
    (villas.length > 1 ? villas.join(" + ") : villas[0]) ||
    detectVilla(lead.preferred_dates) ||
    detectVilla(notes) ||
    detectVilla(lead.name) ||
    null;

  // Dates: structured fields, else parse preferred_dates / notes
  let check_in = lead.check_in || null;
  let check_out = lead.check_out || null;
  if (!check_in || !check_out) {
    const fromText = parseDateRange(
      [lead.preferred_dates, notes, lead.name].filter(Boolean).join(" ")
    );
    check_in = check_in || fromText.check_in;
    check_out = check_out || fromText.check_out;
  }

  let nights =
    lead.nights != null && Number(lead.nights) > 0
      ? Number(lead.nights)
      : nightsBetween(check_in, check_out);

  // Stay enquiries: domestic CP rack (weekday / weekend / peak) + 18% GST
  if (type === "stay" || (villa && nights > 0) || (check_in && check_out)) {
    const stayVilla = villa || "Bamboo House";
    const forcePeak =
      lead.peak_period === true ||
      /peak period|peak rate/i.test(notes);
    const extraAbove = Number(lead.extra_beds_above_5) || 0;
    const extraBelow = Number(lead.extra_beds_5_below) || 0;
    const stay = estimateStayDeal({
      villa: stayVilla,
      villas: villas.length ? villas : undefined,
      check_in,
      check_out,
      nights,
      peak_period: forcePeak,
      extra_beds_above_5: extraAbove,
      extra_beds_5_below: extraBelow,
    });

    // Optional F&B add-on if notes mention meals (beyond CP breakfast)
    let fnb = 0;
    const fnbLines = [];
    const wantsMeals =
      /lunch|dinner|meal|high tea|hi tea|bonfire|bbq/i.test(notes);
    if (wantsMeals && total > 0) {
      const vegLunch = findRate(
        catalog,
        [(n) => n.includes("vegetarian lunch") || n.includes("veg lunch")],
        1200
      );
      const nonVegLunch = findRate(
        catalog,
        [(n) => n.includes("non-vegetarian") || n.includes("non veg")],
        1500
      );
      const adultMeal = Math.round((vegLunch + nonVegLunch) / 2);
      const mealDays = Math.max(1, stay.nights);
      fnb =
        adults * adultMeal * mealDays +
        kids * Math.round(adultMeal * 0.5) * mealDays;
      fnbLines.push({
        label: `Est. meals (beyond CP breakfast) @ ~₹${adultMeal}/adult × ${adults} × ${mealDays}n`,
        amount: fnb,
      });
    }

    const fnbGst = Math.round(fnb * 0.05 * 100) / 100;
    // Stay GST already in stay.deal_value_inr; add F&B+gst on top of room+room gst
    const roomWithGst = stay.deal_value_inr;
    const deal = Math.round((roomWithGst + fnb + fnbGst) * 100) / 100;

    const bandCounts = { weekday: 0, weekend: 0, peak: 0 };
    for (const nl of stay.night_lines || []) {
      bandCounts[nl.band] = (bandCounts[nl.band] || 0) + 1;
    }

    const segment = String(lead.customer_segment || "").toUpperCase() || "—";
    const roomLabel =
      villas.length > 1
        ? villas.join(" + ")
        : stay.is_buyout
          ? "Entire property"
          : stayVilla;

    // Discount: estimate is rack; quoted is after fair discount
    const rack = stay.nights > 0 ? deal : null;
    const discountPct = Math.min(
      100,
      Math.max(0, Number(lead.discount_pct) || 0)
    );
    let discountInr =
      lead.discount_inr != null && lead.discount_inr !== ""
        ? Number(lead.discount_inr)
        : rack != null && discountPct
          ? Math.round((rack * discountPct) / 100)
          : 0;
    if (rack != null && discountInr > rack) discountInr = rack;
    const quoted =
      rack != null ? Math.round((rack - discountInr) * 100) / 100 : null;

    const breakdown = [
      `• ESTIMATE (domestic CP rack — not a final invoice)`,
      `• ${stay.seasonLabel || "Domestic CP"}`,
      `• Segment: ${segment}`,
      stay.is_buyout
        ? `• Stay type: ENTIRE PROPERTY BUYOUT (all 4 villas)`
        : `• Rooms: ${roomLabel}`,
      stay.buyout_note ? `• ${stay.buyout_note}` : null,
      `• ${stay.nights} night(s): Mon–Thu ${bandCounts.weekday} · Fri–Sun ${bandCounts.weekend} · Peak ${bandCounts.peak}`,
      `• Room base: ₹${stay.room_subtotal.toLocaleString("en-IN")}`,
      stay.extra_bed_inr
        ? `• Extra beds: ₹${stay.extra_bed_inr.toLocaleString("en-IN")}`
        : null,
      `• Room GST ${stay.gst_pct}%: ₹${stay.gst_inr.toLocaleString("en-IN")}`,
      ...fnbLines.map(
        (l) => `• ${l.label}: ₹${Number(l.amount).toLocaleString("en-IN")}`
      ),
      fnb ? `• F&B GST ~5%: ₹${fnbGst.toLocaleString("en-IN")}` : null,
      rack != null
        ? `• Estimated rack value: ₹${rack.toLocaleString("en-IN")}`
        : null,
      discountInr
        ? `• Discount ${discountPct ? discountPct + "%" : ""}: −₹${discountInr.toLocaleString("en-IN")}`
        : null,
      quoted != null && discountInr
        ? `• Quoted after discount: ₹${quoted.toLocaleString("en-IN")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      // Rack estimate (always the full rate before commercial discount)
      estimated_value_inr: rack,
      // Pipeline / deal uses quoted if discounted, else rack
      deal_value_inr: quoted != null ? quoted : rack,
      quoted_value_inr: quoted,
      discount_pct: discountPct || 0,
      discount_inr: discountInr || 0,
      estimate_breakdown: stay.nights > 0 ? breakdown : null,
      villa: roomLabel,
      villas: villas.length ? villas : stayVilla ? [stayVilla] : [],
      nights: stay.nights,
      rate_per_night_inr: stay.rate_per_night_inr,
      check_in,
      check_out,
      preferred_dates:
        lead.preferred_dates ||
        (check_in && check_out ? `${check_in} → ${check_out}` : null),
      adults,
      kids,
      lines: [
        {
          label: `${roomLabel} ${stay.nights}n (weekday/weekend/peak mix)`,
          amount: stay.room_subtotal,
        },
        ...fnbLines,
      ],
      subtotal: stay.room_subtotal + stay.extra_bed_inr + fnb,
      gst: stay.gst_inr + fnbGst,
    };
  }

  // Event / F&B day spend from catalog
  const vegLunch = findRate(
    catalog,
    [(n) => n.includes("vegetarian lunch") || n.includes("veg lunch")],
    1200
  );
  const nonVegLunch = findRate(
    catalog,
    [(n) => n.includes("non-vegetarian") || n.includes("non veg")],
    1500
  );
  const childVeg = findRate(
    catalog,
    [(n) => n.includes("child") && n.includes("veg") && !n.includes("non")],
    600
  );
  const childNonVeg = findRate(
    catalog,
    [(n) => n.includes("child") && n.includes("non")],
    750
  );
  const highTea = findRate(
    catalog,
    [(n) => n.includes("high tea") && !n.includes("reduced")],
    700
  );
  const starters = findRate(
    catalog,
    [(n) => n.includes("starter") && n.includes("veg")],
    400
  );
  const bonfire = findRate(catalog, [(n) => n.includes("bonfire")], 2000);
  const bbq = findRate(
    catalog,
    [(n) => n.includes("barbecue") || n.includes("bbq")],
    1800
  );

  const wantsNonVeg = /non[\s-]?veg|nonveg|chicken|meat/i.test(notes);
  const wantsVegOnly = /\bveg only\b|pure veg/i.test(notes);
  const adultMeal = wantsVegOnly
    ? vegLunch
    : wantsNonVeg
      ? nonVegLunch
      : Math.round((vegLunch + nonVegLunch) / 2);
  const kidMeal = wantsNonVeg ? childNonVeg : childVeg;

  const lines = [];
  let subtotal = 0;
  if (total > 0) {
    if (adults > 0) {
      const a = adults * adultMeal;
      lines.push({ label: `Adult meal @ ₹${adultMeal} × ${adults}`, amount: a });
      subtotal += a;
    }
    if (kids > 0) {
      const k = kids * kidMeal;
      lines.push({ label: `Child meal @ ₹${kidMeal} × ${kids}`, amount: k });
      subtotal += k;
    }
    if (/hi[\s-]?tea|high tea/i.test(notes) || type === "event") {
      const ht = adults * highTea + kids * Math.round(highTea * 0.5);
      lines.push({ label: `High tea`, amount: ht });
      subtotal += ht;
    }
    if (/bonfire/.test(notes.toLowerCase())) {
      lines.push({ label: `Bonfire`, amount: bonfire });
      subtotal += bonfire;
    }
    if (/bbq|barbecue/.test(notes.toLowerCase())) {
      const b = total * bbq;
      lines.push({ label: `BBQ @ ₹${bbq} × ${total}`, amount: b });
      subtotal += b;
    }
    if (/drink|sundowner/.test(notes.toLowerCase())) {
      const d = total * starters;
      lines.push({ label: `Drinks (est.)`, amount: d });
      subtotal += d;
    }
  }

  const gstPct = 5;
  const gst = Math.round(subtotal * (gstPct / 100) * 100) / 100;
  const total_inr = Math.round((subtotal + gst) * 100) / 100;
  const breakdown =
    lines.map((l) => `• ${l.label}: ₹${Number(l.amount).toLocaleString("en-IN")}`).join("\n") +
    (lines.length
      ? `\n• GST ~${gstPct}%: ₹${gst.toLocaleString("en-IN")}\n• Est. deal: ₹${total_inr.toLocaleString("en-IN")}`
      : "Add villa + check-in/out for stay value, or pax + meal notes for day events.");

  return {
    estimated_value_inr: total_inr || null,
    deal_value_inr: total_inr || null,
    estimate_breakdown: lines.length ? breakdown : null,
    villa,
    nights: nights || null,
    rate_per_night_inr: villa ? getVillaNightRate(villa) : null,
    check_in,
    check_out,
    adults,
    kids,
    lines,
    subtotal,
    gst,
  };
}

export async function enrichLeadForSave(item) {
  const pax =
    item.pax != null
      ? Number(item.pax)
      : parsePaxBreakdown(item.notes, null).total || null;

  let customer_segment = String(item.customer_segment || "")
    .toLowerCase()
    .trim();
  if (customer_segment !== "b2b" && customer_segment !== "b2c") {
    customer_segment = detectSegment({
      name: item.name,
      notes: item.notes,
      email: item.email,
      pax,
      phone: item.phone,
    });
  }

  const est = await estimateLeadValue({ ...item, pax });
  const adults = item.adults != null ? Number(item.adults) : est.adults;
  const kids = item.kids != null ? Number(item.kids) : est.kids;
  const finalPax =
    pax != null ? pax : adults + kids > 0 ? adults + kids : null;

  // Rack estimate always from rates (or explicit override of estimated only)
  const rack =
    item.force_estimated != null && item.force_estimated !== ""
      ? Number(item.force_estimated)
      : est.estimated_value_inr;

  const discount_pct = Math.min(
    100,
    Math.max(0, Number(item.discount_pct ?? est.discount_pct) || 0)
  );
  let discount_inr =
    item.discount_inr != null && item.discount_inr !== ""
      ? Number(item.discount_inr)
      : rack != null && discount_pct
        ? Math.round((rack * discount_pct) / 100)
        : Number(est.discount_inr) || 0;
  if (rack != null && discount_inr > rack) discount_inr = rack;

  const quoted =
    rack != null
      ? Math.round((rack - (discount_inr || 0)) * 100) / 100
      : est.quoted_value_inr;

  // Pipeline value = quoted (after discount) when set, else rack
  const deal =
    item.deal_value_inr != null &&
    item.deal_value_inr !== "" &&
    item.keep_manual_deal
      ? Number(item.deal_value_inr)
      : quoted ?? rack;

  return {
    ...item,
    pax: finalPax,
    adults,
    kids,
    customer_segment,
    villa: item.villa || est.villa || null,
    villas: item.villas || est.villas || null,
    check_in: item.check_in || est.check_in || null,
    check_out: item.check_out || est.check_out || null,
    preferred_dates:
      item.preferred_dates || est.preferred_dates || null,
    nights:
      item.nights != null && item.nights !== ""
        ? Number(item.nights)
        : est.nights || null,
    rate_per_night_inr:
      item.rate_per_night_inr != null && item.rate_per_night_inr !== ""
        ? Number(item.rate_per_night_inr)
        : est.rate_per_night_inr || null,
    estimated_value_inr: rack,
    deal_value_inr: deal,
    quoted_value_inr: quoted,
    discount_pct,
    discount_inr,
    estimate_breakdown: item.estimate_breakdown || est.estimate_breakdown,
  };
}

export { VILLA_NIGHT_RATES, VILLA_GST_PCT, getVillaNightRate, estimateStayDeal };
