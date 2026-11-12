import { useEffect, useRef, useState } from 'react';
import { motion } from '../../../core/services/motion.service';
import { useSig } from '../../../core/signals';
import './metric-display.css';

function format(v: number, digits: number, signed: boolean): string {
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -digits) ? '−' : signed && v > 0 ? '+' : '';
  return sign + abs;
}

/** A number that counts up to its value. Respects reduced-motion. */
export function Metric({ value, unit = '', digits = 0, signed = false, duration = 900 }: {
  value: number | null; unit?: string; digits?: number; signed?: boolean; duration?: number;
}) {
  const reduced = useSig(() => motion.reduced());
  const [shown, setShown] = useState('—');
  const from = useRef(0);

  useEffect(() => {
    if (value === null || value === undefined) { setShown('No data'); return; }
    if (reduced || duration <= 0) { setShown(format(value, digits, signed)); from.current = value; return; }
    const start = performance.now(), origin = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(format(origin + (value - origin) * e, digits, signed));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, duration, digits, signed]);

  return (
    <span className="c-metric">
      <span className="v mono">{shown}</span>
      {unit && <span className="u mono">{unit}</span>}
    </span>
  );
}
