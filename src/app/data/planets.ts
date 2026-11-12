import { PlanetInfo } from '../core/models/science.model';

export const PLANETS: Record<'moon' | 'mars', PlanetInfo> = {
  moon: {
    id: 'moon',
    name: 'Moon',
    label: 'Lunar exploration',
    tagline: 'Airless, ancient, cratered.',
    description:
      'No atmosphere, no weather, and a surface that has recorded four billion years of impacts. Its polar craters hold some of the coldest places ever measured in the solar system.',
    facts: [
      { k: 'Mean radius', v: '1,737.4 km' },
      { k: 'Surface gravity', v: '1.62 m/s²' },
      { k: 'Day–night swing', v: '≈ 290 K' },
      { k: 'Atmosphere', v: 'Exosphere only' },
    ],
    modelUrl: 'assets/models/moon.glb',
    accent: '#c9d4e6',
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    label: 'Martian exploration',
    tagline: 'Dry rivers, dead volcanoes, a canyon the length of a continent.',
    description:
      'A cold desert with a thin carbon-dioxide sky. Its rock record preserves lakes, deltas and volcanism, which is why rovers are sent to craters like Jezero and Gale.',
    facts: [
      { k: 'Mean radius', v: '3,389.5 km' },
      { k: 'Surface gravity', v: '3.73 m/s²' },
      { k: 'Mean surface temp.', v: '≈ −63 °C' },
      { k: 'Surface pressure', v: '≈ 6 mbar' },
    ],
    modelUrl: 'assets/models/mars.glb',
    accent: '#e0885c',
  },
};
