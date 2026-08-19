-- Tax-inclusive bills.
--
-- Munish is handed F&B bills whose printed amount already contains the 5%.
-- Before this, the only choices were "add 5%" or "no GST", so an inclusive bill
-- of Rs 6,000 had to be re-keyed as Rs 5,714.28 by hand, or went out 5% high.
--
-- When true: the amounts entered were the guest-facing, tax-included figures.
-- The stored line rates are net of tax and grand_total equals what the guest
-- paid. Tax is still declared as CGST + SGST, so the invoice stays valid.
alter table bills add column if not exists gst_inclusive boolean not null default false;

comment on column bills.gst_inclusive is
  'True when the amounts keyed in already included GST: line rates are stored net of tax and grand_total equals the figure written on the original bill. Set by hand (Telegram picker), never inferred.';
