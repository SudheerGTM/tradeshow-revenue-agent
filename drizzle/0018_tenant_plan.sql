-- Release 14.3.1 — lightweight entitlement model
--
-- Additive only: one column, NOT NULL with a safe default so every existing
-- tenant row is filled in automatically. No existing row's other columns
-- are touched. See src/lib/plans.ts for the (currently single) plan
-- definition this looks up.

ALTER TABLE tenants
  ADD COLUMN plan_name VARCHAR(50) NOT NULL DEFAULT 'trade_show_pro';
