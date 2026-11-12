import { Link } from 'react-router-dom';
import { i18n, useT } from '../../../core/services/i18n.service';
import { useSig } from '../../../core/signals';
import './footer.css';

export function Footer() {
  const t = useT();
  const theme = useSig(() => i18n.theme());
  return (
    <div className="c-footer">
      <footer className="foot">
        <div className="container grid">
          <div>
            <p className="logo"><img src={theme === 'light' ? 'assets/logo-terratwin-light.png' : 'assets/logo-terratwin.png'} alt="TerraTwin" width="252" height="48" /></p>
            <p className="muted small note">{t('An independent, educational concept for exploring planetary analog environments. It is not an official NASA product, and NASA marks belong to NASA.', 'مفهوم تعليمي مستقل لاستكشاف البيئات الأرضية المشابهة للكواكب. ليس منتجًا رسميًا لناسا، وعلامات ناسا ملك لها.')}</p>
          </div>
          <nav aria-label={t('Footer', 'روابط التذييل')}>
            <Link to="/">{t('Home', 'الرئيسية')}</Link>
            <Link to="/explore">{t('Explore', 'استكشاف')}</Link>
            <Link to="/analogs">{t('Earth analogs', 'نظائر الأرض')}</Link>
            <Link to="/about">{t('About & method', 'حول المشروع والمنهج')}</Link>
          </nav>
          <p className="data mono">{t('Values are labelled Verified, Derived, Simulated or Unavailable. Simulated values are modelled estimates, not measurements.', 'كل قيمة موسومة بأنها: موثَّقة أو مشتقّة أو محاكاة أو غير متاحة. قيم المحاكاة تقديرات نمذجة وليست قياسات.')}</p>
        </div>
      </footer>
    </div>
  );
}
