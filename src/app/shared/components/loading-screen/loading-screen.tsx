import { useT } from '../../../core/services/i18n.service';
import './loading-screen.css';

export function LoadingScreen({ done }: { done: boolean }) {
  const t = useT();
  return (
    <div className="c-loading">
      <div className={`ls${done ? ' done' : ''} force-dark`} role="status" aria-live="polite" aria-hidden={done}>
        <div className="orb"><i></i><i></i><b></b></div>
        <p className="mono">{t('Initialising mission console', 'جارٍ تهيئة لوحة المهمة')}</p>
        <p className="mono sub" dir="ltr">LAT 00.0000° · LON 000.0000° · ALT ——</p>
      </div>
    </div>
  );
}
