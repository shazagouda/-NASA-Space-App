import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { assistant } from '../../../core/services/assistant.service';
import { i18n, useT } from '../../../core/services/i18n.service';
import { useSig } from '../../../core/signals';
import { NotificationCenter } from '../notification-center/notification-center';
import './navbar.css';

const active = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined);

// pages whose top section is a photo / video: the bar stays light-on-dark there until it turns solid
const MEDIA_TOP = ['/', '/about'];

export function Navbar() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const aiOpen = useSig(() => assistant.open());
  const lang = useSig(() => i18n.lang());
  const theme = useSig(() => i18n.theme());
  const t = useT();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // close the mobile menu after every navigation
  useEffect(() => { setOpen(false); setSolid(window.scrollY > 40); }, [location.pathname]);

  const overMedia = !solid && !open && MEDIA_TOP.includes(location.pathname);

  return (
    <div className="c-navbar">
      <header className={`nav${solid ? ' solid' : ''}${open ? ' open' : ''}${overMedia ? ' force-dark' : ''}`}>
        <Link className="logo" to="/" aria-label={t('TerraTwin home', 'TerraTwin – الصفحة الرئيسية')}><img src={theme === 'light' && !overMedia ? 'assets/logo-terratwin-light.png' : 'assets/logo-terratwin.png'} alt="TerraTwin" width="252" height="48" /></Link>
        <nav id="primary-nav" aria-label={t('Primary', 'القائمة الرئيسية')}>
          <NavLink to="/" end className={active}>{t('Home', 'الرئيسية')}</NavLink>
          <NavLink to="/explore" className={active}>{t('Explore', 'استكشاف')}</NavLink>
          <NavLink to="/analogs" className={active}>{t('Earth analogs', 'نظائر الأرض')}</NavLink>
          <NavLink to="/about" className={active}>{t('About', 'حول')}</NavLink>
          <Link className="btn sm cta" to="/explore">{t('Start exploration', 'ابدأ الاستكشاف')}</Link>
        </nav>
        <div className="tools">
          <div className="seg" role="group" aria-label={t('Colour theme', 'وضع الألوان')}>
            <button type="button" className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} onClick={() => i18n.setTheme('light')} title={t('Light mode', 'الوضع الفاتح')}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              <span className="sr-only">{t('Light', 'فاتح')}</span>
            </button>
            <button type="button" className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} onClick={() => i18n.setTheme('dark')} title={t('Dark mode', 'الوضع الداكن')}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
              <span className="sr-only">{t('Dark', 'داكن')}</span>
            </button>
          </div>
          <div className="seg" role="group" aria-label={t('Language', 'اللغة')}>
            <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => i18n.setLang('en')} lang="en" title="English">EN</button>
            <button type="button" className={lang === 'ar' ? 'on' : ''} aria-pressed={lang === 'ar'} onClick={() => i18n.setLang('ar')} lang="ar" title="العربية">عربي</button>
          </div>
          <button className="ask" type="button" onClick={() => assistant.open.set(!assistant.open())} aria-expanded={aiOpen} aria-controls="assistant-panel"><i></i><span>{t('Assistant', 'المساعد')}</span></button>
          <NotificationCenter />
        </div>
        <button className="burger" type="button" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(v => !v)}>
          <span className="sr-only">{t('Menu', 'القائمة')}</span><i></i><i></i>
        </button>
      </header>
    </div>
  );
}
