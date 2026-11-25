/**
 * "Near me" for the job and salon searches (D-10): use the browser's location, or a postcode, and
 * a distance. The position is rounded to about 1km before it goes in the address; places are at
 * their suburb's centre, so nothing finer would help.
 */
import {
  DEFAULT_RADIUS_KM,
  formatDistance,
  roughCoordinate,
  SEARCH_RADII_KM,
  type SearchRadiusKm,
} from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import { useState } from "react";
import { selectClass } from "./form";

export interface NearValues {
  /** The searcher's position, rounded. */
  lat?: number | undefined;
  lng?: number | undefined;
  /** A postcode to search near instead. */
  near?: string | undefined;
  km?: SearchRadiusKm | undefined;
}

const inRange = (value: unknown, min: number, max: number) => {
  const n = Number(value);
  return typeof value !== "undefined" && value !== "" && Number.isFinite(n) && n >= min && n <= max
    ? roughCoordinate(n)
    : undefined;
};

/** The near-me part of a search's address, checked. A position needs both halves. */
export function parseNear(search: Record<string, unknown>): NearValues {
  const lat = inRange(search.lat, -45, -9);
  const lng = inRange(search.lng, 112, 154);
  const point = lat !== undefined && lng !== undefined;
  const near =
    !point && typeof search.near === "string" && /^\d{4}$/.test(search.near.trim())
      ? search.near.trim()
      : undefined;
  const km = SEARCH_RADII_KM.find((r) => String(r) === String(search.km));
  return point
    ? { lat, lng, km: km ?? DEFAULT_RADIUS_KM }
    : near
      ? { near, km: km ?? DEFAULT_RADIUS_KM }
      : {};
}

export const isNear = (values: NearValues) =>
  (values.lat !== undefined && values.lng !== undefined) || values.near !== undefined;

/** The near-me values as query parameters (strings), for links and the API. */
export function nearParams(values: NearValues): Record<string, string | undefined> {
  if (!isNear(values)) return {};
  return {
    lat: values.lat?.toString(),
    lng: values.lng?.toString(),
    near: values.near,
    km: String(values.km ?? DEFAULT_RADIUS_KM),
  };
}

/** The near-me values as the API takes them. */
export function nearQuery(values: NearValues) {
  if (!isNear(values)) return {};
  return {
    lat: values.lat,
    lng: values.lng,
    near: values.near,
    km: String(values.km ?? DEFAULT_RADIUS_KM) as `${SearchRadiusKm}`,
  };
}

/** The near-me values a search form was submitted with. */
export function nearFromForm(form: FormData): NearValues {
  const get = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };
  return parseNear({ lat: get("lat"), lng: get("lng"), near: get("near"), km: get("km") });
}

/** "within 25km of your location", "within 10km of 2010". */
export function describeNear(values: NearValues): string {
  const km = values.km ?? DEFAULT_RADIUS_KM;
  const where = values.near ? values.near : "your location";
  return `within ${km}km of ${where}`;
}

export const distanceText = (km: number | null | undefined) =>
  km === null || km === undefined ? null : `${formatDistance(km)} away`;

/**
 * The near-me fields, inside a search form. "Use my location" asks the browser, then submits the
 * form with the position; if the browser can't or won't say, a postcode does instead.
 */
export function NearMeFields({ values }: { values: NearValues }) {
  const [point, setPoint] = useState(
    values.lat !== undefined && values.lng !== undefined
      ? { lat: values.lat, lng: values.lng }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function locate(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!("geolocation" in navigator)) {
      setProblem("This browser can't share your location. Enter a postcode instead.");
      return;
    }
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const lat = roughCoordinate(position.coords.latitude);
        const lng = roughCoordinate(position.coords.longitude);
        if (lat < -45 || lat > -9 || lng < 112 || lng > 154) {
          setProblem("You seem to be outside Australia. Enter a postcode instead.");
          return;
        }
        setPoint({ lat, lng });
        // Submit once the position is in the form.
        setTimeout(() => form?.requestSubmit(), 0);
      },
      (error) => {
        setLocating(false);
        setProblem(
          error.code === error.PERMISSION_DENIED
            ? "Location is turned off for this site. Enter a postcode instead."
            : "We couldn't find your location. Enter a postcode instead.",
        );
      },
      { maximumAge: 10 * 60_000, timeout: 10_000 },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {point ? (
        <>
          <input type="hidden" name="lat" value={point.lat} />
          <input type="hidden" name="lng" value={point.lng} />
          <span>Near your location</span>
          <Button type="button" variant="link" size="sm" onClick={() => setPoint(null)}>
            Clear
          </Button>
        </>
      ) : (
        <>
          <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
            {locating ? "Finding you…" : "Use my location"}
          </Button>
          <span className="text-muted-foreground">or near postcode</span>
          <Input
            name="near"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="2000"
            aria-label="Near postcode"
            className="w-20"
            defaultValue={values.near}
          />
        </>
      )}
      <select
        name="km"
        aria-label="Distance"
        className={selectClass.replace("w-full ", "w-auto ")}
        defaultValue={String(values.km ?? DEFAULT_RADIUS_KM)}
      >
        {SEARCH_RADII_KM.map((km) => (
          <option key={km} value={km}>
            Within {km}km
          </option>
        ))}
      </select>
      {problem && (
        <p role="alert" className="basis-full text-muted-foreground">
          {problem}
        </p>
      )}
    </div>
  );
}
