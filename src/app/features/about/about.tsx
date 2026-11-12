import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ModelStage } from '../../shared/components/model-stage/model-stage';
import { AboutGlobe } from './about-globe';
import { motion } from '../../core/services/motion.service';
import { useSig } from '../../core/signals';
import { i18n, useT } from '../../core/services/i18n.service';
import { LAYERS } from '../../core/services/layer.service';
import { DEFAULT_WEIGHTS, DIM_LABELS } from '../../core/models/science.model';
import './about.css';

const STEPS = [
  { t: 'Select your target', q: 'What are we exploring?', ta: 'اختر هدفك', qa: 'ماذا سنستكشف؟' },
  { t: 'Explore the planetary map', q: 'Choose your destination.', ta: 'استكشف خريطة الكوكب', qa: 'اختر وجهتك.' },
  { t: 'Environmental fingerprint', q: 'Every location has a scientific identity.', ta: 'البصمة البيئية', qa: 'لكل موقع هوية علمية.' },
  { t: 'Search for Earth analogs', q: 'Where on Earth can we find a similar environment?', ta: 'ابحث عن نظائر أرضية', qa: 'أين على الأرض نجد بيئة مشابهة؟' },
  { t: 'Rank the candidates', q: 'Not all similarities are equal.', ta: 'رتِّب المرشَّحين', qa: 'ليست كل أوجه التشابه متساوية.' },
  { t: 'Understand the results', q: 'Why does this location match?', ta: 'افهم النتائج', qa: 'لماذا يتطابق هذا الموقع؟' },
  { t: 'Generate the final report', q: 'From exploration to scientific conclusion.', ta: 'أنشئ التقرير النهائي', qa: 'من الاستكشاف إلى الخلاصة العلمية.' },
];
const TARGETS = {
  moon: { name: 'Moon', ar: 'القمر', url: 'assets/models/moon.glb', text: 'Explore lunar environments and discover potential Earth analogs.', textAr: 'استكشف البيئات القمرية واكتشف نظائرها الأرضية المحتملة.' },
  mars: { name: 'Mars', ar: 'المريخ', url: 'assets/models/mars.glb', text: 'Explore Martian environments and discover potential Earth analogs.', textAr: 'استكشف البيئات المريخية واكتشف نظائرها الأرضية المحتملة.' },
} as const;
const FEATURES = [
  ['Moon / Mars target selection', 'Start by choosing which world you want to study.', 'اختيار هدف القمر / المريخ', 'ابدأ باختيار العالم الذي تريد دراسته.'],
  ['Interactive planetary map', 'Rotate a 3D planet and switch between data layers.', 'خريطة كوكبية تفاعلية', 'دوِّر كوكبًا ثلاثي الأبعاد وبدِّل بين طبقات البيانات.'],
  ['Location selection', 'Click the surface to pick the region you want to analyse.', 'اختيار الموقع', 'اضغط على السطح لاختيار المنطقة التي تريد تحليلها.'],
  ['Location information', 'Read what is known about the region: coordinates, size, surface and geology notes.', 'معلومات الموقع', 'اقرأ ما هو معروف عن المنطقة: الإحداثيات والحجم وملاحظات السطح والجيولوجيا.'],
  ['Environmental fingerprint', 'See the region as a set of measurable characteristics, each tagged by where the value came from.', 'البصمة البيئية', 'شاهد المنطقة كمجموعة خصائص قابلة للقياس، وكل قيمة موسومة بمصدرها.'],
  ['Earth analog search', 'Compare the fingerprint with a catalogue of Earth sites.', 'البحث عن نظائر أرضية', 'قارن البصمة بفهرس من المواقع الأرضية.'],
  ['Ranked candidate locations', 'Candidates are ordered by a weighted similarity model.', 'ترتيب المواقع المرشَّحة', 'تُرتَّب المواقع المرشَّحة بنموذج تشابه موزون.'],
  ['Analog similarity score', 'One score per candidate, shown with a range that covers missing data.', 'درجة تشابه النظير', 'درجة واحدة لكل مرشَّح، مع نطاق يراعي البيانات الناقصة.'],
  ['Explainable similarity', 'Every score lists what matches, what differs and what is missing.', 'تشابه قابل للتفسير', 'كل درجة تذكر ما يتطابق وما يختلف وما هو ناقص.'],
  ['Earth vs. Moon/Mars comparison', 'Put a planetary region and an Earth site side by side.', 'مقارنة الأرض بالقمر/المريخ', 'ضع منطقة كوكبية وموقعًا أرضيًا جنبًا إلى جنب.'],
  ['Known analog comparison', 'Check candidates against established analog research sites.', 'مقارنة بالنظائر المعروفة', 'قارن المرشَّحين بمواقع أبحاث النظائر المعتمدة.'],
  ['Data confidence', 'See how complete and reliable the numbers behind a result are.', 'موثوقية البيانات', 'اعرف مدى اكتمال الأرقام وراء النتيجة ومدى الوثوق بها.'],
  ['Final analog report', 'One page with the result, its evidence and its limits, ready to share.', 'تقرير النظير النهائي', 'صفحة واحدة بالنتيجة ودليلها وحدودها، جاهزة للمشاركة.'],
  ['AI planetary research assistant', 'Ask questions about a result in plain language.', 'مساعد الأبحاث الكوكبية', 'اسأل عن أي نتيجة بلغة بسيطة.'],
] as const;
const PIPE = [['Planetary data', 'بيانات الكواكب'], ['Data processing', 'معالجة البيانات'], ['Environmental fingerprint', 'البصمة البيئية'], ['Earth datasets', 'بيانات الأرض'], ['Similarity engine', 'محرّك التشابه'], ['Candidate ranking', 'ترتيب المرشَّحين'], ['Explainable results', 'نتائج قابلة للتفسير'], ['Final report', 'التقرير النهائي']] as const;
const LAB = {
  earth: { name: 'Earth', ar: 'الأرض', facts: ['Liquid water', 'Dense atmosphere', 'Diverse geological environments', 'The reference planet for Earth analog research'], factsAr: ['مياه سائلة', 'غلاف جوي كثيف', 'بيئات جيولوجية متنوعة', 'الكوكب المرجعي لأبحاث النظائر الأرضية'] },
  moon: { name: 'Moon', ar: 'القمر', facts: ['Extremely thin exosphere', 'Low gravity', 'Cratered surface', 'Regolith-covered terrain'], factsAr: ['غلاف خارجي رقيق جدًا', 'جاذبية منخفضة', 'سطح مليء بالفوهات', 'تضاريس مغطاة بالريغوليث'] },
  mars: { name: 'Mars', ar: 'المريخ', facts: ['Thin atmosphere', 'Lower gravity than Earth', 'Rocky and dusty surface', 'Evidence of ancient water activity'], factsAr: ['غلاف جوي رقيق', 'جاذبية أقل من الأرض', 'سطح صخري مغبّر', 'أدلة على نشاط مائي قديم'] },
} as const;
const LAYER_AR: Record<string, [string, string]> = {
  terrain: ['التضاريس', 'السطح الفوتوغرافي للنموذج بدون أي طبقة فوقه.'],
  elevation: ['الارتفاع', 'الارتفاع بالنسبة إلى السطح المرجعي.'],
  temperature: ['درجة الحرارة', 'متوسط درجة حرارة السطح.'],
  geology: ['الجيولوجيا', 'فئة الصخور أو مواد السطح السائدة.'],
  minerals: ['المعادن', 'فئة المعادن السائدة.'],
  slope: ['الانحدار', 'شدّة انحدار السطح.'],
};
const DIM_AR: Record<string, string> = { temperature: 'درجة الحرارة', terrain: 'التضاريس', elevation: 'الارتفاع', geology: 'الجيولوجيا', mineral: 'المعادن', slope: 'انحدار السطح', aridity: 'الجفاف' };

export function AboutPage() {
  const reduced = useSig(() => motion.reduced());
  const t = useT();
  const ar = useSig(() => i18n.lang() === 'ar');
  const dimName = (k: string) => (ar ? DIM_AR[k] ?? k : DIM_LABELS[k as keyof typeof DIM_LABELS] ?? k);
  const vid = useRef<HTMLVideoElement>(null);
  const [vidFailed, setVidFailed] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<'moon' | 'mars'>('mars');
  const [layer, setLayer] = useState(LAYERS[1].id);
  const [feat, setFeat] = useState(0);
  const [lab, setLab] = useState<keyof typeof LAB>('mars');
  const panels = useRef<(HTMLElement | null)[]>([]);

  // The full mission video is the hero background. Browsers only allow sound after the person has interacted with the page,
  // so: try with sound first; if it is blocked, play silently and switch the sound on at the first click / key press / tap.
  useEffect(() => {
    const v = vid.current; if (!v) return;
    if (reduced) { v.pause(); setSoundOn(false); return; }
    let alive = true;
    const events = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
    const unlock = (e?: Event) => {
      if (!alive || (e?.target as Element | null)?.closest?.('.snd')) return; // the sound button handles its own click
      v.muted = false; v.volume = 1;
      v.play().then(() => { if (alive) { setSoundOn(true); stop(); } }).catch(() => { v.muted = true; v.play().catch(() => { /* poster stays */ }); });
    };
    const stop = () => events.forEach(e => window.removeEventListener(e, unlock));
    v.muted = false; v.volume = 1;
    v.play().then(() => { if (alive) setSoundOn(true); }).catch(() => {
      v.muted = true;
      v.play().catch(() => { /* poster stays */ });
      if (alive) { setSoundOn(false); events.forEach(e => window.addEventListener(e, unlock, { passive: true })); }
    });
    const onVis = () => { if (document.hidden) v.pause(); else v.play().catch(() => { /* ignore */ }); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; stop(); document.removeEventListener('visibilitychange', onVis); v.pause(); };
  }, [reduced, vidFailed]);

  const toggleSound = () => {
    const v = vid.current; if (!v) return;
    if (v.paused) v.play().catch(() => { /* ignore */ });
    v.muted = !v.muted; v.volume = 1;
    setSoundOn(!v.muted);
  };

  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.i)); }), { rootMargin: '-45% 0px -45% 0px' });
    panels.current.forEach(p => p && io.observe(p));
    return () => io.disconnect();
  }, []);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const L = LAYERS.find(l => l.id === layer)!;
  const labFacts: readonly string[] = ar ? LAB[lab].factsAr : LAB[lab].facts;
  const ramp = L.ramp ? `linear-gradient(90deg, ${L.ramp.join(',')})` : 'linear-gradient(90deg,#3a3f4d,#9aa0ad)';

  return (
    <div className="pg-about ab3">
      {/* ── hero ── */}
      <section className="hx force-dark" aria-labelledby="hx-t">
        <div className="hx-media" aria-hidden="true">
          {!vidFailed && (
            <video ref={vid} loop playsInline preload="auto" poster="assets/videos/about-hero-poster.jpg" onError={() => setVidFailed(true)}>
              <source src="assets/videos/terratwin-mission.mp4" type="video/mp4" />
            </video>
          )}
          <div className="hx-shade"></div>
        </div>
        <div className="container hx-in">
          <h1 id="hx-t">{t('Beyond Earth', 'ما وراء الأرض')}</h1>
          <p className="hx-sub">{t('Discover Earth’s closest environments to other worlds.', 'اكتشف أقرب بيئات الأرض إلى العوالم الأخرى.')}</p>
          <p className="hx-txt">{t('What if we could find a place on Earth that feels like standing on Mars or the Moon? Explore planetary environments, uncover Earth analogs, and discover the science behind the similarities.', 'ماذا لو وجدنا مكانًا على الأرض يشبه الوقوف على المريخ أو القمر؟ استكشف البيئات الكوكبية، واكتشف نظائرها الأرضية، وتعرّف على العلم وراء أوجه التشابه.')}</p>
          <div className="hx-cta">
            <button className="btn" type="button" onClick={() => go('mission')}>{t('Explore the mission', 'استكشف المهمة')}</button>
            <button className="btn ghost" type="button" onClick={() => go('science')}>{t('Discover the science', 'اكتشف العلم')}</button>
            {!vidFailed && !reduced && (
              <button className={`btn ghost snd${soundOn ? ' on' : ''}`} type="button" onClick={toggleSound} aria-pressed={soundOn}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  {soundOn ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></> : <><path d="m16 9 5 6" /><path d="m21 9-5 6" /></>}
                </svg>
                {soundOn ? t('Sound on', 'الصوت يعمل') : t('Sound off — tap to listen', 'الصوت مغلق — اضغط للاستماع')}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── big question ── */}
      <section className="bq container" aria-labelledby="bq-t">
        <h2 id="bq-t" className="h1">{t('Can we find another world on Earth?', 'هل نستطيع أن نجد عالمًا آخر على الأرض؟')}</h2>
        <div className="bq-grid">
          <p>{t('Scientists need places on Earth to study planetary conditions, test exploration technology and rehearse future missions. Finding the right place is hard, because every world differs in geology, surface, temperature, terrain, minerals and environment.', 'يحتاج العلماء إلى أماكن على الأرض لدراسة الظروف الكوكبية واختبار تقنيات الاستكشاف والتدرّب على المهام المقبلة. والعثور على المكان المناسب صعب، لأن كل عالم يختلف في الجيولوجيا والسطح والحرارة والتضاريس والمعادن والبيئة.')}</p>
          <p>{t('This platform helps identify, compare, rank and explain Earth environments that resemble a chosen region of the Moon or Mars, using scientific data.', 'تساعد هذه المنصة على تحديد البيئات الأرضية التي تشبه منطقة مختارة من القمر أو المريخ ومقارنتها وترتيبها وتفسيرها، اعتمادًا على بيانات علمية.')}</p>
        </div>
        <div className="link-art" aria-hidden="true">
          <svg viewBox="0 0 900 160" preserveAspectRatio="none">
            <defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stopColor="#d9764a" /><stop offset="1" stopColor="#48d9e8" /></linearGradient></defs>
            {[40, 80, 120].map((y, i) => <path key={y} className="flow" style={{ animationDelay: `${i * 0.6}s` }} d={`M60 ${y} C 360 ${160 - y}, 540 ${y}, 840 ${160 - y}`} stroke="url(#lg)" fill="none" />)}
            <circle cx="40" cy="80" r="26" fill="#d9764a" opacity=".85" /><circle cx="860" cy="80" r="26" fill="#2f6f9f" />
          </svg>
          <span style={{ insetInlineStart: 0 }}>{t('Mars', 'المريخ')}</span><span style={{ insetInlineEnd: 0 }}>{t('Earth', 'الأرض')}</span>
        </div>
        <p className="statement">{t('We transform planetary data into meaningful Earth comparisons.', 'نحوّل بيانات الكواكب إلى مقارنات أرضية ذات معنى.')}</p>
        <p className="caveat">{t('An Earth analog is similar in selected ways. It is not a replica of another world, and a good match does not make a place a safe landing site.', 'النظير الأرضي يشبه العالم الآخر في جوانب محددة فقط. وهو ليس نسخة طبق الأصل منه، والتطابق الجيد لا يجعل المكان موقع هبوط آمنًا.')}</p>
      </section>

      {/* ── mission ── */}
      <section id="mission" className="ms" aria-labelledby="ms-t">
        <div className="container">
          <h2 id="ms-t" className="h1">{t('One mission. Seven scientific steps.', 'مهمة واحدة. سبع خطوات علمية.')}</h2>
          <div className="ms-grid">
            <nav className="rail" aria-label={t('Mission steps', 'خطوات المهمة')}>
              <ol>{STEPS.map((s, i) => (
                <li key={s.t}><button type="button" className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => panels.current[i]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })}><b>{i + 1}</b><span>{ar ? s.ta : s.t}</span></button></li>
              ))}</ol>
            </nav>
            <div className="panels">
              {STEPS.map((s, i) => (
                <article key={s.t} data-i={i} ref={el => { panels.current[i] = el; }} className={`pn${i === step ? ' act' : ''}`} aria-labelledby={`pn-${i}`}>
                  <p className="k">{t('Step', 'الخطوة')} {i + 1}</p>
                  <h3 id={`pn-${i}`} className="h2">{ar ? s.ta : s.t}</h3>
                  <p className="q">{ar ? s.qa : s.q}</p>

                  {i === 0 && (<div className="s1">
                    <div className="choose" role="radiogroup" aria-label={t('Choose a world', 'اختر عالمًا')}>
                      {(Object.keys(TARGETS) as (keyof typeof TARGETS)[]).map(k => (
                        <button key={k} role="radio" aria-checked={target === k} className={target === k ? 'on' : ''} onClick={() => setTarget(k)}><b>{ar ? TARGETS[k].ar : TARGETS[k].name}</b><span>{ar ? TARGETS[k].textAr : TARGETS[k].text}</span></button>
                      ))}
                    </div>
                    <div className="stage"><ModelStage key={target} url={TARGETS[target].url} label={t(`3D model of the ${TARGETS[target].name}`, `نموذج ثلاثي الأبعاد لـ${TARGETS[target].ar}`)} tilt={0.2} /></div>
                  </div>)}

                  {i === 1 && (<div className="s2">
                    <p>{t('Pick a region on the planetary map. That choice is the starting point of the analysis. Switch the data layer to see the same surface in a different way.', 'اختر منطقة على خريطة الكوكب. هذا الاختيار هو نقطة بداية التحليل. بدِّل طبقة البيانات لترى السطح نفسه بطريقة مختلفة.')}</p>
                    <div className="chips" role="tablist" aria-label={t('Map layers', 'طبقات الخريطة')}>{LAYERS.map(l => <button key={l.id} role="tab" aria-selected={l.id === layer} className={l.id === layer ? 'on' : ''} onClick={() => setLayer(l.id)}>{ar ? LAYER_AR[l.id]?.[0] ?? l.label : l.label}</button>)}</div>
                    <div className="layer" key={layer}>
                      <div className="swatch" style={{ background: ramp }} aria-hidden="true"></div>
                      <p><b>{ar ? LAYER_AR[L.id]?.[0] ?? L.label : L.label}.</b> {ar ? LAYER_AR[L.id]?.[1] ?? L.blurb : L.blurb}{L.unit ? t(` Shown in ${L.unit}.`, ` تُعرض بوحدة ${L.unit}.`) : ''}</p>
                    </div>
                  </div>)}

                  {i === 2 && (<div className="s3">
                    <p>{t('The environmental fingerprint is a structured description of a location’s environment and geology. It lets us compare planetary and terrestrial places using the same measurable properties.', 'البصمة البيئية وصف منظَّم لبيئة الموقع وجيولوجيته، وتتيح مقارنة المواقع الكوكبية والأرضية بالخصائص القابلة للقياس نفسها.')}</p>
                    <dl className="fp">
                      {([['Temperature', 'الحرارة', 'Mean, minimum and maximum', 'المتوسط والأدنى والأعلى'], ['Elevation', 'الارتفاع', 'Height above the reference surface', 'الارتفاع عن السطح المرجعي'], ['Slope', 'الانحدار', 'Steepness of the ground', 'شدّة انحدار الأرض'], ['Aridity', 'الجفاف', 'Precipitation against evaporation demand', 'الهطول مقابل الطلب على التبخر'], ['Terrain', 'التضاريس', 'Landform classes', 'فئات الأشكال الأرضية'], ['Geology', 'الجيولوجيا', 'Rock and surface-material classes', 'فئات الصخور ومواد السطح'], ['Minerals', 'المعادن', 'Mineral classes', 'فئات المعادن']] as const).map(([k, ka, d, da], n) => (
                        <div key={k} style={{ animationDelay: `${n * 0.12}s` }}><dt>{ar ? ka : k}</dt><dd>{ar ? da : d}</dd></div>
                      ))}
                    </dl>
                  </div>)}

                  {i === 3 && (<div className="s4">
                    <p>{t('The platform searches the Earth site catalogue for places whose characteristics resemble the selected fingerprint. Drag the globe to explore.', 'تبحث المنصة في فهرس المواقع الأرضية عن أماكن تشبه خصائصها البصمة المختارة. اسحب الكرة للاستكشاف.')}</p>
                    <div className="stage"><AboutGlobe label={t('Interactive Earth globe', 'كرة أرضية تفاعلية')} /></div>
                  </div>)}

                  {i === 4 && (<div className="s5">
                    <p>{t('The similarity engine compares seven characteristics with a weighted model. The score depends on the criteria and weights you choose. These are the default weights, and you can change them.', 'يقارن محرّك التشابه سبع خصائص بنموذج موزون. تعتمد الدرجة على المعايير والأوزان التي تختارها. هذه الأوزان الافتراضية ويمكنك تغييرها.')}</p>
                    <ul className="dimbars">{(Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]).map(k => <li key={k}><span>{dimName(k)}</span><i><b style={{ width: `${DEFAULT_WEIGHTS[k] * 5}%` }}></b></i><em className="mono">{DEFAULT_WEIGHTS[k]}%</em></li>)}</ul>
                  </div>)}

                  {i === 5 && (<div className="s6">
                    <p>{t('Every score explains itself. For each Earth site you see three things.', 'كل درجة تشرح نفسها. لكل موقع أرضي ثلاثة أشياء.')}</p>
                    <div className="cmp">
                      <div><h5>{t('What matches', 'ما يتطابق')}</h5><p>{t('The characteristics where the two places agree.', 'الخصائص التي يتفق فيها المكانان.')}</p></div>
                      <div><h5>{t('What differs', 'ما يختلف')}</h5><p>{t('The characteristics where they do not, with both values side by side.', 'الخصائص التي لا يتفقان فيها، مع القيمتين جنبًا إلى جنب.')}</p></div>
                      <div><h5>{t('What is missing', 'ما هو ناقص')}</h5><p>{t('Characteristics with no data. They are left out of the score, never counted as a match.', 'الخصائص التي لا بيانات لها. تُستبعد من الدرجة ولا تُحتسب أبدًا كتطابق.')}</p></div>
                    </div>
                    <p className="caveat">{t('Data confidence is shown separately from similarity. It reflects how complete and reliable the data behind a result is.', 'تُعرض موثوقية البيانات منفصلة عن التشابه. وهي تعكس مدى اكتمال البيانات وراء النتيجة ومدى الوثوق بها.')}</p>
                  </div>)}

                  {i === 6 && (<div className="s7">
                    <p>{t('The report puts the analysis on one page: the chosen region, the best Earth sites, the similarity range, the data confidence and the differences no Earth site can remove, such as gravity, air pressure and radiation. You can download it or share a link.', 'يجمع التقرير التحليل في صفحة واحدة: المنطقة المختارة وأفضل المواقع الأرضية ونطاق التشابه وموثوقية البيانات والفروقات التي لا يستطيع أي موقع أرضي إزالتها، مثل الجاذبية وضغط الهواء والإشعاع. يمكنك تنزيله أو مشاركة رابطه.')}</p>
                  </div>)}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── features ── */}
      <section className="ft container" aria-labelledby="ft-t">
        <h2 id="ft-t" className="h1">{t('Explore the features', 'استكشف المزايا')}</h2>
        <div className="ft-grid">
          <ul className="ft-list">{FEATURES.map(([n, , na], i) => <li key={n}><button className={i === feat ? 'on' : ''} onClick={() => setFeat(i)}><b>{i + 1}</b>{ar ? na : n}</button></li>)}</ul>
          <div className="ft-view" key={feat} aria-live="polite">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="o1" cx="60" cy="60" r="44" /><circle className="o2" cx="60" cy="60" r="28" /><circle className="dot" cx="60" cy="16" r="5" style={{ transformOrigin: '60px 60px', animationDuration: `${3 + (feat % 5)}s` }} /><text x="60" y="68" textAnchor="middle">{feat + 1}</text></svg>
            <h3 className="h2">{ar ? FEATURES[feat][2] : FEATURES[feat][0]}</h3>
            <p>{ar ? FEATURES[feat][3] : FEATURES[feat][1]}</p>
          </div>
        </div>
      </section>

      {/* ── lab ── */}
      <section className="lab container" aria-labelledby="lab-t">
        <h2 id="lab-t" className="h1">{t('Planetary lab', 'المختبر الكوكبي')}</h2>
        <p className="lede">{t('Drag to rotate. Choose a world to read its key traits.', 'اسحب للتدوير. اختر عالمًا لقراءة أبرز خصائصه.')}</p>
        <div className="lab-grid">
          <div className="stage tall">
            {lab === 'earth'
              ? <AboutGlobe label={t('Interactive 3D Earth globe', 'كرة أرضية ثلاثية الأبعاد تفاعلية')} />
              : <ModelStage key={lab} url={lab === 'moon' ? TARGETS.moon.url : TARGETS.mars.url} label={t(`3D model of ${LAB[lab].name}`, `نموذج ثلاثي الأبعاد لـ${LAB[lab].ar}`)} tilt={0.15} />}
          </div>
          <div>
            <div className="chips">{(Object.keys(LAB) as (keyof typeof LAB)[]).map(k => <button key={k} className={k === lab ? 'on' : ''} onClick={() => setLab(k)}>{ar ? LAB[k].ar : LAB[k].name}</button>)}</div>
            <h3 className="h2">{ar ? LAB[lab].ar : LAB[lab].name}</h3>
            <ul className="facts">{labFacts.map(f => <li key={f}>{f}</li>)}</ul>
          </div>
        </div>
      </section>

      {/* ── science ── */}
      <section id="science" className="sc container" aria-labelledby="sc-t">
        <h2 id="sc-t" className="h1">{t('Data-driven. Science-inspired. Explainable.', 'قائم على البيانات. مستلهَم من العلم. قابل للتفسير.')}</h2>
        <ol className="pipe">{PIPE.map(([p, pa], i) => <li key={p} style={{ animationDelay: `${i * 0.35}s` }}>{ar ? pa : p}</li>)}</ol>
        <div className="three">
          <div><h3 className="h2">{t('Environmental fingerprint', 'البصمة البيئية')}</h3><p>{t('Converts environmental characteristics into structured, comparable data.', 'تحوّل الخصائص البيئية إلى بيانات منظَّمة قابلة للمقارنة.')}</p></div>
          <div><h3 className="h2">{t('Similarity engine', 'محرّك التشابه')}</h3><p>{t('Calculates how closely environments match using defined comparison criteria. Missing values are left out and never counted as a match.', 'يحسب مدى تطابق البيئات وفق معايير مقارنة محددة. القيم الناقصة تُستبعد ولا تُحتسب أبدًا كتطابق.')}</p></div>
          <div><h3 className="h2">{t('Data confidence', 'موثوقية البيانات')}</h3><p>{t('Communicates how reliable a comparison is, based on the quality and completeness of the data.', 'توضّح مدى موثوقية المقارنة اعتمادًا على جودة البيانات واكتمالها.')}</p></div>
        </div>
        <p className="caveat">{t('NASA PDS, NASA Earthdata, HiRISE, LRO and USGS are the kinds of sources this approach is built around. Every value in a result is labelled with where it came from.', 'مصادر مثل NASA PDS وNASA Earthdata وHiRISE وLRO وUSGS هي النوع الذي بُني عليه هذا النهج. وتُوسَم كل قيمة في النتيجة بمصدرها.')}</p>
      </section>

      {/* ── final ── */}
      <section className="fin" aria-labelledby="fin-t">
        <div className="orbit" aria-hidden="true"><i className="e"></i><i className="m"></i><i className="ship"></i></div>
        <div className="container">
          <h2 id="fin-t" className="h1">{t('The next frontier starts with understanding.', 'الحدود التالية تبدأ بالفهم.')}</h2>
          <p className="lede">{t('Explore beyond our planet. Understand its environments. Discover the places on Earth that bring other worlds closer to home.', 'استكشف ما وراء كوكبنا. افهم بيئاته. واكتشف الأماكن على الأرض التي تقرّب العوالم الأخرى منا.')}</p>
          <Link className="btn" to="/explore">{t('Start your exploration', 'ابدأ استكشافك')}</Link>
        </div>
      </section>
    </div>
  );
}
