import * as THREE from 'three';
import { PlanetId } from '../models/science.model';

/**
 * The provided Moon and Mars models use cube-sphere UV layouts, so a surface coordinate can't be
 * derived from UVs analytically. The mapping below was calibrated against recognisable surface features
 * (Copernicus, Kepler, Aristarchus on the Moon; Olympus Mons and Elysium Mons on Mars) in the textures:
 *   Moon: azimuth θ = lon + 90°, Mars: θ = lon + 180°, with direction = (cosφ·cosθ, sinφ, −cosφ·sinθ).
 */
const LON_OFFSET: Record<PlanetId, number> = { moon: 90, mars: 180 };

export function surfaceDirection(planet: PlanetId, latDeg: number, lonDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(latDeg);
  const theta = THREE.MathUtils.degToRad(lonDeg + LON_OFFSET[planet]);
  return out.set(Math.cos(phi) * Math.cos(theta), Math.sin(phi), -Math.cos(phi) * Math.sin(theta)).normalize();
}

export const planetLonOffset = (p: PlanetId): number => LON_OFFSET[p];

/** Inverse of surfaceDirection: a unit vector in the planet's local frame → latitude / longitude in degrees. */
export function surfaceCoordinate(planet: PlanetId, dir: THREE.Vector3): { lat: number; lon: number } {
  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(-dir.z, dir.x)) - LON_OFFSET[planet];
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon };
}
