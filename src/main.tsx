import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/space-grotesk/index.css';
import '@fontsource-variable/inter/index.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { App } from './app/app';
import { configService } from './app/core/api/app-config';
import { catalog } from './app/core/services/data-catalog.service';

// Not wrapped in <StrictMode>: the WebGL scenes own their GL context and must not be mounted twice in development.
async function boot() {
  await configService.load();
  // live data loads in the background; the app renders with demo data until (and unless) it arrives
  void catalog.loadLive();
  createRoot(document.getElementById('root')!).render(<BrowserRouter><App /></BrowserRouter>);
}
void boot();
