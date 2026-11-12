import { computed, signal } from '../signals';

export type NoteLevel = 'info' | 'success' | 'warning' | 'error';
export interface Note {
  id: number;
  level: NoteLevel;
  title: string;
  message: string;
  at: number;
  read: boolean;
  /** optional in-app link offered as action */
  link?: { label: string; url: string };
  /** shown as a toast */
  toast: boolean;
}

const MAX_HISTORY = 40;

export class NotificationService {
  private seq = 0;
  readonly history = signal<Note[]>([]);
  readonly toasts = signal<Note[]>([]);
  readonly unread = computed(() => this.history().filter(n => !n.read).length);
  private keys = new Map<string, number>();

  /** `key` collapses repeats of the same event inside 4 s so a flaky call can't flood the screen. */
  push(level: NoteLevel, title: string, message: string, opts: { link?: Note['link']; toast?: boolean; key?: string } = {}): void {
    const now = Date.now();
    if (opts.key) {
      const last = this.keys.get(opts.key);
      if (last && now - last < 4000) return;
      this.keys.set(opts.key, now);
    }
    const n: Note = { id: ++this.seq, level, title, message, at: now, read: false, link: opts.link, toast: opts.toast ?? true };
    this.history.update(h => [n, ...h].slice(0, MAX_HISTORY));
    if (n.toast) {
      this.toasts.update(t => [...t, n].slice(-3));
      const ttl = level === 'error' ? 9000 : level === 'warning' ? 7000 : 4500;
      setTimeout(() => this.dismiss(n.id), ttl);
    }
  }
  info(t: string, m: string, o?: Parameters<NotificationService['push']>[3]) { this.push('info', t, m, o); }
  success(t: string, m: string, o?: Parameters<NotificationService['push']>[3]) { this.push('success', t, m, o); }
  warn(t: string, m: string, o?: Parameters<NotificationService['push']>[3]) { this.push('warning', t, m, o); }
  error(t: string, m: string, o?: Parameters<NotificationService['push']>[3]) { this.push('error', t, m, o); }

  dismiss(id: number): void { this.toasts.update(t => t.filter(n => n.id !== id)); }
  markAllRead(): void { this.history.update(h => h.map(n => ({ ...n, read: true }))); }
  clear(): void { this.history.set([]); this.toasts.set([]); }
}

export const notifications = new NotificationService();
