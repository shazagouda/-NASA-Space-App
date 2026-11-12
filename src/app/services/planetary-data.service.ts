import { PlanetId, PlanetInfo, Region } from '../core/models/science.model';
import { catalog } from '../core/services/data-catalog.service';

/** Read-side facade over the catalogue; components never touch the data sources directly. */
export class PlanetaryDataService {
  private cat = catalog;
  planet(id: PlanetId): PlanetInfo { return this.cat.planets[id]; }
  planets(): PlanetInfo[] { return [this.cat.planets.moon, this.cat.planets.mars]; }
  regions(planet: PlanetId): Region[] { return this.cat.regions().filter(r => r.planet === planet); }
  all(): Region[] { return this.cat.regions(); }
  region(id: string | null | undefined): Region | undefined { return this.cat.regions().find(r => r.id === id); }
  isPlanet(id: string): id is PlanetId { return id === 'moon' || id === 'mars'; }
}
export const planetaryData = new PlanetaryDataService();
