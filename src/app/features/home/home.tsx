import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlanetViewer } from '../../shared/components/planet-viewer/planet-viewer';
import { ModelStage } from '../../shared/components/model-stage/model-stage';
import { PlanetTrio } from '../../shared/components/planet-trio/planet-trio';
import { planetaryData } from '../../services/planetary-data.service';
import { exploration } from '../../core/services/exploration-state.service';
import { motion } from '../../core/services/motion.service';
import { useSig } from '../../core/signals';
import { i18n, useT } from '../../core/services/i18n.service';
import { PlanetId } from '../../core/models/science.model';
import './home.css';

const CREW = [
  { name: 'Tasneem', url: 'assets/models/crew-z2.glb' },
  { name: 'Dina', url: 'assets/models/crew-astronaut.glb' },
  { name: 'Shaza', url: 'assets/models/crew-markiii.glb' },
  { name: 'Tarek', url: 'assets/models/crew-mercury.glb' },
  { name: 'Alhassan', url: 'assets/models/crew-emu.glb' },
] as const;

const STEPS = [
  { n: '01', t: 'Pick a world and a site', d: 'The Moon or Mars, then a base candidate or a landing site, chosen on a globe with data layers.', to: '/explore',
    ta: 'اختر عالمًا وموقعًا', da: 'القمر أو المريخ، ثم موقعًا مرشَّحًا لقاعدة أو للهبوط، تختاره على كرة مجسّمة بطبقات بيانات.' },
  { n: '02', t: 'Read its fingerprint', d: 'Temperature, terrain, geology, minerals, slope and aridity, each tagged by where the value came from.', to: '/explore',
    ta: 'اقرأ بصمته', da: 'درجة الحرارة والتضاريس والجيولوجيا والمعادن والانحدار والجفاف، وكل قيمة موسومة بمصدرها.' },
  { n: '03', t: 'Search Earth', d: 'Every candidate site is scored against the fingerprint and compared with the established analogs.', to: '/explore',
    ta: 'ابحث في الأرض', da: 'يُقيَّم كل موقع مرشَّح مقابل البصمة ويُقارَن بالنظائر المعتمدة.' },
  { n: '04', t: 'Rank and explain', d: 'Weights are yours to change. Each score shows what matches, what differs and what data is missing.', to: '/explore',
    ta: 'رتِّب وافهم', da: 'الأوزان بيدك لتغييرها. كل درجة توضّح ما يتطابق وما يختلف وما البيانات الناقصة.' },
  { n: '05', t: 'Take the report', d: 'One page with the result, the confidence behind it and the differences no Earth site can remove.', to: '/explore',
    ta: 'احصل على التقرير', da: 'صفحة واحدة بالنتيجة ومستوى الثقة فيها والفروقات التي لا يستطيع أي موقع أرضي إزالتها.' },
];

const PLANET_AR = {
  moon: {
    name: 'القمر', label: 'استكشاف القمر', tagline: 'بلا هواء، قديم، مليء بالفوهات.',
    description: 'لا غلاف جوي ولا طقس، وسطح سجّل أربعة مليارات سنة من الاصطدامات. تضم فوهاته القطبية بعضًا من أبرد الأماكن التي قيست في المجموعة الشمسية.',
    facts: { 'Mean radius': 'متوسط نصف القطر', 'Surface gravity': 'جاذبية السطح', 'Day–night swing': 'الفرق بين النهار والليل', 'Atmosphere': 'الغلاف الجوي', 'Exosphere only': 'غلاف خارجي رقيق فقط' },
  },
  mars: {
    name: 'المريخ', label: 'استكشاف المريخ', tagline: 'أنهار جافة وبراكين خامدة ووادٍ بطول قارة.',
    description: 'صحراء باردة تحت سماء رقيقة من ثاني أكسيد الكربون. يحفظ سجلُّه الصخري بحيراتٍ ودلتاوات ونشاطًا بركانيًا، ولهذا تُرسَل المركبات الجوّالة إلى فوهات مثل جيزيرو وغيل.',
    facts: { 'Mean radius': 'متوسط نصف القطر', 'Surface gravity': 'جاذبية السطح', 'Mean surface temp.': 'متوسط حرارة السطح', 'Surface pressure': 'ضغط السطح' },
  },
} as const;

export function HomePage() {
  const navigate = useNavigate();
  const t = useT();
  const ar = useSig(() => i18n.lang() === 'ar');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [fine, setFine] = useState(true);
  const [hovered, setHovered] = useState<PlanetId | null>(null);
  const [crew, setCrew] = useState(2);
  const moon = planetaryData.planet('moon');
  const mars = planetaryData.planet('mars');
  const reduced = useSig(() => motion.reduced());

  useEffect(() => {
    setFine(matchMedia('(pointer: fine)').matches);
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    if (reduced) { v.pause(); return; }
    v.play().catch(() => { /* autoplay blocked: poster stays */ });
  }, [reduced, videoFailed]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const go = (id: PlanetId) => { exploration.selectPlanet(id); navigate(`/explore/${id}`); };

  return (
    <div className="pg-home">
      <div>
        <section className="hero force-dark" aria-labelledby="hero-title">
          <div className="hero-media" aria-hidden="true">
            <div className="fallback"></div>
            {!videoFailed && (
              <video ref={videoRef} autoPlay muted loop playsInline preload="auto" poster="assets/videos/hero-poster.jpg" onError={() => setVideoFailed(true)}>
                <source src="assets/videos/hero-space.mp4" type="video/mp4" />
              </video>
            )}
            <div className="shade"></div>
          </div>

          <div className="container hero-grid">
            <div className="copy">
              <h1 id="hero-title">{ar ? <>كوكب واحد.<br />إمكانات<br />لا حدود لها.</> : <>One planet.<br />Infinite<br />possibilities.</>}</h1>
              <p className="sub">{t('What if the key to understanding other worlds was already here on Earth? Explore extreme environments, discover planetary similarities, and uncover new possibilities for the future of space exploration.', 'ماذا لو كان مفتاح فهم العوالم الأخرى موجودًا هنا على الأرض؟ استكشف البيئات القاسية، واكتشف أوجه التشابه بين الكواكب، وافتح آفاقًا جديدة لمستقبل استكشاف الفضاء.')}</p>
              <div className="ctas">
                <Link className="btn" to="/explore">{t('Start exploring', 'ابدأ الاستكشاف')}</Link>
                <button className="btn ghost" type="button" onClick={() => scrollTo('how')}>{t('How it works', 'كيف يعمل')}</button>
              </div>
            </div>

          </div>

        </section>

        <section id="trio" className="trio force-dark" aria-labelledby="trio-title">
          <div className="trio-stage">
            <PlanetTrio mirror={ar} label={t('Earth, Mars and the Moon in one 3D scene', 'الأرض والمريخ والقمر في مشهد ثلاثي الأبعاد واحد')} />
          </div>
          <div className="container">
            <div className="trio-copy">
              <h2 id="trio-title">{t('Earth is how we learn the Moon and Mars.', 'الأرض هي مدخلنا لفهم القمر والمريخ.')}</h2>
              <p>{t('Dry valleys, lava fields and polar deserts here on Earth behave like places on the Moon and Mars. We match them, so each mission starts from ground we can visit today.', 'أودية جافة وحقول حمم وصحارى قطبية على الأرض تشبه مواقع على القمر والمريخ. نطابق بينها، فتبدأ كل مهمة من أرض نستطيع زيارتها اليوم.')}</p>
              <dl className="trio-list">
                <div><dt>{t('Earth', 'الأرض')}</dt><dd>{t('Where the analog sites are', 'حيث توجد المواقع النظيرة')}</dd></div>
                <div><dt>{t('Mars', 'المريخ')}</dt><dd>{t('Cold desert, thin air', 'صحراء باردة وهواء رقيق')}</dd></div>
                <div><dt>{t('Moon', 'القمر')}</dt><dd>{t('No air, extreme temperature swings', 'بلا هواء وتقلبات حرارة شديدة')}</dd></div>
              </dl>
              <div className="ctas">
                <button className="btn ghost" type="button" onClick={() => scrollTo('worlds')}>{t('Choose a world', 'اختر عالمًا')}</button>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="how" aria-labelledby="how-title">
          <div className="container">
            <h2 id="how-title" className="h1">{ar ? <>من فوهة على المريخ<br />إلى مكان تصل إليه بسيارتك.</> : <>From a crater on Mars<br />to a place you can drive to.</>}</h2>
            <ol className="steps">
              {STEPS.map(s => <li key={s.n}><span className="num mono">{s.n}</span><h3>{ar ? s.ta : s.t}</h3><p>{ar ? s.da : s.d}</p></li>)}
            </ol>
          </div>
        </section>

        <section id="worlds" className="worlds-sec" aria-labelledby="worlds-title">
          <div className="container worlds-head">
            <h2 id="worlds-title" className="h1">{t('Choose your world.', 'اختر عالمك.')}</h2>
            <p className="lede">{t('Rotate either globe, then step onto its surface.', 'دوِّر أي كرة، ثم اهبط على سطحها.')}</p>
          </div>
          <div className="worlds container">
            {[moon, mars].map(p => (
              <article key={p.id} className={`world ${p.id}${hovered === p.id ? ' hot' : ''}${hovered && hovered !== p.id ? ' cold' : ''}`}
                onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(p.id)} onBlur={() => setHovered(null)}>
                <div className="bigname" aria-hidden="true">{ar ? PLANET_AR[p.id].name : p.name.toUpperCase()}</div>
                <div className="viewer">
                  <PlanetViewer planet={p.id} modelUrl={p.modelUrl} interactive={fine} zoomable={false} distance={4.5} />
                </div>
                <div className="info">
                  <p className="mono kicker">{ar ? PLANET_AR[p.id].label : p.label}</p>
                  <h3 className="wname">{ar ? PLANET_AR[p.id].name : p.name}</h3>
                  <p className="tag">{ar ? PLANET_AR[p.id].tagline : p.tagline}</p>
                  <p className="desc">{ar ? PLANET_AR[p.id].description : p.description}</p>
                  <dl className="facts-l mono">
                    {p.facts.map(f => <div key={f.k}><dt>{ar ? (PLANET_AR[p.id].facts as Record<string, string>)[f.k] ?? f.k : f.k}</dt><dd>{ar ? f.v.replace('Exosphere only', PLANET_AR.moon.facts['Exosphere only']) : f.v}</dd></div>)}
                  </dl>
                  <Link className="btn" to={`/explore/${p.id}`} onClick={e => { e.preventDefault(); go(p.id); }}>{ar ? `استكشف ${PLANET_AR[p.id].name}` : `Explore ${p.name}`}</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="crew" className="crew" aria-labelledby="crew-title">
          <div className="container">
            <h2 id="crew-title" className="h1">{ar ? 'تعرّف على الطاقم' : 'Meet the crew'}</h2>
            <p className="lede">{t('Five explorers. One mission. Driven by curiosity, united by discovery.', 'خمسة مستكشفين. مهمة واحدة. يحرّكهم الفضول ويجمعهم الاكتشاف.')}</p>
            <ul className="crew-row">
              {CREW.map((c, i) => (
                <li key={c.name} className={i === crew ? 'on' : ''} onMouseEnter={() => setCrew(i)} onFocus={() => setCrew(i)}>
                  <div className="figure"><ModelStage url={c.url} label={t(`3D astronaut model for ${c.name}`, `نموذج ثلاثي الأبعاد لرائد الفضاء ${c.name}`)} tilt={0.1} /></div>
                  <h3>{c.name}</h3>
                  <i className="bar"></i>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
