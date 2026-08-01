/**
 * Pure helpers for reviewing + correcting OCR'd purchase invoice lines.
 * No Telegram, no Supabase — so this can be reasoned about and tested alone.
 *
 * A line is: { description, qty, unit_cost_inr, gst_pct, amount_inr }
 */

const MONEY_TOLERANCE = 1; // rupees — OCR rounding slack before we warn

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function inr(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Recompute a line's amount from qty x rate. */
export function normalizeLine(line) {
  const qty = Number(line.qty) || 1;
  const rate = Number(line.unit_cost_inr) || 0;
  return {
    description: String(line.description || "Item").trim(),
    qty,
    unit: line.unit || null,
    unit_cost_inr: round2(rate),
    gst_pct: line.gst_pct == null ? 18 : Number(line.gst_pct) || 0,
    amount_inr: round2(qty * rate),
    hsn_sac: line.hsn_sac || null,
  };
}

export function normalizeLines(lines) {
  return (Array.isArray(lines) ? lines : []).map(normalizeLine);
}

/** Sum of line amounts (pre-GST) and GST computed per line. */
export function linesTotals(lines) {
  const norm = normalizeLines(lines);
  let subtotal = 0;
  let gst = 0;
  for (const l of norm) {
    subtotal += l.amount_inr;
    gst += (l.amount_inr * (Number(l.gst_pct) || 0)) / 100;
  }
  subtotal = round2(subtotal);
  gst = round2(gst);
  return { subtotal, gst, total: round2(subtotal + gst), count: norm.length };
}

/**
 * Compare what the lines say against what the invoice total says.
 * The printed invoice total is authoritative; a mismatch means OCR misread a line.
 */
export function lineMismatch(draft) {
  const lines = normalizeLines(draft.lines);
  if (!lines.length) return { hasLines: false, mismatch: false };
  const fromLines = linesTotals(lines);
  const invoiceTotal = round2(draft.total_inr);
  const diff = round2(fromLines.total - invoiceTotal);
  return {
    hasLines: true,
    mismatch: Math.abs(diff) > MONEY_TOLERANCE,
    diff,
    linesTotal: fromLines.total,
    linesSubtotal: fromLines.subtotal,
    linesGst: fromLines.gst,
    invoiceTotal,
  };
}

/** Numbered, human-checkable rendering of the lines. */
export function formatLinesReview(draft) {
  const lines = normalizeLines(draft.lines);
  if (!lines.length) {
    return "_No line items read from this invoice._\nAdd them with:  `+ Item name | qty | rate`";
  }
  const rows = lines.map((l, i) => {
    const gstNote = l.gst_pct !== 18 ? ` · GST ${l.gst_pct}%` : "";
    return (
      `*${i + 1}.* ${l.description}\n` +
      `    ${l.qty} × Rs ${inr(l.unit_cost_inr)} = *Rs ${inr(l.amount_inr)}*${gstNote}`
    );
  });
  return rows.join("\n");
}

/** The warning block shown above the buttons. */
export function formatMismatchNote(draft) {
  const m = lineMismatch(draft);
  if (!m.hasLines) {
    return "\n⚠️ *No items read* — amount is a lump sum. Tap ✏️ Edit items to itemise.\n";
  }
  if (!m.mismatch) {
    return `\n✅ Items add up to the invoice total (Rs ${inr(m.linesTotal)}).\n`;
  }
  const dir = m.diff > 0 ? "more than" : "less than";
  return (
    `\n⚠️ *Check the items.* They add up to *Rs ${inr(m.linesTotal)}*, ` +
    `which is Rs ${inr(Math.abs(m.diff))} ${dir} the invoice total of Rs ${inr(m.invoiceTotal)}.\n` +
    `Likely a misread quantity or rate. Tap ✏️ Edit items.\n`
  );
}

export const LINE_EDIT_HELP = `✏️ *Editing items* — send one instruction per message:

\`3: Asian Paints Apex | 2 | 4200\`
   replace item 3 (name | qty | rate)
\`3 x 4\`  — set item 3 quantity to 4
\`3 = 385\`  — set item 3 rate to Rs 385
\`3 gst 12\`  — set item 3 GST to 12%
\`del 3\`  — remove item 3
\`+ Wall putty | 1 | 350\`  — add a new item
\`total 1390\`  — correct the invoice total

Tap *Done* when the items match the paper invoice.`;

/**
 * Parse one staff edit instruction.
 * Returns { ok, action, ... } or { ok:false, error }.
 */
export function parseLineEdit(text) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, error: "Empty instruction." };

  // done / cancel
  if (/^(done|ok|finish|finished|save)$/i.test(t)) return { ok: true, action: "done" };

  // del 3  /  delete 3  /  remove 3  /  -3
  let m = t.match(/^(?:del|delete|remove|rm|-)\s*(\d+)$/i);
  if (m) return { ok: true, action: "delete", index: Number(m[1]) };

  // total 1390
  m = t.match(/^total\s*[:=]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)$/i);
  if (m) return { ok: true, action: "total", value: num(m[1]) };

  // + Name | qty | rate   (qty and rate optional)
  m = t.match(/^\+\s*(.+)$/);
  if (m) {
    const parts = m[1].split("|").map((s) => s.trim());
    if (!parts[0]) return { ok: false, error: "Give the item a name." };
    return {
      ok: true,
      action: "add",
      line: {
        description: parts[0],
        qty: parts[1] ? num(parts[1]) : 1,
        unit_cost_inr: parts[2] ? num(parts[2]) : 0,
      },
    };
  }

  // 3 gst 12
  m = t.match(/^(\d+)\s*(?:gst)\s*[:=]?\s*([\d.]+)\s*%?$/i);
  if (m) return { ok: true, action: "gst", index: Number(m[1]), value: num(m[2]) };

  // 3 x 4   (quantity)
  m = t.match(/^(\d+)\s*[x*×]\s*([\d,]+(?:\.\d+)?)$/i);
  if (m) return { ok: true, action: "qty", index: Number(m[1]), value: num(m[2]) };

  // 3 = 385  (rate)
  m = t.match(/^(\d+)\s*=\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)$/i);
  if (m) return { ok: true, action: "rate", index: Number(m[1]), value: num(m[2]) };

  // 3: Name | qty | rate
  m = t.match(/^(\d+)\s*[:.]\s*(.+)$/);
  if (m) {
    const idx = Number(m[1]);
    const parts = m[2].split("|").map((s) => s.trim());
    if (!parts[0]) return { ok: false, error: "Give the item a name." };
    const patch = { description: parts[0] };
    if (parts[1]) patch.qty = num(parts[1]);
    if (parts[2]) patch.unit_cost_inr = num(parts[2]);
    return { ok: true, action: "replace", index: idx, patch };
  }

  return {
    ok: false,
    error:
      "Didn't understand that. Use `3 x 2`, `3 = 385`, `3: Name | qty | rate`, `del 3`, `+ Name | qty | rate`, or `total 1390`.",
  };
}

function num(s) {
  return Number(String(s).replace(/,/g, "")) || 0;
}

/**
 * Apply one parsed instruction to a draft. Returns { draft, message } — never mutates input.
 * Throws nothing; bad indexes come back as a message.
 */
export function applyLineEdit(draft, parsed) {
  const lines = normalizeLines(draft.lines);
  const need = (i) => i >= 1 && i <= lines.length;

  if (parsed.action === "delete") {
    if (!need(parsed.index)) return { draft, message: badIndex(parsed.index, lines.length) };
    const removed = lines[parsed.index - 1];
    lines.splice(parsed.index - 1, 1);
    return {
      draft: { ...draft, lines },
      message: `Removed *${removed.description}*.`,
    };
  }

  if (parsed.action === "add") {
    lines.push(normalizeLine(parsed.line));
    const added = lines[lines.length - 1];
    return {
      draft: { ...draft, lines },
      message: `Added *${added.description}* — ${added.qty} × Rs ${inr(added.unit_cost_inr)} = Rs ${inr(added.amount_inr)}.`,
    };
  }

  if (parsed.action === "total") {
    return {
      draft: { ...draft, total_inr: round2(parsed.value), total_manual: true },
      message: `Invoice total set to *Rs ${inr(parsed.value)}*.`,
    };
  }

  if (!need(parsed.index)) return { draft, message: badIndex(parsed.index, lines.length) };
  const i = parsed.index - 1;

  if (parsed.action === "qty") {
    lines[i] = normalizeLine({ ...lines[i], qty: parsed.value });
  } else if (parsed.action === "rate") {
    lines[i] = normalizeLine({ ...lines[i], unit_cost_inr: parsed.value });
  } else if (parsed.action === "gst") {
    lines[i] = normalizeLine({ ...lines[i], gst_pct: parsed.value });
  } else if (parsed.action === "replace") {
    lines[i] = normalizeLine({ ...lines[i], ...parsed.patch });
  }

  const l = lines[i];
  return {
    draft: { ...draft, lines },
    message: `*${parsed.index}.* ${l.description} — ${l.qty} × Rs ${inr(l.unit_cost_inr)} = *Rs ${inr(l.amount_inr)}*`,
  };
}

function badIndex(i, count) {
  if (!count) return "There are no items yet. Add one with `+ Name | qty | rate`.";
  return `There's no item ${i}. Pick 1–${count}.`;
}

/** Adopt the lines' arithmetic as the invoice figures. */
export function adoptLinesTotals(draft) {
  const t = linesTotals(draft.lines);
  return {
    ...draft,
    amount_inr: t.subtotal,
    gst_amount_inr: t.gst,
    total_inr: t.total,
    total_manual: true,
  };
}
