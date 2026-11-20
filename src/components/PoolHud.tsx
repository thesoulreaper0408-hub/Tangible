import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { Link } from '../site/router';
import type { PoolStats } from '../pool/types';

interface PoolHudProps {
  stats: PoolStats | null;
  leftOrbitMode: boolean;
  soundEnabled: boolean;
  onToggleLeftMode: () => void;
  onDropSplash: () => void;
  onResetView: () => void;
  onToggleSound: () => void;
}

export function PoolHud({
  stats,
  leftOrbitMode,
  soundEnabled,
  onToggleLeftMode,
  onDropSplash,
  onResetView,
  onToggleSound,
}: PoolHudProps) {
  return (
    <>
      <header className="fixed top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none max-sm:top-3 max-sm:left-3">
        <div className="pointer-events-auto inline-flex items-center gap-3 px-3.5 py-2 rounded-xl bg-[rgba(8,15,25,0.90)] border border-white/15 shadow-lg">
          <Link
            to="/"
            title="Back to the Tangible collection"
            className="inline-flex items-center gap-1.5 -ml-1 pr-3 mr-0.5 border-r border-white/15 text-xs font-medium text-slate-300 hover:text-cyan-200 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-300 rounded-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tangible</span>
          </Link>
          <h1 className="text-sm font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            Hydrogen Pool
          </h1>
          <span
            aria-label="Simulation performance"
            className="font-mono-tabular text-xs text-cyan-300 whitespace-nowrap shrink-0"
          >
            {stats ? `${stats.fps} FPS · RGBA${stats.precisionLabel}` : 'Initializing'}
          </span>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleLeftMode}
            title="Switch left-drag behavior between water splash and camera orbit"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-md focus-visible:outline-2 focus-visible:outline-cyan-300 ${
              !leftOrbitMode
                ? 'border-cyan-400 bg-[rgba(10,44,72,0.94)] text-cyan-100 hover:bg-[rgba(14,56,90,0.96)]'
                : 'border-white/15 bg-[rgba(8,15,25,0.90)] text-slate-100 hover:border-cyan-300/50 hover:bg-[rgba(14,26,42,0.94)]'
            }`}
          >
            {leftOrbitMode ? 'Left-Drag: Orbit' : 'Left-Drag: Splash'}
          </button>

          <button
            type="button"
            onClick={onDropSplash}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-[rgba(8,15,25,0.90)] text-slate-100 hover:border-cyan-300/50 hover:bg-[rgba(14,26,42,0.94)] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-md focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Drop Splash
          </button>

          <button
            type="button"
            onClick={onResetView}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-[rgba(8,15,25,0.90)] text-slate-100 hover:border-cyan-300/50 hover:bg-[rgba(14,26,42,0.94)] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-md focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Reset View
          </button>

          <button
            type="button"
            aria-pressed={soundEnabled}
            onClick={onToggleSound}
            title="Toggle procedural pool soundscape"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-md focus-visible:outline-2 focus-visible:outline-cyan-300 ${
              soundEnabled
                ? 'border-cyan-400 bg-[rgba(10,44,72,0.94)] text-cyan-100 hover:bg-[rgba(14,56,90,0.96)]'
                : 'border-white/15 bg-[rgba(8,15,25,0.90)] text-slate-300 hover:border-cyan-300/50 hover:bg-[rgba(14,26,42,0.94)]'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{soundEnabled ? 'Sound: On' : 'Sound: Off'}</span>
          </button>
        </div>
      </header>

      <div className="fixed bottom-4 left-4 z-20 px-3 py-2 rounded-lg bg-[rgba(8,15,25,0.88)] border border-white/14 text-[11px] text-slate-300 pointer-events-none hidden sm:block shadow-md">
        <strong className="font-medium text-slate-100">Left-Drag on Water:</strong> Wake &amp; Splash
        <span className="mx-1.5 text-slate-500" aria-hidden="true">·</span>
        <strong className="font-medium text-slate-100">Right-Drag / Deck:</strong> Orbit Camera
        <span className="mx-1.5 text-slate-500" aria-hidden="true">·</span>
        <strong className="font-medium text-slate-100">Scroll / Pinch:</strong> Zoom
      </div>
    </>
  );
}
