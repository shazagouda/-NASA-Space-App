import { ReactNode, useId } from 'react';
import './scientific-tooltip.css';

export function SciTip({ text, children }: { text: string; children: ReactNode }) {
  const id = `sci-tip-${useId()}`;
  return (
    <span className="c-tip">
      <span className="wrap">
        <span className="term" tabIndex={0} aria-describedby={id}>{children}</span>
        <span className="tip" role="tooltip" id={id}>{text}</span>
      </span>
    </span>
  );
}
