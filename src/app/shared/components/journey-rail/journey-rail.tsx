import { Link, useLocation } from 'react-router-dom';
import { exploration as state } from '../../../core/services/exploration-state.service';
import { useSig } from '../../../core/signals';
import { useT } from '../../../core/services/i18n.service';
import './journey-rail.css';

interface Step { label: string; ar: string; path: string; needsRegion: boolean }

const STEPS: Step[] = [
  { label: 'Choose region', ar: 'اختيار المنطقة', path: '/explore', needsRegion: false },
  { label: 'Fingerprint', ar: 'البصمة', path: '/fingerprint', needsRegion: true },
  { label: 'Earth analogs', ar: 'نظائر الأرض', path: '/analogs', needsRegion: true },
  { label: 'Ranking', ar: 'الترتيب', path: '/ranking', needsRegion: true },
  { label: 'Why it matches', ar: 'سبب التطابق', path: '/compare', needsRegion: true },
  { label: 'Report', ar: 'التقرير', path: '/report', needsRegion: true },
];

export function JourneyRail() {
  const { pathname } = useLocation();
  const t = useT();
  const region = useSig(() => state.region());
  const planet = useSig(() => state.planet());
  const current = STEPS.findIndex(s => pathname.startsWith(s.path));
  const hasRegion = !!region;

  return (
    <div className="c-journey">
      <nav className="rail" aria-label={t('Exploration progress', 'تقدّم الاستكشاف')}>
        <ol>
          {STEPS.map((s, i) => {
            const locked = s.needsRegion && !hasRegion;
            return (
              <li key={s.path} className={`${i === current ? 'cur ' : ''}${i < current ? 'done ' : ''}${locked ? 'lock' : ''}`.trim()}>
                {locked ? (
                  <span className="step" aria-disabled="true"><b className="mono">{i + 1}</b><em>{t(s.label, s.ar)}</em></span>
                ) : (
                  <Link className="step" to={s.path} aria-current={i === current ? 'step' : undefined}><b className="mono">{i + 1}</b><em>{t(s.label, s.ar)}</em></Link>
                )}
              </li>
            );
          })}
        </ol>
        {region && <p className="ctx mono"><span className="muted">{planet?.name}</span> {region.name}</p>}
      </nav>
    </div>
  );
}
