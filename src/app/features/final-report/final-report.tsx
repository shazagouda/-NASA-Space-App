import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportService } from '../../services/report.service';
import { exploration as state } from '../../core/services/exploration-state.service';
import { catalog } from '../../core/services/data-catalog.service';
import { ProvenanceBadge } from '../../shared/components/provenance-badge/provenance-badge';
import { notifications as notes } from '../../core/services/notification.service';
import { useSig } from '../../core/signals';
import { Provenance } from '../../core/models/science.model';
import { pct } from '../../core/utils/format';
import './final-report.css';

const provKey = (label: string): Provenance => label.startsWith('Verified') ? 'verified' : label.startsWith('Derived') ? 'derived' : label.startsWith('Simulated') ? 'simulated' : 'unavailable';
const list = (ds: { label: string }[]) => (ds.length ? ds.map(d => d.label).join(', ') : 'none');

export function FinalReportPage() {
  const navigate = useNavigate();
  // the report is derived from the exploration state and the active dataset, so rebuild when either changes
  const region = useSig(() => state.region());
  const selected = useSig(() => state.selected());
  const ranked = useSig(() => state.ranked());
  const weights = useSig(() => state.weights());
  const source = useSig(() => catalog.source());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const r = useMemo(() => reportService.build(), [region, selected, ranked, weights, source]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pdf = async () => {
    setBusy(true); setErr('');
    try { await reportService.downloadPdf(); notes.success('Report downloaded', 'The PDF was saved to your downloads.', { key: 'pdf' }); }
    catch (e) { const m = (e as Error).message || 'The PDF could not be created.'; setErr(m); notes.error('PDF failed', m, { key: 'pdf-fail' }); }
    finally { setBusy(false); }
  };
  const share = async () => {
    const p = state.shareParam();
    if (!p) return;
    const url = `${location.origin}/?s=${p}`;
    try { await navigator.clipboard.writeText(url); notes.success('Link copied', 'Anyone with this build can open the same analysis. It stores ids and weights only.', { key: 'share' }); }
    catch { window.prompt('Copy this link', url); }
  };
  const again = () => { navigate('/explore'); state.reset(); };

  if (!r) return null;

  return (
    <div className="pg-report">
      <div className="page fr">
        <div className="container">
          <div className="bar no-print">
            <div>
              <h1 className="h2">Final analog report</h1>
              <p className="muted small">A summary of this exploration. Download it as a PDF, print it, or begin a new one.</p>
            </div>
            <div className="acts">
              <button className="btn" type="button" onClick={pdf} disabled={busy}>{busy ? 'Creating PDF…' : 'Download report as PDF'}</button>
              <button className="btn ghost" type="button" onClick={() => window.print()}>Print report</button>
              <button className="btn ghost" type="button" onClick={share}>Copy share link</button>
              <button className="btn ghost" type="button" onClick={again}>Start a new exploration</button>
            </div>
          </div>
          {err && <p className="errm no-print" role="alert">{err}</p>}

          <article className="paper" aria-label="Final analog report">
            <header className="ph">
              <p className="brand">TERRATWIN</p>
              <h2 className="title">Planetary analog report</h2>
              <dl className="meta">
                <div><dt>Report</dt><dd>{r.id}</dd></div>
                <div><dt>Generated</dt><dd>{r.generated}</dd></div>
                <div><dt>Data mode</dt><dd>{r.dataSource}</dd></div>
              </dl>
            </header>

            <section className="result" aria-labelledby="res-h">
              <h3 id="res-h"><b>1</b> Result</h3>
              <dl className="verdict">
                <div><dt>Selected {r.planet} region</dt><dd><strong>{r.region.name}</strong><em>{r.siteTypeLabel} · {r.region.kind}</em></dd></div>
                <div><dt>Best Earth analog</dt><dd><strong>{r.best.analog.name}, {r.best.analog.country}</strong><em>{r.best.analog.known ? 'Established analog site' : 'Candidate site'}</em></dd></div>
                <div><dt>Similarity</dt><dd><strong className="mono big">{pct(r.best.similarity)}</strong><em>{r.best.coverage < 1 ? `range ${pct(r.best.low)} to ${pct(r.best.high)} (missing data)` : `${r.best.band} match`}</em></dd></div>
                <div><dt>Confidence</dt><dd><strong className={`mono big cb-${r.confidence.band.toLowerCase()}`}>{r.confidence.band}</strong><em>{pct(r.confidence.score)} · {pct(r.best.coverage)} of weighted data comparable</em></dd></div>
              </dl>
              <div className="two">
                <div><h4>Why it matches</h4><ul className="ticks">{r.whyMatches.map(w => <li key={w}>{w}</li>)}</ul></div>
                <div><h4>Major differences</h4><ul className="diffs">{r.physics.map(d => <li key={d.key}><b>{d.label}</b><span>{d.planet} · Earth: {d.earth}</span></li>)}</ul></div>
              </div>
              <p className="sum">{r.summary}</p>
            </section>

            <section>
              <h3><b>2</b> Comparison with known analogs</h3>
              <ol className="chain">
                {r.bench.chain.map((c, i) => (
                  <li key={c.item.analog.id} className={c.item.analog.id === r.best.analog.id ? 'me' : undefined}>
                    <span className="n mono">{i + 1}</span>
                    <b>{c.item.analog.name}</b>
                    <span className="tagk">{c.known ? 'Known analog' : 'Candidate'}</span>
                    <span className="mono sc">{pct(c.item.similarity)}</span>
                  </li>
                ))}
              </ol>
              <p className="muted small">Same scoring weights for every site. Read as: <span className="mono">{r.bench.text}</span>.</p>
            </section>

            <section>
              <h3><b>3</b> Data confidence — {pct(r.confidence.score)}, {r.confidence.band}</h3>
              <ul className="reasons">{r.confidence.reasons.map(c => <li key={c.text} className={c.ok ? 'ok' : undefined}><i aria-hidden="true">{c.ok ? '+' : '–'}</i>{c.text}</li>)}</ul>
              <p className="muted small">Similarity says how alike two sites are. Confidence says how much to trust that statement.</p>
            </section>

            <section>
              <h3><b>4</b> Selected target</h3>
              <dl className="kv">
                <div><dt>Planet</dt><dd>{r.planet}</dd></div>
                <div><dt>Site type</dt><dd>{r.siteTypeLabel}</dd></div>
                <div><dt>Region</dt><dd>{r.region.name} <span className="muted">({r.region.kind})</span></dd></div>
                <div><dt>Coordinates</dt><dd className="mono">{r.coord}</dd></div>
                <div><dt>Feature size</dt><dd className="mono">{r.region.featureSizeKm.toLocaleString('en-US')} km</dd></div>
              </dl>
              <p>{r.region.summary}</p>
            </section>

            <section>
              <h3><b>5</b> Environmental fingerprint</h3>
              <ul className="qual">{r.qual.map(q => <li key={q.key}><span>{q.label}</span><b>{q.value}</b></li>)}</ul>
              <table>
                <thead><tr><th>Parameter</th><th>Value</th><th>Label</th><th>Confidence</th></tr></thead>
                <tbody>
                  {r.rows.map(row => (
                    <tr key={row.label}><th scope="row">{row.label}</th><td className="mono">{row.value}</td><td><ProvenanceBadge provenance={provKey(row.provenance)} /></td><td className="mono">{row.confidence}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h3><b>6</b> Ranked Earth analog candidates</h3>
              <p className="muted small">Weights: {r.weights.map(w => `${w.label} ${w.value}`).join(', ')}.</p>
              <ol className="rank">
                {r.ranked.map(c => (
                  <li key={c.analog.id} className={c.analog.id === r.best.analog.id ? 'best' : undefined}>
                    <span className="n mono">{c.rank}</span>
                    <div className="body">
                      <div className="top"><b>{c.analog.name}</b><span className="muted">{c.analog.country}</span><span className="mono sc">{pct(c.similarity)} similarity · {pct(c.confidence)} confidence</span></div>
                      <div className="bars"><i style={{ width: `${c.similarity * 100}%` }}></i><u style={{ width: `${c.confidence * 100}%` }}></u></div>
                      <p className="small"><b>Matches</b> {list(c.matches)}&emsp;<b>Differs</b> {list(c.differences)}{c.missing.length > 0 && <>&emsp;<b>No data</b> {list(c.missing)}</>}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3><b>7</b> Best candidate: {r.best.analog.name}</h3>
              <div className="two">
                <div><h4>Matching characteristics</h4>
                  {r.best.matches.length ? <ul>{r.best.matches.map(d => <li key={d.key}>{d.explanation}</li>)}</ul> : <p className="muted">No parameter matches closely.</p>}</div>
                <div><h4>Important differences</h4>
                  {r.best.differences.length ? <ul>{r.best.differences.map(d => <li key={d.key}><b>{d.label}.</b> {d.planetValue} against {d.earthValue}.</li>)}</ul> : <p className="muted">None in the available data.</p>}</div>
              </div>
            </section>

            <section>
              <h3><b>8</b> Scientific limitations</h3>
              <ul className="lim">{r.limitations.map(l => <li key={l}>{l}</li>)}</ul>
            </section>

            <section>
              <h3><b>9</b> Data notes</h3>
              <ul className="lim small">{r.caveats.map(l => <li key={l}>{l}</li>)}</ul>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}
