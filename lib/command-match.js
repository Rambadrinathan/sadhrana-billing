/**
 * Forgiving command resolution for the Telegram bot.
 *
 * Staff type on phones: "/Bill", "/ purchase", "/billl", "/purchse", "/bil".
 * None of those should return "Unknown command". Pure functions, no I/O.
 */

/** Every command the bot answers to. First entry of each row is canonical. */
export const COMMANDS = [
  ["bill"],
  ["purchase", "buy", "purchases"],
  ["lead"],
  ["leads"],
  ["expense", "expenses", "spend"],
  ["inventory", "stock"],
  ["attendance", "attend"],
  ["guest", "guests"],
  ["ops"],
  ["menu"],
  ["today"],
  ["staff"],
  ["help"],
  ["start"],
  ["cancel"],
  ["pdf"],
  ["edit"],
  ["paid"],
  ["history"],
];

const CANONICAL = COMMANDS.map((r) => r[0]);
const ALIASES = new Map();
for (const row of COMMANDS) {
  for (const name of row) ALIASES.set(name, row[0]);
}

/** Commands that must never be auto-corrected into — they mutate money/state. */
const CONFIRM_FIRST = new Set(["paid", "cancel"]);

/**
 * Strip the noise phones add: case, "@botname", spaces after the slash,
 * trailing punctuation, repeated trailing letters.
 */
export function normalizeCommandWord(raw) {
  return String(raw || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/@\w+$/, "")
    .replace(/[\s._-]+/g, "")
    .replace(/[!?.,;:]+$/, "")
    .toLowerCase();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Collapse runs of a repeated letter: "billl" -> "bil", "purchhase" -> "purchase" */
function dedupeRuns(s) {
  return s.replace(/(.)\1+/g, "$1");
}

/**
 * Resolve typed text to a command.
 * Returns one of:
 *   { kind:"exact",   command }          — run it
 *   { kind:"corrected", command, typed } — run it, tell them what we assumed
 *   { kind:"suggest", candidates, typed }— ask before running
 *   { kind:"unknown", typed }
 */
export function resolveCommand(raw) {
  const typed = normalizeCommandWord(raw);
  if (!typed) return { kind: "unknown", typed };

  // 1. Exact, including aliases and "/ purchase" / "/Bill" / "/purchase."
  if (ALIASES.has(typed)) {
    return { kind: "exact", command: ALIASES.get(typed) };
  }

  // A guessed command must never move money or destroy a draft — offer it instead.
  const offer = (command) =>
    CONFIRM_FIRST.has(command)
      ? { kind: "suggest", candidates: [command], typed }
      : { kind: "corrected", command, typed };

  // 2. Repeated-letter slips: "billl", "purchhase"
  const squashed = dedupeRuns(typed);
  for (const name of ALIASES.keys()) {
    if (dedupeRuns(name) === squashed) {
      return offer(ALIASES.get(name));
    }
  }

  // 3. Unambiguous prefix, 3+ chars: "purch" -> purchase, "bil" -> bill
  if (typed.length >= 3) {
    const pref = CANONICAL.filter((c) => c.startsWith(typed));
    if (pref.length === 1) {
      return offer(pref[0]);
    }
    if (pref.length > 1) {
      return { kind: "suggest", candidates: pref.slice(0, 3), typed };
    }
  }

  // 4. Edit distance. Tight budget on short words so "/pdf" can't become "/paid".
  const budget = typed.length <= 4 ? 1 : 2;
  const scored = CANONICAL.map((c) => ({ c, d: levenshtein(typed, c) }))
    .filter((x) => x.d <= budget)
    .sort((a, b) => a.d - b.d || a.c.length - b.c.length);

  if (scored.length) {
    const best = scored[0];
    const tied = scored.filter((x) => x.d === best.d);
    // Money-moving commands are only ever suggested, never auto-run.
    if (tied.length === 1 && best.d <= 1) {
      return offer(best.c);
    }
    return {
      kind: "suggest",
      candidates: [...new Set(tied.map((x) => x.c))].slice(0, 3),
      typed,
    };
  }

  return { kind: "unknown", typed };
}

/** Message for a command we couldn't confidently resolve. */
export function unknownCommandMessage(result) {
  const head = `No command */${result.typed}*.`;
  if (result.kind === "suggest" && result.candidates?.length) {
    const list = result.candidates.map((c) => `*/${c}*`).join(" or ");
    return `${head} Did you mean ${list}?`;
  }
  return (
    `${head}\n\n` +
    "*/bill* — guest F&B bill\n" +
    "*/purchase* — supplier invoice\n" +
    "*/lead* — enquiry\n" +
    "*/expense* · */inventory* · */attendance*\n\n" +
    "/help for everything."
  );
}
