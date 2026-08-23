-- Card payment fee (bank merchant charge, recovered from the guest).
--
-- Levied on the GST-INCLUSIVE grand total and NOT itself taxed: it recovers a
-- payment cost, it is not a supply we make. Kept in its own columns rather than
-- folded into grand_total, because grand_total feeds /summary, /month and the
-- accountant's GST pack — the fee is a merchant cost passed through, never
-- turnover. What the guest hands over is grand_total + card_fee_inr; what we
-- earned stays grand_total.
alter table bills add column if not exists card_fee_pct numeric(5,2) not null default 0;
alter table bills add column if not exists card_fee_inr numeric(12,2) not null default 0;

comment on column bills.card_fee_pct is
  'Card payment fee rate applied, e.g. 2.50. Zero for cash/UPI bills. Set when the invoice is raised (Telegram review card / web form), never inferred.';
comment on column bills.card_fee_inr is
  'Card payment fee in rupees = card_fee_pct% of grand_total (post-GST). NOT part of grand_total and NOT revenue: amount payable = grand_total + card_fee_inr.';
