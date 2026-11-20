import {
  computeWaveSloshLevel,
  mapImpulseToAudioParams,
  mapRaindropToAudioParams,
} from './audioMath';

export type AudioContextStatus = 'off' | 'suspended' | 'running';

export class PoolAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  // Buffers
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private whiteNoiseBuffer: AudioBuffer | null = null;

  // 1. Ambient pool lapping
  private lapSource: AudioBufferSourceNode | null = null;
  private lapFilter: BiquadFilterNode | null = null;
  private lapGain: GainNode | null = null;
  private lapLfo: OscillatorNode | null = null;

  // 2. Wave-energy sloshing noise bed
  private sloshSource: AudioBufferSourceNode | null = null;
  private sloshFilter: BiquadFilterNode | null = null;
  private sloshGain: GainNode | null = null;

  // 3. Rain surface shimmer bed
  private rainBedSource: AudioBufferSourceNode | null = null;
  private rainBedFilter: BiquadFilterNode | null = null;
  private rainBedGain: GainNode | null = null;

  // 4. Persistent pool filtration pump hum (white-noise filtered oscillator + subtle 58Hz hum)
  private pumpNoiseSource: AudioBufferSourceNode | null = null;
  private pumpFilter: BiquadFilterNode | null = null;
  private pumpNoiseGain: GainNode | null = null;
  private pumpLfo: OscillatorNode | null = null;
  private pumpHumOsc: OscillatorNode | null = null;
  private pumpHumGain: GainNode | null = null;

  private enabled = true;
  private volume = 0.65;
  private disposed = false;

  private recentImpulseEnergy = 0;
  private lastSplashAtMs = 0;
  private lastRaindropAtMs = 0;
  private activeRaindrops = 0;
  private readonly onStatusChange?: (status: AudioContextStatus) => void;

  constructor(onStatusChange?: (status: AudioContextStatus) => void) {
    this.onStatusChange = onStatusChange;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
        b6 = white * 0.115926;
      }
      const fade = 512;
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[i] = data[i] * t + data[length - fade + i] * (1 - t);
      }
    }
    return buffer;
  }

  private createWhiteNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.25;
      }
      const fade = 512;
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[i] = data[i] * t + data[length - fade + i] * (1 - t);
      }
    }
    return buffer;
  }

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;

    const masterGain = ctx.createGain();
    masterGain.gain.value = this.enabled ? this.volume : 0;

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);
    this.compressor = compressor;
    this.masterGain = masterGain;

    const pinkNoiseBuffer = this.createPinkNoiseBuffer(ctx, 3);
    const whiteNoiseBuffer = this.createWhiteNoiseBuffer(ctx, 3);
    this.pinkNoiseBuffer = pinkNoiseBuffer;
    this.whiteNoiseBuffer = whiteNoiseBuffer;

    // 1. Subtle pool lapping ambience
    const lapSource = ctx.createBufferSource();
    lapSource.buffer = pinkNoiseBuffer;
    lapSource.loop = true;

    const lapFilter = ctx.createBiquadFilter();
    lapFilter.type = 'lowpass';
    lapFilter.frequency.value = 260;
    lapFilter.Q.value = 0.7;

    const lapGain = ctx.createGain();
    lapGain.gain.value = 0.026;

    const lapLfo = ctx.createOscillator();
    lapLfo.type = 'sine';
    lapLfo.frequency.value = 0.22;
    const lapLfoGain = ctx.createGain();
    lapLfoGain.gain.value = 85;
    lapLfo.connect(lapLfoGain);
    lapLfoGain.connect(lapFilter.frequency);

    lapSource.connect(lapFilter);
    lapFilter.connect(lapGain);
    lapGain.connect(compressor);
    lapSource.start();
    lapLfo.start();

    this.lapSource = lapSource;
    this.lapFilter = lapFilter;
    this.lapGain = lapGain;
    this.lapLfo = lapLfo;

    // 2. Wave-energy sloshing noise bed
    const sloshSource = ctx.createBufferSource();
    sloshSource.buffer = pinkNoiseBuffer;
    sloshSource.loop = true;
    sloshSource.playbackRate.value = 1.07;

    const sloshFilter = ctx.createBiquadFilter();
    sloshFilter.type = 'bandpass';
    sloshFilter.frequency.value = 220;
    sloshFilter.Q.value = 1.25;

    const sloshGain = ctx.createGain();
    sloshGain.gain.value = 0.012;

    sloshSource.connect(sloshFilter);
    sloshFilter.connect(sloshGain);
    sloshGain.connect(compressor);
    sloshSource.start(0, 0.7);

    this.sloshSource = sloshSource;
    this.sloshFilter = sloshFilter;
    this.sloshGain = sloshGain;

    // 3. Rain surface shimmer bed
    const rainBedSource = ctx.createBufferSource();
    rainBedSource.buffer = whiteNoiseBuffer;
    rainBedSource.loop = true;
    rainBedSource.playbackRate.value = 1.15;

    const rainBedFilter = ctx.createBiquadFilter();
    rainBedFilter.type = 'highpass';
    rainBedFilter.frequency.value = 2300;
    rainBedFilter.Q.value = 0.6;

    const rainBedGain = ctx.createGain();
    rainBedGain.gain.value = 0;

    rainBedSource.connect(rainBedFilter);
    rainBedFilter.connect(rainBedGain);
    rainBedGain.connect(compressor);
    rainBedSource.start(0, 1.4);

    this.rainBedSource = rainBedSource;
    this.rainBedFilter = rainBedFilter;
    this.rainBedGain = rainBedGain;

    // 4. Persistent low-volume pool pump white-noise hum modulated by turbidity
    const pumpNoiseSource = ctx.createBufferSource();
    pumpNoiseSource.buffer = whiteNoiseBuffer;
    pumpNoiseSource.loop = true;

    const pumpFilter = ctx.createBiquadFilter();
    pumpFilter.type = 'lowpass';
    pumpFilter.frequency.value = 165;
    pumpFilter.Q.value = 1.65;

    const pumpNoiseGain = ctx.createGain();
    pumpNoiseGain.gain.value = 0.017;

    const pumpLfo = ctx.createOscillator();
    pumpLfo.type = 'sine';
    pumpLfo.frequency.value = 0.16;
    const pumpLfoDepth = ctx.createGain();
    pumpLfoDepth.gain.value = 28;
    pumpLfo.connect(pumpLfoDepth);
    pumpLfoDepth.connect(pumpFilter.frequency);

    pumpNoiseSource.connect(pumpFilter);
    pumpFilter.connect(pumpNoiseGain);
    pumpNoiseGain.connect(compressor);
    pumpNoiseSource.start(0, 0.35);
    pumpLfo.start();

    // Subtle 58Hz motor resonance layered underneath the pump white noise
    const pumpHumOsc = ctx.createOscillator();
    pumpHumOsc.type = 'sine';
    pumpHumOsc.frequency.value = 58;
    const pumpHumGain = ctx.createGain();
    pumpHumGain.gain.value = 0.007;
    pumpHumOsc.connect(pumpHumGain);
    pumpHumGain.connect(compressor);
    pumpHumOsc.start();

    this.pumpNoiseSource = pumpNoiseSource;
    this.pumpFilter = pumpFilter;
    this.pumpNoiseGain = pumpNoiseGain;
    this.pumpLfo = pumpLfo;
    this.pumpHumOsc = pumpHumOsc;
    this.pumpHumGain = pumpHumGain;

    ctx.onstatechange = () => this.emitStatus();
    this.emitStatus();
    return ctx;
  }

  private emitStatus(): void {
    if (!this.onStatusChange) return;
    if (!this.enabled) {
      this.onStatusChange('off');
      return;
    }
    if (!this.ctx) {
      this.onStatusChange('suspended');
      return;
    }
    this.onStatusChange(this.ctx.state === 'running' ? 'running' : 'suspended');
  }

  unlock(): void {
    if (!this.enabled || this.disposed) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => this.emitStatus());
    } else {
      this.emitStatus();
    }
  }

  setConfig(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        now,
        0.04,
      );
    }
    if (this.enabled && this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => this.emitStatus());
    } else {
      this.emitStatus();
    }
  }

  updateWaveMotion(
    dt: number,
    cpuVelocities: Float32Array,
    rainEnabled: boolean,
    rainIntensity: number,
    turbidity = 0.1,
  ): void {
    this.recentImpulseEnergy *= Math.exp(-2.8 * dt);
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;

    const params = computeWaveSloshLevel(
      cpuVelocities,
      this.recentImpulseEnergy,
      rainEnabled,
      rainIntensity,
      turbidity,
    );
    const now = this.ctx.currentTime;
    this.sloshGain?.gain.setTargetAtTime(params.sloshGain, now, 0.08);
    this.sloshFilter?.frequency.setTargetAtTime(params.sloshCenterHz, now, 0.09);
    this.lapGain?.gain.setTargetAtTime(params.ambientLapGain, now, 0.14);
    this.rainBedGain?.gain.setTargetAtTime(params.rainBedGain, now, 0.2);

    // Gently modulate pool pump white-noise hum with turbidity
    this.pumpNoiseGain?.gain.setTargetAtTime(params.pumpNoiseGain, now, 0.18);
    this.pumpFilter?.frequency.setTargetAtTime(params.pumpCutoffHz, now, 0.18);
    this.pumpHumGain?.gain.setTargetAtTime(params.pumpHumGain, now, 0.18);
    this.pumpLfo?.frequency.setTargetAtTime(params.pumpLfoHz, now, 0.25);
  }

  triggerImpulseSplash(
    uvX: number,
    radiusMeters: number,
    strength: number,
  ): void {
    const params = mapImpulseToAudioParams(strength, radiusMeters, uvX);
    this.recentImpulseEnergy = Math.min(
      1,
      this.recentImpulseEnergy + params.magnitude * 0.55,
    );

    if (!this.ctx || !this.compressor || !this.enabled) return;
    if (this.ctx.state !== 'running') return;

    const nowMs = performance.now();
    if (nowMs - this.lastSplashAtMs < 55 && !params.isDiscreteImpact) return;
    this.lastSplashAtMs = nowMs;

    const ctx = this.ctx;
    const t = ctx.currentTime;

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(params.pan, t);
    panner.connect(this.compressor);

    // Layer 1: Low-mid liquid body displacement swoosh (pink noise bandpass)
    if (this.pinkNoiseBuffer) {
      const bodyNoise = ctx.createBufferSource();
      bodyNoise.buffer = this.pinkNoiseBuffer;
      bodyNoise.playbackRate.value = 0.9 + params.magnitude * 0.35;

      const bodyFilter = ctx.createBiquadFilter();
      bodyFilter.type = 'bandpass';
      bodyFilter.frequency.setValueAtTime(params.bodyCenterHz * 1.25, t);
      bodyFilter.frequency.exponentialRampToValueAtTime(
        Math.max(170, params.bodyCenterHz * 0.55),
        t + params.decaySec,
      );
      bodyFilter.Q.value = 0.85;

      const bodyEnv = ctx.createGain();
      bodyEnv.gain.setValueAtTime(0.0001, t);
      bodyEnv.gain.linearRampToValueAtTime(params.bodyGain, t + 0.008);
      bodyEnv.gain.exponentialRampToValueAtTime(0.0001, t + params.decaySec);

      bodyNoise.connect(bodyFilter);
      bodyFilter.connect(bodyEnv);
      bodyEnv.connect(panner);
      const offset = Math.random() * 2.1;
      bodyNoise.start(t, offset, params.decaySec + 0.05);
      bodyNoise.stop(t + params.decaySec + 0.05);
    }

    // Layer 2: Frothy droplet spray (white noise sculpted with highpass + downward sweep)
    if (this.whiteNoiseBuffer) {
      const sprayNoise = ctx.createBufferSource();
      sprayNoise.buffer = this.whiteNoiseBuffer;
      sprayNoise.playbackRate.value = 1.0 + Math.random() * 0.25;

      const sprayHP = ctx.createBiquadFilter();
      sprayHP.type = 'highpass';
      sprayHP.frequency.setValueAtTime(580, t);

      const sprayBP = ctx.createBiquadFilter();
      sprayBP.type = 'bandpass';
      sprayBP.frequency.setValueAtTime(params.sprayStartHz, t);
      sprayBP.frequency.exponentialRampToValueAtTime(
        params.sprayEndHz,
        t + params.decaySec * 0.85,
      );
      sprayBP.Q.value = 0.75;

      const sprayEnv = ctx.createGain();
      sprayEnv.gain.setValueAtTime(0.0001, t);
      sprayEnv.gain.linearRampToValueAtTime(params.sprayGain, t + 0.005);
      // Slight secondary splash swell for larger splashes
      if (params.isDiscreteImpact) {
        sprayEnv.gain.linearRampToValueAtTime(
          params.sprayGain * 0.45,
          t + 0.038,
        );
        sprayEnv.gain.linearRampToValueAtTime(
          params.sprayGain * 0.62,
          t + 0.072,
        );
      }
      sprayEnv.gain.exponentialRampToValueAtTime(0.0001, t + params.decaySec);

      sprayNoise.connect(sprayHP);
      sprayHP.connect(sprayBP);
      sprayBP.connect(sprayEnv);
      sprayEnv.connect(panner);
      const offset = Math.random() * 2.1;
      sprayNoise.start(t, offset, params.decaySec + 0.05);
      sprayNoise.stop(t + params.decaySec + 0.05);
    }

    // Layer 3: Brief downward cavity plunge thump (discrete drops/clicks only)
    if (params.isDiscreteImpact && params.thumpGain > 0) {
      const thumpOsc = ctx.createOscillator();
      thumpOsc.type = 'sine';
      thumpOsc.frequency.setValueAtTime(params.thumpStartHz, t);
      thumpOsc.frequency.exponentialRampToValueAtTime(
        params.thumpEndHz,
        t + 0.065,
      );

      const thumpEnv = ctx.createGain();
      thumpEnv.gain.setValueAtTime(0.0001, t);
      thumpEnv.gain.linearRampToValueAtTime(params.thumpGain, t + 0.005);
      thumpEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);

      thumpOsc.connect(thumpEnv);
      thumpEnv.connect(panner);
      thumpOsc.start(t);
      thumpOsc.stop(t + 0.085);
    }

    // Layer 4: Subtle staggered trailing micro-bubble pops (high-pitched, very short)
    for (let b = 0; b < params.bubbleCount; b++) {
      const delay = 0.028 + b * 0.028 + Math.random() * 0.022;
      const startTime = t + delay;
      const dur = 0.022 + Math.random() * 0.016;
      const f0 = 640 + Math.random() * 720;

      const bOsc = ctx.createOscillator();
      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(f0, startTime);
      bOsc.frequency.exponentialRampToValueAtTime(f0 * 1.45, startTime + dur);

      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0.0001, startTime);
      bGain.gain.linearRampToValueAtTime(
        0.014 + params.magnitude * 0.016,
        startTime + 0.003,
      );
      bGain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      bOsc.connect(bGain);
      bGain.connect(panner);
      bOsc.start(startTime);
      bOsc.stop(startTime + dur + 0.008);
    }
  }

  triggerRaindropPing(
    uvX: number,
    strength: number,
    rainIntensity: number,
  ): void {
    if (!this.ctx || !this.compressor || !this.enabled) return;
    if (this.ctx.state !== 'running') return;

    const nowMs = performance.now();
    if (this.activeRaindrops >= 14 || nowMs - this.lastRaindropAtMs < 26) {
      return;
    }
    this.lastRaindropAtMs = nowMs;

    const params = mapRaindropToAudioParams(
      uvX,
      strength,
      rainIntensity,
      Math.random(),
      Math.random(),
    );

    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.activeRaindrops++;

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(params.pan, t);
    panner.connect(this.compressor);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(params.startHz, t);
    osc.frequency.exponentialRampToValueAtTime(
      params.endHz,
      t + params.durationSec,
    );

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(params.gain, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + params.durationSec);

    osc.connect(gain);
    gain.connect(panner);
    osc.onended = () => {
      this.activeRaindrops = Math.max(0, this.activeRaindrops - 1);
      osc.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    osc.start(t);
    osc.stop(t + params.durationSec + 0.01);
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.lapSource?.stop();
      this.lapLfo?.stop();
      this.sloshSource?.stop();
      this.rainBedSource?.stop();
      this.pumpNoiseSource?.stop();
      this.pumpLfo?.stop();
      this.pumpHumOsc?.stop();
    } catch {
      // Ignore already-stopped nodes
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
