import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, type CSSProperties } from 'react';
import { MODELS, type ModelEntry } from '../models/registry';
import { Link } from './router';

const ease = [0.22, 1, 0.36, 1] as const;

function pad(n: number) {
  return String(n).padStart(3, '0');
}

export function Landing() {
  useEffect(() => {
    document.title = 'Tangible — Familiar things, in interactive 3D';
  }, []);

  return (
    <div className="tg-root min-h-screen">
      <div className="tg-grain" aria-hidden="true" />

      <nav className="relative z-10 mx-auto flex max-w-[1400px] items-center justify-between px-6 pt-6 md:px-10 md:pt-8">
        <Link to="/" className="tg-wordmark text-2xl leading-none">
          Tangible<span className="tg-accent-dot">.</span>
        </Link>
        <a
          href="#index"
          className="tg-mono text-[11px] uppercase tracking-[0.18em] text-[var(--tg-muted)] hover:text-[var(--tg-bone)] transition-colors"
        >
          Index · {pad(MODELS.length)}
        </a>
      </nav>

      <Hero />
      <ModelIndex />

      <footer className="relative z-10 mx-auto max-w-[1400px] px-6 pb-10 pt-24 md:px-10">
        <div className="flex flex-col gap-4 border-t border-[var(--tg-line)] pt-6 md:flex-row md:items-end md:justify-between">
          <p className="tg-wordmark text-4xl md:text-5xl">
            Tangible<span className="tg-accent-dot">.</span>
          </p>
          <p className="tg-mono max-w-sm text-[11px] uppercase leading-relaxed tracking-[0.14em] text-[var(--tg-muted)]">
            Every model runs live in your browser. Best on a desktop with a
            WebGL2-capable graphics card.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <header className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-12 px-6 pb-20 pt-16 md:min-h-[86vh] md:grid-cols-[1.25fr_1fr] md:px-10 md:pt-10">
      <div>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
          className="tg-mono mb-8 text-[11px] uppercase tracking-[0.22em] text-[var(--tg-muted)]"
        >
          A collection of interactive 3D models
        </motion.p>

        <h1 className="tg-display text-[clamp(3.2rem,9vw,8.5rem)] leading-[0.9] tracking-[-0.02em]">
          {['Things you know,', 'rebuilt to be', 'touched.'].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <motion.span
                className={`block ${i === 2 ? 'italic text-[var(--tg-accent)]' : ''}`}
                initial={{ y: '105%' }}
                animate={{ y: 0 }}
                transition={{ duration: 1, delay: 0.1 + i * 0.12, ease }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.6, ease }}
          className="mt-10 flex max-w-xl flex-col gap-8"
        >
          <p className="text-lg leading-relaxed text-[var(--tg-bone-dim)] md:text-xl">
            A swimming pool. A kitchen. A street corner. Everyday places and
            objects, recreated as live 3D scenes you can orbit, poke, splash
            and play with — right in your browser.
          </p>
          <a
            href="#index"
            className="tg-mono group inline-flex w-fit items-center gap-3 text-xs uppercase tracking-[0.18em] text-[var(--tg-bone)]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--tg-line-strong)] transition-colors group-hover:border-[var(--tg-accent)] group-hover:text-[var(--tg-accent)]">
              <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
            </span>
            Browse the index
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.3, ease }}
        className="hidden md:block"
      >
        <Specimen />
      </motion.div>
    </header>
  );
}

/** A wireframe cube that tilts toward the pointer — the "hello world" of 3D. */
function Specimen() {
  const rx = useMotionValue(-18);
  const ry = useMotionValue(28);
  const srx = useSpring(rx, { stiffness: 60, damping: 18 });
  const sry = useSpring(ry, { stiffness: 60, damping: 18 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      ry.set(28 + nx * 50);
      rx.set(-18 - ny * 36);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [rx, ry]);

  const faces = [
    'rotateY(0deg)',
    'rotateY(90deg)',
    'rotateY(180deg)',
    'rotateY(-90deg)',
    'rotateX(90deg)',
    'rotateX(-90deg)',
  ];

  return (
    <figure className="relative mx-auto aspect-square w-full max-w-[460px]">
      <div className="tg-specimen-glow" aria-hidden="true" />
      <div className="absolute inset-0 grid place-items-center [perspective:1100px]">
        <motion.div
          style={{ rotateX: srx, rotateY: sry }}
          className="[transform-style:preserve-3d]"
        >
          <div className="tg-cube">
            {faces.map((t, i) => (
              <div
                key={t}
                className={`tg-face ${i === 5 ? 'tg-face-floor' : ''}`}
                style={{ '--t': t } as CSSProperties}
              />
            ))}
          </div>
        </motion.div>
      </div>
      <figcaption className="tg-mono absolute bottom-0 left-0 right-0 flex justify-between border-t border-[var(--tg-line)] pt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--tg-muted)]">
        <span>Fig. 000</span>
        <span>Move your cursor</span>
      </figcaption>
    </figure>
  );
}

function ModelIndex() {
  return (
    <section
      id="index"
      className="relative z-10 mx-auto max-w-[1400px] scroll-mt-8 px-6 md:px-10"
    >
      <div className="mb-6 flex items-end justify-between gap-6 border-b border-[var(--tg-line-strong)] pb-4">
        <h2 className="tg-display text-5xl md:text-7xl">The Index</h2>
        <p className="tg-mono pb-2 text-right text-[11px] uppercase tracking-[0.18em] text-[var(--tg-muted)]">
          {MODELS.length} {MODELS.length === 1 ? 'model' : 'models'}
          <span className="hidden sm:inline"> · more on the way</span>
        </p>
      </div>

      <div className="tg-mono hidden grid-cols-[80px_1fr_220px_160px_40px] gap-6 px-2 pb-3 text-[10px] uppercase tracking-[0.18em] text-[var(--tg-muted)] md:grid">
        <span>No.</span>
        <span>Model</span>
        <span>Subject</span>
        <span>Added</span>
        <span />
      </div>

      <ol className="flex flex-col">
        {MODELS.map((model, i) => (
          <IndexRow key={model.slug} model={model} index={i} />
        ))}
        <li
          className="grid grid-cols-[48px_1fr] gap-4 border-b border-dashed border-[var(--tg-line)] px-2 py-7 text-[var(--tg-muted)] md:grid-cols-[80px_1fr_220px_160px_40px] md:gap-6"
          aria-label="Next model in progress"
        >
          <span className="tg-mono pt-2 text-xs">{pad(MODELS.length + 1)}</span>
          <span className="tg-display text-3xl italic opacity-60 md:text-5xl">
            In the workshop…
          </span>
          <span className="tg-mono hidden pt-3 text-xs uppercase tracking-[0.14em] md:block">
            Coming soon
          </span>
        </li>
      </ol>
    </section>
  );
}

function IndexRow({ model, index }: { model: ModelEntry; index: number }) {
  const to = `/models/${model.slug}`;
  const style = {
    '--row-accent': model.accent,
    '--row-deep': model.accentDeep,
  } as CSSProperties;

  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay: index * 0.08, ease }}
      style={style}
    >
      <Link
        to={to}
        className="tg-row group block border-b border-[var(--tg-line)] px-2 py-7 focus-visible:outline-none"
      >
        <div className="grid grid-cols-[48px_1fr_auto] items-start gap-4 md:grid-cols-[80px_1fr_220px_160px_40px] md:gap-6">
          <span className="tg-mono pt-2 text-xs text-[var(--tg-muted)] transition-colors group-hover:text-[var(--row-accent)]">
            {pad(index + 1)}
          </span>

          <div>
            <h3 className="tg-display text-3xl leading-none transition-[color,transform] duration-500 group-hover:translate-x-2 group-hover:text-[var(--row-accent)] group-focus-visible:text-[var(--row-accent)] md:text-6xl">
              {model.name}
            </h3>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--tg-bone-dim)]">
              {model.tagline}
            </p>
          </div>

          <div className="tg-mono hidden pt-3 text-xs uppercase tracking-[0.14em] text-[var(--tg-bone-dim)] md:block">
            {model.subject}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {model.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--tg-line-strong)] px-2 py-0.5 text-[10px] tracking-[0.1em] text-[var(--tg-muted)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <span className="tg-mono hidden pt-3 text-xs text-[var(--tg-muted)] md:block">
            {model.addedOn}
          </span>

          <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--tg-line-strong)] transition-all duration-500 group-hover:rotate-45 group-hover:border-[var(--row-accent)] group-hover:bg-[var(--row-accent)] group-hover:text-[var(--tg-ink)]">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        {/* Expanding preview */}
        <div className="tg-reveal grid md:pl-[104px]">
          <div className="overflow-hidden">
            <div className="flex flex-col gap-6 pt-6 md:flex-row md:items-center md:gap-10">
              <div className="tg-caustic aspect-[16/9] w-full shrink-0 rounded-sm md:w-[420px]" aria-hidden="true">
                <span className="tg-mono absolute bottom-3 left-3 text-[10px] uppercase tracking-[0.18em] text-white/80">
                  Live · WebGL2
                </span>
              </div>
              <div className="max-w-md">
                <p className="leading-relaxed text-[var(--tg-bone-dim)]">
                  {model.description}
                </p>
                <p className="tg-mono mt-5 text-[11px] uppercase tracking-[0.18em] text-[var(--row-accent)]">
                  Open the model →
                </p>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}
