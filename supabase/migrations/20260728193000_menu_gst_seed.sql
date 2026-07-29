-- Real Beri House menu (2026) + experiences. 5% GST on F&B (CGST 2.5 + SGST 2.5).
-- HSN/SAC 996331 restaurant service (from sample tax invoice).

alter table catalog_items add column if not exists hsn_sac text;
alter table catalog_items add column if not exists aliases text[] default '{}';
alter table catalog_items add column if not exists unit text default 'person';

-- Replace placeholder catalog
truncate catalog_items restart identity cascade;

insert into catalog_items (name, category, rate_inr, gst_pct, sort_order, hsn_sac, unit, aliases) values
  -- Core meal packages (what gets billed day-to-day)
  ('Vegetarian Lunch / Dinner', 'fnb', 1200, 5, 10, '996331', 'person',
   array['veg lunch','veg dinner','vegetarian lunch','vegetarian dinner','veg meal','veg lunen','veg lun','veg dinar','veg dinner']),
  ('Non-Vegetarian Lunch / Dinner', 'fnb', 1500, 5, 20, '996331', 'person',
   array['non veg lunch','non veg dinner','non-veg','nonveg','nv lunch','nv dinner']),
  ('Child Meal (under 10) — Veg 50%', 'fnb', 600, 5, 30, '996331', 'person',
   array['child veg','kids veg','baby food veg','half veg']),
  ('Child Meal (under 10) — Non-Veg 50%', 'fnb', 750, 5, 40, '996331', 'person',
   array['child non veg','kids non veg','baby food']),

  -- High tea / snacks
  ('High Tea (per person)', 'fnb', 700, 5, 50, '996331', 'person',
   array['hi tea','hightea','hi-tea','high tea']),
  ('High Tea — reduced / snack set', 'fnb', 350, 5, 55, '996331', 'person',
   array['hi tea 350','half high tea']),
  ('Vegetarian Starters (à la carte)', 'fnb', 400, 5, 60, '996331', 'person',
   array['veg snacks','veg starter','starters veg','veg snacky','veg snack']),
  ('Non-Vegetarian Starters (à la carte)', 'fnb', 500, 5, 70, '996331', 'person',
   array['non veg snacks','nv starter','nonveg starter']),

  -- Special meals
  ('Barbecue Prix-Fixe', 'fnb', 1800, 5, 80, '996331', 'person',
   array['bbq','barbeque','barbecue','tandoori meal']),
  ('Roast Chicken Meal', 'fnb', 900, 5, 90, '996331', 'person',
   array['roast chicken','special roast chicken']),
  ('Burmese Khao Suey', 'fnb', 1000, 5, 100, '996331', 'person',
   array['khao suey','khaosuey','burmese']),
  ('Vegetarian Pizza', 'fnb', 700, 5, 110, '996331', 'pizza',
   array['veg pizza','pizza veg']),
  ('Non-Vegetarian Pizza', 'fnb', 950, 5, 120, '996331', 'pizza',
   array['non veg pizza','nv pizza','chicken pizza']),

  -- Experiences (still 5% GST for simplicity unless CA says otherwise)
  ('Bonfire', 'experience', 2000, 5, 200, '999799', 'event',
   array['bon fire','campfire','bonfire']),
  ('Massage (60 min)', 'experience', 2500, 5, 210, '999722', 'session',
   array['massage','massage 60','60 min massage']),
  ('Massage (90 min)', 'experience', 3500, 5, 220, '999722', 'session',
   array['massage 90','90 min massage']),
  ('Sanctuary Walk Assist', 'experience', 500, 5, 230, '999799', 'person',
   array['sultanpur','bird sanctuary','sanctuary walk']);
