import test from "node:test";
import assert from "node:assert/strict";

/**
 * The one-piece-of-paper-at-a-time gate.
 *
 * Fifteen vouchers arrived as one album, the drafts overwrote each other and
 * nothing reached the database. These cases pin the decision the gate makes,
 * and — just as important — the cases where it must NOT interfere, because a
 * gate that blocks the photo the bot just asked for is worse than no gate.
 *
 * Mirrors the predicates in lib/telegram-handler.js:handlePhoto. They are not
 * exported (the module opens Telegram and Supabase clients at import), so the
 * logic under test is restated here and must be kept in step with it.
 */

function hasBillIntent(draft) {
  if (!draft) return false;
  if (draft.kind === "await_bill") return true;
  if (draft.edit_bill_id) return true;
  return !draft.kind && Array.isArray(draft.lines) && draft.lines.length > 0;
}

/** What handlePhoto decides before it does any work. */
function gate(message, draft) {
  if (message.media_group_id) return "refuse_album";
  const awaitingConfirmation =
    draft?.kind === "purchase" ||
    (hasBillIntent(draft) && draft?.kind !== "await_bill");
  if (awaitingConfirmation) return "finish_the_one_in_hand";
  return "read_it";
}

test("an album is refused outright — none of it is read", () => {
  assert.equal(gate({ media_group_id: "123", photo: [{}] }, null), "refuse_album");
});

test("an album is refused even mid-flow, so nothing is half-saved", () => {
  assert.equal(
    gate({ media_group_id: "123" }, { kind: "await_purchase_photo" }),
    "refuse_album"
  );
});

test("a single photo the bot asked for goes straight through", () => {
  // The two states where the bot has just said "send me the photo". Blocking
  // these would break the normal flow entirely.
  assert.equal(gate({ photo: [{}] }, { kind: "await_purchase_photo" }), "read_it");
  assert.equal(gate({ photo: [{}] }, { kind: "await_bill" }), "read_it");
});

test("a photo on top of a draft awaiting yes/no is held back", () => {
  assert.equal(
    gate({ photo: [{}] }, { kind: "purchase", total_inr: 4200 }),
    "finish_the_one_in_hand"
  );
  // A parsed bill draft carries lines and no kind.
  assert.equal(
    gate({ photo: [{}] }, { lines: [{ name: "Tea", qty: 2 }] }),
    "finish_the_one_in_hand"
  );
  assert.equal(
    gate({ photo: [{}] }, { edit_bill_id: "abc" }),
    "finish_the_one_in_hand"
  );
});

test("a plain photo with nothing in progress is read as before", () => {
  assert.equal(gate({ photo: [{}] }, null), "read_it");
  assert.equal(gate({ photo: [{}] }, { kind: "photo_pending" }), "read_it");
  assert.equal(gate({ photo: [{}] }, { kind: "lead_draft" }), "read_it");
});

test("an empty draft with no lines does not block", () => {
  assert.equal(gate({ photo: [{}] }, { lines: [] }), "read_it");
});
