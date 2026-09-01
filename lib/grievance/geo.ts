/**
 * Coarse geographic bucketing, without PostGIS.
 *
 * Phase 4 of the strategy calls for GIS hotspots. Until then, hotspots are
 * computed by rounding coordinates onto a grid and grouping - which is enough
 * to answer "where do complaints cluster" and needs no extension, no new
 * container and no migration when the real thing lands.
 */

/**
 * Grid resolution in decimal degrees. ~0.01 deg is roughly 1.1km of latitude,
 * which is about the size of a neighbourhood - small enough that a hotspot
 * means something, large enough that two reports of one pothole land together.
 */
const CELL = 0.01

/**
 * A stable id for the grid cell a coordinate falls in.
 *
 * Not a real geohash - a plain rounded "lat:lng" pair. The name is kept
 * because that is the column's job, and swapping in a true geohash later is a
 * change to this one function.
 */
export function cellFor(latitude: number, longitude: number) {
  const lat = Math.floor(latitude / CELL) * CELL
  const lng = Math.floor(longitude / CELL) * CELL
  return `${lat.toFixed(2)}:${lng.toFixed(2)}`
}

/** The centre of a cell, for plotting a hotspot back onto a map. */
export function cellCenter(cell: string | null | undefined) {
  if (!cell || typeof cell !== "string") {
    return {
      latitude: null,
      longitude: null,
    }
  }

  const [latRaw, lngRaw] = cell.split(":")
  const lat = Number(latRaw)
  const lng = Number(lngRaw)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      latitude: null,
      longitude: null,
    }
  }

  return {
    latitude: lat + CELL / 2,
    longitude: lng + CELL / 2,
  }
}

/** Whether a pair of coordinates is usable at all. */
export function isValidCoordinate(
  latitude: unknown,
  longitude: unknown,
): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // 0,0 is in the Atlantic - almost always a failed geolocation, not a place.
    !(latitude === 0 && longitude === 0)
  )
}
