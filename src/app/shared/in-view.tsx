import { createElement, ReactNode, useEffect, useRef, useState } from 'react';

/** Adds the class `in` once the element scrolls into view. Used to run progressive chart reveals. */
export function InView({ as = 'div', className = '', children, ...rest }: {
  as?: 'div' | 'section' | 'ul'; className?: string; children?: ReactNode; [k: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return createElement(as, { ...rest, ref, className: (className + (seen ? ' in' : '')).trim() }, children);
}
