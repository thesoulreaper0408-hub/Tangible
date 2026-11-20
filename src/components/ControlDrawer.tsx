import { ChevronDown } from 'lucide-react';
import { ENV_PRESETS, TILE_PALETTES } from '../pool/presets';
import type { EnvPresetKey, SimulationState } from '../pool/types';

interface ControlDrawerProps {
  state: SimulationState;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectPreset: (key: EnvPresetKey) => void;
  onSelectTilePalette: (index: number) => void;
  onUpdateField: <K extends keyof SimulationState>(
    key: K,
    value: SimulationState[K],
  ) => void;
}

interface SliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: SliderRowProps) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-center justify-between text-[11.5px] mb-0.5">
        <label htmlFor={id} className="text-slate-200">
          {label}
        </label>
        <span className="font-mono-tabular text-[11px] text-cyan-300">
          {displayValue}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="pool-range"
      />
    </div>
  );
}

export function ControlDrawer({
  state,
  collapsed,
  onToggleCollapse,
  onSelectPreset,
  onSelectTilePalette,
  onUpdateField,
}: ControlDrawerProps) {
  const presetList = Object.values(ENV_PRESETS);

  return (
    <aside
      aria-label="Simulation Controls"
      className="fixed top-4 right-4 z-30 w-[min(324px,calc(100vw-32px))] max-h-[calc(100vh-32px)] flex flex-col items-end pointer-events-none max-sm:top-3 max-sm:right-3"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="simulation-control-panel"
        onClick={onToggleCollapse}
        className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/15 bg-[rgba(8,15,25,0.90)] text-slate-100 text-xs font-semibold shadow-lg hover:border-cyan-300/45 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        <span>Simulation Controls</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${
            collapsed ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <div
        id="simulation-control-panel"
        hidden={collapsed}
        className="pointer-events-auto mt-2 w-full max-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden rounded-2xl bg-[rgba(8,15,25,0.90)] border border-white/15 shadow-2xl p-3.5 pool-scroll"
      >
        {/* 1. Environment & Lighting */}
        <section className="pb-2.5 mb-2.5 border-b border-white/10">
          <h2 className="text-[11px] font-semibold tracking-wider text-cyan-300 mb-2">
            Environment &amp; Lighting
          </h2>
          <div className="grid grid-cols-2 gap-1.5">
            {presetList.map((preset) => {
              const active = state.env === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => onSelectPreset(preset.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left border transition-colors whitespace-nowrap truncate cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                    active
                      ? 'bg-[rgba(10,44,72,0.94)] border-cyan-400 text-white'
                      : 'bg-white/5 border-white/12 text-slate-200 hover:bg-white/10 hover:border-white/25'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Water Physics */}
        <section className="pb-2.5 mb-2.5 border-b border-white/10">
          <h2 className="text-[11px] font-semibold tracking-wider text-cyan-300 mb-2">
            Water Physics
          </h2>

          <SliderRow
            id="waveSpeed"
            label="Wave Speed"
            value={state.waveSpeed}
            min={0.25}
            max={1.65}
            step={0.01}
            displayValue={`${state.waveSpeed.toFixed(2)}x`}
            onChange={(v) => onUpdateField('waveSpeed', v)}
          />
          <SliderRow
            id="damping"
            label="Damping / Viscosity"
            value={state.damping}
            min={0.002}
            max={0.06}
            step={0.001}
            displayValue={state.damping.toFixed(3)}
            onChange={(v) => onUpdateField('damping', v)}
          />
          <SliderRow
            id="tension"
            label="Surface Tension"
            value={state.tension}
            min={0.0}
            max={1.0}
            step={0.01}
            displayValue={state.tension.toFixed(2)}
            onChange={(v) => onUpdateField('tension', v)}
          />

          <div className="flex items-center justify-between text-xs my-2">
            <label htmlFor="rainToggle" className="text-slate-200 cursor-pointer">
              Raindrop Generator
            </label>
            <input
              id="rainToggle"
              type="checkbox"
              checked={state.rainEnabled}
              onChange={(e) => onUpdateField('rainEnabled', e.target.checked)}
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </div>

          <SliderRow
            id="rainIntensity"
            label="Rain Intensity"
            value={state.rainIntensity}
            min={0.05}
            max={1.0}
            step={0.01}
            displayValue={state.rainIntensity.toFixed(2)}
            onChange={(v) => onUpdateField('rainIntensity', v)}
          />
          <SliderRow
            id="soundVolume"
            label="Soundscape Volume"
            value={state.soundVolume}
            min={0.0}
            max={1.0}
            step={0.01}
            displayValue={`${Math.round(state.soundVolume * 100)}%`}
            onChange={(v) => onUpdateField('soundVolume', v)}
          />
        </section>

        {/* 3. Optics & Shader */}
        <section className="pb-3 mb-3 border-b border-white/10">
          <h2 className="text-[11px] font-semibold tracking-wider text-cyan-300 mb-2.5">
            Optics &amp; Shader
          </h2>

          <SliderRow
            id="ior"
            label="Index of Refraction (IOR)"
            value={state.ior}
            min={1.1}
            max={1.6}
            step={0.001}
            displayValue={state.ior.toFixed(3)}
            onChange={(v) => onUpdateField('ior', v)}
          />
          <SliderRow
            id="dispersion"
            label="Chromatic Dispersion"
            value={state.dispersion}
            min={0.0}
            max={1.0}
            step={0.01}
            displayValue={state.dispersion.toFixed(2)}
            onChange={(v) => onUpdateField('dispersion', v)}
          />
          <SliderRow
            id="causticSharpness"
            label="Caustic Sharpness"
            value={state.causticSharpness}
            min={0.1}
            max={1.0}
            step={0.01}
            displayValue={state.causticSharpness.toFixed(2)}
            onChange={(v) => onUpdateField('causticSharpness', v)}
          />
          <SliderRow
            id="causticBrightness"
            label="Caustic Brightness"
            value={state.causticBrightness}
            min={0.0}
            max={2.5}
            step={0.02}
            displayValue={state.causticBrightness.toFixed(2)}
            onChange={(v) => onUpdateField('causticBrightness', v)}
          />
          <SliderRow
            id="turbidity"
            label="Turbidity (Clarity)"
            value={state.turbidity}
            min={0.0}
            max={1.0}
            step={0.01}
            displayValue={state.turbidity.toFixed(2)}
            onChange={(v) => onUpdateField('turbidity', v)}
          />
          <SliderRow
            id="absorptionDepth"
            label="Beer-Lambert Absorption"
            value={state.absorptionScale}
            min={0.2}
            max={2.5}
            step={0.02}
            displayValue={`${state.absorptionScale.toFixed(2)}x`}
            onChange={(v) => onUpdateField('absorptionScale', v)}
          />
        </section>

        {/* 4. Sun & Pool Customization */}
        <section>
          <h2 className="text-[11px] font-semibold tracking-wider text-cyan-300 mb-2.5">
            Sun &amp; Pool Customization
          </h2>

          <SliderRow
            id="sunAzimuth"
            label="Sun Azimuth"
            value={state.sunAzimuth}
            min={0}
            max={360}
            step={1}
            displayValue={`${Math.round(state.sunAzimuth)}°`}
            onChange={(v) => onUpdateField('sunAzimuth', v)}
          />
          <SliderRow
            id="sunElevation"
            label="Sun Elevation"
            value={state.sunElevation}
            min={2}
            max={88}
            step={1}
            displayValue={`${Math.round(state.sunElevation)}°`}
            onChange={(v) => onUpdateField('sunElevation', v)}
          />

          <div className="flex items-center justify-between text-xs my-2.5">
            <label htmlFor="ledToggle" className="text-slate-200 cursor-pointer">
              Underwater LEDs
            </label>
            <div className="flex items-center gap-2">
              <label htmlFor="ledColor" className="sr-only">
                Underwater LED color
              </label>
              <input
                id="ledColor"
                type="color"
                value={state.ledColor}
                onChange={(e) => onUpdateField('ledColor', e.target.value)}
                title="Underwater spotlight color"
                className="w-7 h-5 rounded border border-white/30 bg-transparent cursor-pointer p-0"
              />
              <input
                id="ledToggle"
                type="checkbox"
                checked={state.ledEnabled}
                onChange={(e) => onUpdateField('ledEnabled', e.target.checked)}
                className="w-4 h-4 accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          <div className="text-xs text-slate-200 mb-1.5">Ceramic Tile Palette</div>
          <div className="grid grid-cols-2 gap-1.5">
            {TILE_PALETTES.map((palette) => {
              const active = state.tilePalette === palette.index;
              return (
                <button
                  key={palette.key}
                  type="button"
                  onClick={() => onSelectTilePalette(palette.index)}
                  className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium text-left border transition-colors whitespace-nowrap truncate cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                    active
                      ? 'bg-cyan-400/20 border-sky-400 text-white'
                      : 'bg-white/5 border-white/12 text-slate-200 hover:bg-white/10 hover:border-white/25'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-3 h-3 rounded shrink-0 border border-white/35"
                    style={{ background: palette.swatchGradient }}
                  />
                  <span className="truncate">{palette.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
