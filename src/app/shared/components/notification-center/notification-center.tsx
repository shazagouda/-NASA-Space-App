import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { notifications as svc } from '../../../core/services/notification.service';
import { useSig } from '../../../core/signals';
import { useT } from '../../../core/services/i18n.service';
import './notification-center.css';
import './toast-host.css';

const time = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour12: false });

/** Bell with a history panel. */
export function NotificationCenter() {
  const tr = useT();
  const history = useSig(() => svc.history());
  const unread = useSig(() => svc.unread());
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => svc.markAllRead(), 1200);
    const onDoc = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="c-notif" ref={root}>
      <button className="bell" type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)} aria-label={tr('Notifications', 'الإشعارات')}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <b className="dot">{unread > 9 ? '9+' : unread}</b>}
      </button>

      {open && (
        <section className="panel" role="dialog" aria-label={tr('Notification history', 'سجل الإشعارات')}>
          <header>
            <h2>{tr('Notifications', 'الإشعارات')}</h2>
            <div>
              <button type="button" className="link" onClick={() => svc.markAllRead()} disabled={!unread}>{tr('Mark read', 'تعليم كمقروء')}</button>
              <button type="button" className="link" onClick={() => svc.clear()} disabled={!history.length}>{tr('Clear', 'مسح')}</button>
            </div>
          </header>
          {!history.length && <p className="empty">{tr('Nothing yet. Data, search and report events appear here.', 'لا شيء بعد. ستظهر هنا أحداث البيانات والبحث والتقرير.')}</p>}
          <ul>
            {history.map(n => (
              <li key={n.id} className={`${n.level}${!n.read ? ' unread' : ''}`}>
                <i aria-hidden="true"></i>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                  <span className="mono">{time(n.at)}{n.link && <> · <Link to={n.link.url} onClick={() => setOpen(false)}>{n.link.label}</Link></>}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Toast stack (bottom-right, polite live region). */
export function ToastHost() {
  const toasts = useSig(() => svc.toasts());
  return (
    <div className="c-toasts">
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map(n => (
          <div key={n.id} className={`toast ${n.level}`} role={n.level === 'error' ? 'alert' : 'status'}>
            <i aria-hidden="true"></i>
            <div>
              <strong>{n.title}</strong>
              <p>{n.message}</p>
              {n.link && <Link to={n.link.url}>{n.link.label}</Link>}
            </div>
            <button type="button" onClick={() => svc.dismiss(n.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
