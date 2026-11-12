import { FormEvent, useEffect, useRef, useState } from 'react';
import { AssistantService, assistant as svc } from '../../../core/services/assistant.service';
import { useSig } from '../../../core/signals';
import { useT } from '../../../core/services/i18n.service';
import './mission-assistant.css';

interface Msg { from: 'user' | 'bot'; text: string }

export function MissionAssistant() {
  const t = useT();
  const open = useSig(() => svc.open());
  // suggestions depend on the selected region, so recompute when the exploration state changes
  const suggestions = useSig(() => svc.suggestions());
  const [remote, setRemote] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => { const l = log.current; if (l) l.scrollTop = l.scrollHeight; }, [msgs, typing, open]);

  const ask = (q: string) => {
    q = q.trim().slice(0, AssistantService.MAX_LEN);
    if (!q || typing) return;
    setMsgs(m => [...m, { from: 'user', text: q }]);
    setDraft('');
    setTyping(true);
    const started = performance.now();
    svc.reply(q).then(r => {
      setRemote(r.remote);
      const wait = Math.max(0, 450 - (performance.now() - started));
      setTimeout(() => { setMsgs(m => [...m, { from: 'bot', text: r.text }]); setTyping(false); }, wait);
    });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); ask(draft); };

  return (
    <div className="c-assistant">
      {open && (
        <section id="assistant-panel" className="panel glass" aria-label={t('Mission assistant', 'مساعد المهمة')}>
          <header>
            <h2 className="h3">{t('Mission assistant', 'مساعد المهمة')}</h2>
            <p className="mono">{remote ? t('Answers come from the connected assistant service.', 'الإجابات تأتي من خدمة المساعد المتصلة.') : t('Answers are written from the data on screen. No AI model is connected.', 'الإجابات مكتوبة من البيانات المعروضة على الشاشة. لا يوجد نموذج ذكاء اصطناعي متصل. (الإجابات بالإنجليزية حاليًا)')}</p>
          </header>
          <div className="log scrollbar-thin" ref={log} role="log" aria-live="polite">
            {!msgs.length && <p className="empty muted small">{t('Ask about the region, the scores or the limits of an Earth analog.', 'اسأل عن المنطقة أو الدرجات أو حدود النظير الأرضي.')}</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`msg${m.from === 'user' ? ' user' : ''}`}>
                {m.text.split('\n\n').map((p, j) => <p key={j}>{p}</p>)}
              </div>
            ))}
            {typing && <div className="msg"><p className="mono muted">{t('Reading the data…', 'جارٍ قراءة البيانات…')}</p></div>}
          </div>
          <div className="chips">
            {suggestions.map(s => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
          </div>
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="q">{t('Ask the assistant', 'اسأل المساعد')}</label>
            <input id="q" name="q" maxLength={AssistantService.MAX_LEN} value={draft} onChange={e => setDraft(e.target.value)} placeholder={t('Ask about this exploration', 'اسأل عن هذا الاستكشاف')} autoComplete="off" />
            <button className="btn sm" type="submit" disabled={!draft.trim() || typing}>{t('Ask', 'اسأل')}</button>
          </form>
        </section>
      )}
    </div>
  );
}
