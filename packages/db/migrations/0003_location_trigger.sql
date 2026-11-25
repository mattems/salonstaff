-- Salons and jobs get their latitude and longitude from where their suburb is (D-10): the centre of
-- the suburb with the same state and slug (preferring the one in the same postcode, as names repeat),
-- else the centre of the postcode, else nothing (left out of "near me" search). The database sets
-- them whenever the place changes, so no code path can forget.
CREATE FUNCTION set_coordinates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT l.latitude, l.longitude INTO NEW.latitude, NEW.longitude
  FROM localities l
  WHERE l.state = NEW.state AND l.suburb_slug = NEW.suburb_slug
  ORDER BY (NEW.postcode = ANY (l.postcodes)) DESC, l.code
  LIMIT 1;
  IF NOT FOUND THEN
    SELECT p.latitude, p.longitude INTO NEW.latitude, NEW.longitude
    FROM postcodes p
    WHERE p.postcode = NEW.postcode;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER salons_set_coordinates BEFORE INSERT OR UPDATE OF state, suburb_slug, postcode
  ON salons FOR EACH ROW EXECUTE FUNCTION set_coordinates();
--> statement-breakpoint
CREATE TRIGGER jobs_set_coordinates BEFORE INSERT OR UPDATE OF state, suburb_slug, postcode
  ON jobs FOR EACH ROW EXECUTE FUNCTION set_coordinates();
--> statement-breakpoint
-- Place the salons and jobs already there (naming the columns fires the triggers).
UPDATE salons SET postcode = postcode;
--> statement-breakpoint
UPDATE jobs SET postcode = postcode;
