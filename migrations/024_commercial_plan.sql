-- Migration: 024_commercial_plan
-- Adds a DB-level enforcement function + trigger to cap multi-family properties
-- at 4 units. This is a safety net on top of the service-layer check.
-- Commercial properties have no unit cap (enforced at subscription level instead).

-- Function that raises an error if a 'multi' property already has 4 units.
CREATE OR REPLACE FUNCTION check_multi_family_unit_cap()
RETURNS TRIGGER AS $$
DECLARE
  prop_type TEXT;
  unit_count INT;
BEGIN
  SELECT property_type INTO prop_type
  FROM properties
  WHERE id = NEW.property_id;

  IF prop_type = 'multi' THEN
    SELECT COUNT(*)::int INTO unit_count
    FROM units
    WHERE property_id = NEW.property_id
      AND deleted_at IS NULL;

    -- The new row has not been inserted yet, so count >= 4 means we are about to exceed
    IF unit_count >= 4 THEN
      RAISE EXCEPTION 'MULTI_FAMILY_CAP: Multi-family properties are limited to 4 units.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it already exists from a prior attempt, then recreate
DROP TRIGGER IF EXISTS trg_multi_family_unit_cap ON units;

CREATE TRIGGER trg_multi_family_unit_cap
  BEFORE INSERT ON units
  FOR EACH ROW EXECUTE FUNCTION check_multi_family_unit_cap();
