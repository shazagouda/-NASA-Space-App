import { CSSProperties, Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from './shared/components/navbar/navbar';
import { Footer } from './shared/components/footer/footer';
import { LoadingScreen } from './shared/components/loading-screen/loading-screen';
import { MissionAssistant } from './shared/components/mission-assistant/mission-assistant';
import { ToastHost } from './shared/components/notification-center/notification-center';
import { JourneyRail } from './shared/components/journey-rail/journey-rail';
import { RegionGuard } from './core/guards/exploration.guard';
import { exploration as state } from './core/services/exploration-state.service';
import { notifications as notes } from './core/services/notification.service';
import { i18n, useT } from './core/services/i18n.service';
import { useSig } from './core/signals';
import './app.css';

const JOURNEY = ['/explore', '/fingerprint', '/analogs', '/ranking', '/compare', '/report'];
const TITLE = 'TerraTwin';

const HomePage = lazy(() => import('./features/home/home').then(m => ({ default: m.HomePage })));
const ExplorePage = lazy(() => import('./features/planetary-exploration/planetary-exploration').then(m => ({ default: m.PlanetaryExplorationPage })));
const FingerprintPage = lazy(() => import('./features/environmental-fingerprint/environmental-fingerprint').then(m => ({ default: m.EnvironmentalFingerprintPage })));
const AnalogsPage = lazy(() => import('./features/earth-analogs/earth-analogs').then(m => ({ default: m.EarthAnalogsPage })));
const RankingPage = lazy(() => import('./features/candidate-ranking/candidate-ranking').then(m => ({ default: m.CandidateRankingPage })));
const ComparePage = lazy(() => import('./features/site-comparison/site-comparison').then(m => ({ default: m.SiteComparisonPage })));
const ReportPage = lazy(() => import('./features/final-report/final-report').then(m => ({ default: m.FinalReportPage })));
const AboutPage = lazy(() => import('./features/about/about').then(m => ({ default: m.AboutPage })));

const TITLES: [string, string, string][] = [
  ['/explore', 'Explore', 'استكشاف'], ['/fingerprint', 'Environmental fingerprint', 'البصمة البيئية'], ['/analogs', 'Earth analogs', 'نظائر الأرض'], ['/ranking', 'Analog ranking', 'ترتيب النظائر'],
  ['/compare', 'Why it matches', 'سبب التطابق'], ['/report', 'Final analog report', 'التقرير النهائي'], ['/about', 'About & method', 'حول المشروع والمنهج'],
];

const Busy = () => <div className="route-bar on"><i></i></div>;

export function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [booted, setBooted] = useState(false);
  const lang = useSig(() => i18n.lang());
  const t = useT();

  const railOn = JOURNEY.some(p => pathname.startsWith(p));
  const footerOn = !pathname.startsWith('/explore');

  // page title + scroll to top on navigation
  useEffect(() => {
    const found = TITLES.find(([p]) => pathname.startsWith(p));
    document.title = found ? `${lang === 'ar' ? found[2] : found[1]} — ${TITLE}` : TITLE;
  }, [pathname, lang]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // open a shared analysis (?s=…) once, then boot animation
  useEffect(() => {
    const shared = new URLSearchParams(location.search).get('s');
    if (shared) {
      if (state.applyShare(shared)) {
        notes.success(i18n.t('Shared analysis opened', 'تم فتح التحليل المشارَك'), i18n.t(`${state.region()?.name ?? 'Region'} loaded with the sender's weights.`, `تم تحميل ${state.region()?.name ?? 'المنطقة'} بأوزان المُرسِل.`), { key: 'share-ok' });
        navigate('/report', { replace: true });
      } else {
        notes.error(i18n.t('Link could not be opened', 'تعذّر فتح الرابط'), i18n.t('The shared link is malformed or refers to data this build does not have.', 'الرابط المُشارَك غير صالح أو يشير إلى بيانات غير موجودة في هذه النسخة.'), { key: 'share-bad' });
        navigate('/', { replace: true });
      }
    }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ready = (document as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve();
    let t: number;
    Promise.race([ready, new Promise(r => setTimeout(r, 1500))]).then(() => { t = window.setTimeout(() => setBooted(true), reduced ? 0 : 900); });
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app" style={{ '--rail-h': railOn ? '44px' : '0px' } as CSSProperties}>
      <LoadingScreen done={booted} />
      <a className="skip" href="#main">{t('Skip to content', 'تخطَّ إلى المحتوى')}</a>
      <Navbar />
      {railOn && <JourneyRail />}
      <main id="main">
        <Suspense fallback={<Busy />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/explore/:planet" element={<ExplorePage />} />
            <Route path="/fingerprint" element={<RegionGuard><FingerprintPage /></RegionGuard>} />
            <Route path="/analogs" element={<RegionGuard><AnalogsPage /></RegionGuard>} />
            <Route path="/ranking" element={<RegionGuard><RankingPage /></RegionGuard>} />
            <Route path="/compare" element={<RegionGuard><ComparePage /></RegionGuard>} />
            <Route path="/report" element={<RegionGuard><ReportPage /></RegionGuard>} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {footerOn && <Footer />}
      <MissionAssistant />
      <ToastHost />
    </div>
  );
}
