import { Suspense, useEffect } from 'react';
import type { ModelEntry } from '../models/registry';
import { Link } from './router';

export function ModelPage({ model }: { model: ModelEntry }) {
  const Experience = model.component;

  useEffect(() => {
    document.title = `${model.name} — Tangible`;
    // Model scenes are full-screen; stop the page itself from scrolling.
    document.body.classList.add('tg-locked');
    return () => document.body.classList.remove('tg-locked');
  }, [model]);

  return (
    <Suspense fallback={<ModelLoading model={model} />}>
      <Experience />
    </Suspense>
  );
}

function ModelLoading({ model }: { model: ModelEntry }) {
  return (
    <div className="tg-root fixed inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-5 text-center">
        <div
          className="h-px w-40 overflow-hidden bg-[var(--tg-line)]"
          aria-hidden="true"
        >
          <div
            className="tg-loadbar h-full w-1/3"
            style={{ background: model.accent }}
          />
        </div>
        <p className="tg-display text-4xl italic">{model.name}</p>
        <p className="tg-mono text-[11px] uppercase tracking-[0.2em] text-[var(--tg-muted)]">
          Building the scene…
        </p>
      </div>
    </div>
  );
}

export function NotFound() {
  useEffect(() => {
    document.title = 'Not found — Tangible';
  }, []);
  return (
    <div className="tg-root grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <p className="tg-mono text-[11px] uppercase tracking-[0.2em] text-[var(--tg-muted)]">
          Error 404
        </p>
        <h1 className="tg-display mt-4 text-6xl md:text-8xl">
          Nothing to touch <span className="italic text-[var(--tg-accent)]">here.</span>
        </h1>
        <Link
          to="/"
          className="tg-mono mt-10 inline-block border-b border-[var(--tg-line-strong)] pb-1 text-xs uppercase tracking-[0.18em] hover:border-[var(--tg-accent)] hover:text-[var(--tg-accent)]"
        >
          ← Back to the index
        </Link>
      </div>
    </div>
  );
}
