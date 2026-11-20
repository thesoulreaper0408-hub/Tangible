import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDrawer } from '../components/ControlDrawer';
import { PoolHud } from '../components/PoolHud';
import {
  PoolAudioEngine,
  type AudioContextStatus,
} from '../pool/PoolAudioEngine';
import { WebGLPoolEngine } from '../pool/WebGLPoolEngine';
import {
  TILE_PALETTES,
  applyPresetToState,
  createInitialSimState,
} from '../pool/presets';
import type { EnvPresetKey, PoolStats, SimulationState } from '../pool/types';

export default function PoolExperience() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<WebGLPoolEngine | null>(null);
  const audioRef = useRef<PoolAudioEngine | null>(null);
  const soundEnabledRef = useRef(true);

  const [simState, setSimState] = useState<SimulationState>(
    createInitialSimState,
  );
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [webglReady, setWebglReady] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioContextStatus>('suspended');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const audio = new PoolAudioEngine((status) => setAudioStatus(status));
    audioRef.current = audio;

    const handleFirstGesture = () => {
      if (soundEnabledRef.current) {
        audio.unlock();
      }
    };
    window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true });

    const engine = new WebGLPoolEngine(canvas, {
      onStats: (nextStats) => setStats(nextStats),
      onError: (msg) => setErrorMessage(msg),
      onReady: (precisionLabel, softwareGl) => {
        setWebglReady(true);
        setStats((prev) => ({
          fps: prev?.fps ?? 0,
          precisionLabel,
          softwareGl,
        }));
      },
      onImpulse: (uvX, radiusMeters, strength, source) => {
        if (source === 'rain') {
          audio.triggerRaindropPing(uvX, strength, engineRainIntensityRef.current);
        } else {
          audio.triggerImpulseSplash(uvX, radiusMeters, strength);
        }
      },
      onWaveMotion: (dt, cpuVelocities, rainEnabled, rainIntensity, turbidity) => {
        audio.updateWaveMotion(
          dt,
          cpuVelocities,
          rainEnabled,
          rainIntensity,
          turbidity,
        );
      },
    });
    engineRef.current = engine;

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      engine.dispose();
      engineRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const engineRainIntensityRef = useRef(simState.rainIntensity);

  useEffect(() => {
    soundEnabledRef.current = simState.soundEnabled;
    engineRainIntensityRef.current = simState.rainIntensity;
    engineRef.current?.updateState(simState);
    audioRef.current?.setConfig(simState.soundEnabled, simState.soundVolume);
  }, [simState]);

  const handleToggleLeftMode = useCallback(() => {
    setSimState((prev) => ({
      ...prev,
      leftOrbitMode: !prev.leftOrbitMode,
    }));
  }, []);

  const handleDropSplash = useCallback(() => {
    audioRef.current?.unlock();
    engineRef.current?.dropRandomSplash();
  }, []);

  const handleResetView = useCallback(() => {
    engineRef.current?.resetCamera();
  }, []);

  const handleToggleSound = useCallback(() => {
    setSimState((prev) => {
      const nextEnabled = !prev.soundEnabled;
      if (nextEnabled) {
        audioRef.current?.unlock();
      }
      return { ...prev, soundEnabled: nextEnabled };
    });
  }, []);

  const handleSelectPreset = useCallback((key: EnvPresetKey) => {
    audioRef.current?.unlock();
    setSimState((prev) => applyPresetToState(prev, key));
  }, []);

  const handleSelectTilePalette = useCallback((index: number) => {
    setSimState((prev) => ({ ...prev, tilePalette: index }));
  }, []);

  const handleUpdateField = useCallback(
    <K extends keyof SimulationState>(key: K, value: SimulationState[K]) => {
      setSimState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const activeTileKey =
    TILE_PALETTES.find((t) => t.index === simState.tilePalette)?.key ?? 'cyan';

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#060b12]"
      data-webgl-ready={webglReady ? 'true' : 'false'}
      data-env={simState.env}
      data-tile-palette={activeTileKey}
      data-left-mode={simState.leftOrbitMode ? 'orbit' : 'splash'}
      data-led-enabled={simState.ledEnabled ? 'true' : 'false'}
      data-sound-enabled={simState.soundEnabled ? 'true' : 'false'}
      data-audio-state={audioStatus}
    >
      <canvas
        ref={canvasRef}
        data-testid="pool-canvas"
        aria-label="Interactive WebGL2 Swimming Pool Simulation"
        className={`block w-full h-full touch-none ${
          simState.leftOrbitMode ? 'cursor-grab' : 'cursor-crosshair'
        }`}
      />

      <PoolHud
        stats={stats}
        leftOrbitMode={simState.leftOrbitMode}
        soundEnabled={simState.soundEnabled}
        onToggleLeftMode={handleToggleLeftMode}
        onDropSplash={handleDropSplash}
        onResetView={handleResetView}
        onToggleSound={handleToggleSound}
      />

      <ControlDrawer
        state={simState}
        collapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed((c) => !c)}
        onSelectPreset={handleSelectPreset}
        onSelectTilePalette={handleSelectTilePalette}
        onUpdateField={handleUpdateField}
      />

      {errorMessage && (
        <div
          role="alert"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040911]/95 p-6 text-center"
        >
          <div className="max-w-lg rounded-2xl border border-red-400/40 bg-slate-900/95 p-6 text-sm leading-relaxed text-red-100">
            <h2 className="text-base font-semibold text-red-200 mb-2">
              WebGL2 Initialization Error
            </h2>
            <p className="whitespace-pre-wrap">{errorMessage}</p>
          </div>
        </div>
      )}
    </main>
  );
}
