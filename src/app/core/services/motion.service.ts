import { signal } from '../signals';

export class MotionService {
  readonly reduced = signal(false);
  constructor() {
    if (typeof matchMedia === 'function') {
      const q = matchMedia('(prefers-reduced-motion: reduce)');
      this.reduced.set(q.matches);
      q.addEventListener?.('change', e => this.reduced.set(e.matches));
    }
  }
}

export const motion = new MotionService();
