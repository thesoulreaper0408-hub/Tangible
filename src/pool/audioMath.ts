export interface ImpulseAudioParams {
  magnitude: number;
  pan: number;
  isDiscreteImpact: boolean;
  bodyGain: number;
  bodyCenterHz: number;
  sprayGain: number;
  sprayStartHz: number;
  sprayEndHz: number;
  thumpGain: number;
  thumpStartHz: number;
  thumpEndHz: number;
  bubbleCount: number;
  decaySec: number;
}

export interface RaindropAudioParams {
  pan: number;
  startHz: number;
  endHz: number;
  gain: number;
  durationSec: number;
}

export interface SloshAudioParams {
  normalizedEnergy: number;
  sloshGain: number;
  sloshCenterHz: number;
  ambientLapGain: number;
  rainBedGain: number;
  pumpNoiseGain: number;
  pumpCutoffHz: number;
  pumpHumGain: number;
  pumpLfoHz: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Maps a wave impulse's signed strength, spatial radius, and UV X coordinate
 * to layered liquid splash synthesis parameters (body splash, frothy spray,
 * cavity plunge thump, and micro-bubble trailing pops).
 */
export function mapImpulseToAudioParams(
  strength: number,
  radiusMeters: number,
  uvX: number,
): ImpulseAudioParams {
  const absStrength = Math.abs(strength);
  const radiusScale = clamp(radiusMeters / 0.45, 0.25, 1.35);
  const magnitude = clamp(
    (absStrength / 0.085) * 0.75 + (radiusScale - 0.25) * 0.25,
    0.04,
    1.0,
  );
  const pan = clamp((uvX - 0.5) * 1.5, -0.8, 0.8);
  const isDiscreteImpact = absStrength >= 0.035;

  // Low-mid water body displacement swoosh
  const bodyGain = clamp(0.04 + Math.pow(magnitude, 1.1) * 0.22, 0.03, 0.28);
  const bodyCenterHz = clamp(540 - magnitude * 210, 300, 560);

  // High-frequency frothy droplet spray (white noise sculpted into liquid shimmer)
  const sprayGain = clamp(0.02 + Math.pow(magnitude, 1.25) * 0.16, 0.015, 0.2);
  const sprayStartHz = clamp(1350 + magnitude * 1150, 1200, 2600);
  const sprayEndHz = clamp(520 + magnitude * 320, 480, 920);

  // Brief downward cavity plunge thump (only for discrete impacts, not drag wakes)
  const thumpGain = isDiscreteImpact
    ? clamp(0.045 + magnitude * 0.11, 0.03, 0.16)
    : 0;
  const thumpStartHz = clamp(150 - magnitude * 35, 105, 160);
  const thumpEndHz = clamp(68 - magnitude * 14, 48, 76);

  // Tiny trailing bubble pops for realistic water breakup
  const bubbleCount = isDiscreteImpact
    ? Math.min(4, Math.max(1, Math.round(1 + magnitude * 3)))
    : 0;

  const decaySec = clamp(0.11 + magnitude * 0.27, 0.1, 0.42);

  return {
    magnitude,
    pan,
    isDiscreteImpact,
    bodyGain,
    bodyCenterHz,
    sprayGain,
    sprayStartHz,
    sprayEndHz,
    thumpGain,
    thumpStartHz,
    thumpEndHz,
    bubbleCount,
    decaySec,
  };
}

/**
 * Maps an individual raindrop hit on the pool surface to a crisp Minnaert
 * bubble ping with stereo pan derived from horizontal pool position.
 */
export function mapRaindropToAudioParams(
  uvX: number,
  strength: number,
  rainIntensity: number,
  randPitch: number,
  randDur: number,
): RaindropAudioParams {
  const pan = clamp((uvX - 0.5) * 1.4, -0.75, 0.75);
  const basePitch = 920 + clamp(randPitch, 0, 1) * 1550;
  const startHz = basePitch;
  const endHz = basePitch * (1.28 + clamp(randDur, 0, 1) * 0.22);
  const ampNorm = clamp(Math.abs(strength) / 0.03, 0.2, 1.0);
  const intensityScale = clamp(0.45 + rainIntensity * 0.55, 0.35, 1.0);
  const gain = clamp(0.022 + ampNorm * intensityScale * 0.042, 0.018, 0.075);
  const durationSec = clamp(0.04 + clamp(randDur, 0, 1) * 0.04, 0.038, 0.088);

  return {
    pan,
    startHz,
    endHz,
    gain,
    durationSec,
  };
}

/**
 * Computes root-mean-square water surface vertical velocity across the pool
 * and combines it with impulse energy, rain state, and turbidity to drive
 * continuous sloshing and the persistent pool pump hum.
 */
export function computeWaveSloshLevel(
  cpuVelocities: Float32Array,
  recentImpulseEnergy: number,
  rainEnabled: boolean,
  rainIntensity: number,
  turbidity = 0.1,
): SloshAudioParams {
  let sumSq = 0;
  const len = cpuVelocities.length;
  for (let i = 0; i < len; i++) {
    const v = cpuVelocities[i];
    sumSq += v * v;
  }
  const rms = len > 0 ? Math.sqrt(sumSq / len) : 0;

  const waveNorm = clamp(rms / 0.085, 0, 1);
  const impNorm = clamp(recentImpulseEnergy, 0, 1);
  const normalizedEnergy = clamp(Math.max(waveNorm, impNorm * 0.85), 0, 1);

  const sloshGain = clamp(
    0.012 + Math.pow(normalizedEnergy, 1.15) * 0.16,
    0.012,
    0.2,
  );
  const sloshCenterHz = clamp(210 + normalizedEnergy * 520, 200, 780);
  const ambientLapGain = clamp(0.026 + normalizedEnergy * 0.044, 0.024, 0.085);
  const rainBedGain = rainEnabled
    ? clamp(0.018 + clamp(rainIntensity, 0, 1) * 0.055, 0.015, 0.08)
    : 0;

  const turb = clamp(turbidity, 0, 1);
  const pumpNoiseGain = clamp(0.014 + turb * 0.032, 0.012, 0.05);
  const pumpCutoffHz = clamp(145 + turb * 235, 130, 400);
  const pumpHumGain = clamp(0.006 + turb * 0.011, 0.005, 0.02);
  const pumpLfoHz = clamp(0.14 + turb * 0.24, 0.12, 0.42);

  return {
    normalizedEnergy,
    sloshGain,
    sloshCenterHz,
    ambientLapGain,
    rainBedGain,
    pumpNoiseGain,
    pumpCutoffHz,
    pumpHumGain,
    pumpLfoHz,
  };
}
