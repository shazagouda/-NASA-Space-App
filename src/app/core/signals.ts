/**
 * A very small signals implementation (signal / computed / effect) plus React bindings.
 *
 * The original Angular app kept its state in services built on signals. Keeping the same model here means the
 * services (state, catalogue, notifications, ranking) behave exactly as before, and React components simply
 * subscribe to whatever they read through `useSig`.
 */
import { useMemo, useRef, useSyncExternalStore } from 'react';

interface Sub { notify(): void }
type Collector = (subs: Set<Sub>) => void;

let collector: Collector | null = null;

export interface Signal<T> { (): T }
export interface WritableSignal<T> extends Signal<T> {
  set(v: T): void;
  update(fn: (v: T) => T): void;
}

export function signal<T>(initial: T): WritableSignal<T> {
  let value = initial;
  const subs = new Set<Sub>();
  const read = (() => { collector?.(subs); return value; }) as WritableSignal<T>;
  read.set = (v: T) => {
    if (Object.is(v, value)) return;
    value = v;
    [...subs].forEach(s => s.notify());
  };
  read.update = fn => read.set(fn(value));
  return read;
}

export function computed<T>(fn: () => T): Signal<T> {
  let value: T;
  let dirty = true;
  let deps = new Set<Set<Sub>>();
  const subs = new Set<Sub>();
  const self: Sub = {
    notify() {
      if (dirty) return;
      dirty = true;
      [...subs].forEach(s => s.notify());
    },
  };
  return () => {
    collector?.(subs);
    if (dirty) {
      deps.forEach(d => d.delete(self));
      deps = new Set();
      const prev = collector;
      collector = d => { deps.add(d); d.add(self); };
      try { value = fn(); } finally { collector = prev; }
      dirty = false;
    }
    return value;
  };
}

/** Runs `fn` now and again (in a microtask) whenever a signal it read changes. Returns a disposer. */
export function effect(fn: () => void): () => void {
  let deps = new Set<Set<Sub>>();
  let alive = true;
  let queued = false;
  const self: Sub = {
    notify() {
      if (queued || !alive) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (alive) run(); });
    },
  };
  const run = () => {
    deps.forEach(d => d.delete(self));
    deps = new Set();
    const prev = collector;
    collector = d => { deps.add(d); d.add(self); };
    try { fn(); } finally { collector = prev; }
  };
  run();
  return () => { alive = false; deps.forEach(d => d.delete(self)); deps.clear(); };
}

/** Reads signals without subscribing the surrounding computed / effect. */
export function untracked<T>(fn: () => T): T {
  const prev = collector;
  collector = null;
  try { return fn(); } finally { collector = prev; }
}

/* ───────── React bindings ───────── */

/**
 * Subscribes a component to every signal read inside `fn` and returns its current value.
 * `fn` may be an inline arrow: it is re-evaluated on each render and whenever a dependency changes.
 */
export function useSig<T>(fn: () => T): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const store = useMemo(() => {
    let cached: T;
    let lastFn: (() => T) | null = null;
    let dirty = true;
    let deps = new Set<Set<Sub>>();
    const listeners = new Set<() => void>();
    const self: Sub = { notify() { dirty = true; listeners.forEach(l => l()); } };
    const compute = () => {
      deps.forEach(d => d.delete(self));
      deps = new Set();
      const prev = collector;
      collector = d => { deps.add(d); d.add(self); };
      try { cached = fnRef.current(); } finally { collector = prev; }
      lastFn = fnRef.current;
      dirty = false;
    };
    return {
      subscribe(l: () => void) {
        listeners.add(l);
        return () => {
          listeners.delete(l);
          if (!listeners.size) { deps.forEach(d => d.delete(self)); deps = new Set(); dirty = true; }
        };
      },
      getSnapshot(): T {
        if (dirty || lastFn !== fnRef.current) compute();
        return cached;
      },
    };
  }, []);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
