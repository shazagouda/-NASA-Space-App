import { PlanetId } from '../core/models/science.model';

/** Published reference figures, rounded. These are the properties no Earth site can reproduce. */
export interface PhysicsRow { key: 'atmosphere' | 'gravity' | 'radiation'; label: string; planet: string; earth: string; ratio: string; effect: string; source: string }

export const PHYSICS: Record<PlanetId, PhysicsRow[]> = {
  moon: [
    { key: 'atmosphere', label: 'Atmosphere', planet: 'Virtually none (surface exosphere)', earth: '101.3 kPa', ratio: 'About 0 %', effect: 'No wind, no weathering by air or water, no heat transport. Dust is sharp and electrostatically charged.', source: 'Standard planetary fact sheets' },
    { key: 'gravity', label: 'Gravity', planet: '1.62 m/s²', earth: '9.81 m/s²', ratio: '16.5 %', effect: 'Changes how slopes fail, how dust and regolith behave, and how people and rovers move.', source: 'Standard planetary fact sheets' },
    { key: 'radiation', label: 'Radiation', planet: 'About 1.4 mSv per day on the surface', earth: 'About 0.007 mSv per day average', ratio: 'Roughly 200×', effect: 'Unshielded galactic cosmic rays and solar particles: affects crew, electronics and any biology.', source: 'Chang’E-4 lander dosimetry (Zhang et al., 2020), rounded' },
  ],
  mars: [
    { key: 'atmosphere', label: 'Atmosphere', planet: 'About 0.6 kPa, mostly CO₂', earth: '101.3 kPa', ratio: 'About 0.6 %', effect: 'Thin air still moves dust and sand, but it cannot hold heat or liquid water, and gives little shielding.', source: 'Standard planetary fact sheets' },
    { key: 'gravity', label: 'Gravity', planet: '3.71 m/s²', earth: '9.81 m/s²', ratio: '38 %', effect: 'Lower load on structures and slopes, different sediment transport, different locomotion.', source: 'Standard planetary fact sheets' },
    { key: 'radiation', label: 'Radiation', planet: 'About 0.65 mSv per day on the surface', earth: 'About 0.007 mSv per day average', ratio: 'Roughly 90×', effect: 'Thin atmosphere and no global magnetic field leave the surface exposed to cosmic rays.', source: 'MSL RAD (Hassler et al., 2014), rounded' },
  ],
};
