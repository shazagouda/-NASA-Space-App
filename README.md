# NASA | Beyond Earth — React version

Ported from the Angular project: same pages, data, scoring engine, 3D models and map.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview
```

- **Stack:** React 19, React Router 7, Vite, TypeScript, three.js, MapLibre, Chart.js, jsPDF.
- **State:** `src/app/core/signals.ts` is a tiny signals library (same model as the Angular services); components read it with `useSig(() => service.thing())`.
- **Styles:** each Angular component's styles became a plain `.css` file scoped by a wrapper class (`.c-navbar`, `.pg-home`…), using native CSS nesting.
- **Config / live API:** `public/assets/config.json`, unchanged.
- The app intentionally does not use `<StrictMode>` (the WebGL scenes must not mount twice in dev).
- Production CSP is injected by `vite.config.ts` at build time only.
- SPA hosting needs a fallback to `index.html` (see `public/_headers`).

## Data

The app ships **without any region or Earth-site data**. The Moon and Mars descriptions in `src/app/data/planets.ts` and the physics figures in `src/app/data/planet-physics.ts` are fixed reference facts; everything else comes from outside:

- **API:** set `mode` to `live` and `apiBaseUrl` in `public/assets/config.json`. The app calls `GET /regions`, `GET /analogs`, `POST /analogs/search` and `POST /assistant`. Every response goes through `core/security/validators.ts` before it is used.
- **Record shape:** see `public/assets/templates/dataset-template.json` (JSON) and the two CSV templates.
- **Map layers:** none are generated. A layer is enabled only when `layerRasters` in `config.json` names an equirectangular image for that planet and layer.
- Until data is connected, Explore shows an empty list and the later steps stay locked.
