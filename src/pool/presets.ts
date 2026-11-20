import type {
  CameraState,
  EnvPreset,
  EnvPresetKey,
  SimulationState,
  TilePaletteKey,
  Vec3,
  WaterPickHit,
} from './types';

export const POOL_HALF_X = 3.0;
export const POOL_HALF_Z = 6.0;
export const SIM_W = 256;
export const SIM_H = 512;
export const CAUSTIC_W = 768;
export const CAUSTIC_H = 1152;
export const CAUSTIC_GRID_X = 112;
export const CAUSTIC_GRID_Z = 224;

export const ENV_PRESETS: Record<EnvPresetKey, EnvPreset> = {
  noon: {
    key: 'noon',
    label: 'Tropical Noon',
    sunAzimuth: 135,
    sunElevation: 62,
    sunColor: [1.0, 0.97, 0.91],
    sunDirectScale: 4.1,
    skyZenith: [0.13, 0.44, 0.92],
    skyHorizon: [0.6, 0.84, 0.98],
    ambientColor: [1.0, 1.0, 1.0],
    cloudCover: 0.34,
    nightFactor: 0.0,
    causticSharpness: 0.72,
    causticBrightness: 1.25,
    ledEnabled: false,
    rainEnabled: false,
  },
  sunset: {
    key: 'sunset',
    label: 'Golden Sunset',
    sunAzimuth: 238,
    sunElevation: 12,
    sunColor: [1.0, 0.52, 0.2],
    sunDirectScale: 3.7,
    skyZenith: [0.1, 0.16, 0.42],
    skyHorizon: [1.0, 0.46, 0.22],
    ambientColor: [0.95, 0.78, 0.72],
    cloudCover: 0.42,
    nightFactor: 0.08,
    causticSharpness: 0.65,
    causticBrightness: 1.35,
    ledEnabled: false,
    rainEnabled: false,
  },
  midnight: {
    key: 'midnight',
    label: 'Midnight LEDs',
    sunAzimuth: 42,
    sunElevation: 38,
    sunColor: [0.42, 0.56, 0.82],
    sunDirectScale: 0.34,
    skyZenith: [0.006, 0.012, 0.036],
    skyHorizon: [0.024, 0.042, 0.095],
    ambientColor: [0.22, 0.3, 0.48],
    cloudCover: 0.18,
    nightFactor: 1.0,
    causticSharpness: 0.55,
    causticBrightness: 0.55,
    ledEnabled: true,
    rainEnabled: false,
  },
  overcast: {
    key: 'overcast',
    label: 'Overcast Drizzle',
    sunAzimuth: 165,
    sunElevation: 44,
    sunColor: [0.85, 0.9, 0.96],
    sunDirectScale: 0.78,
    skyZenith: [0.3, 0.37, 0.46],
    skyHorizon: [0.58, 0.65, 0.72],
    ambientColor: [1.18, 1.22, 1.28],
    cloudCover: 0.92,
    nightFactor: 0.0,
    causticSharpness: 0.35,
    causticBrightness: 0.65,
    ledEnabled: false,
    rainEnabled: true,
  },
};

export const TILE_PALETTE_MAP: Record<TilePaletteKey, number> = {
  cyan: 0,
  cobalt: 1,
  white: 2,
  slate: 3,
};

export const TILE_PALETTES: Array<{
  key: TilePaletteKey;
  index: number;
  label: string;
  swatchGradient: string;
}> = [
  {
    key: 'cyan',
    index: 0,
    label: 'Classic Cyan',
    swatchGradient: 'linear-gradient(135deg, #a5f3fc, #0284c7)',
  },
  {
    key: 'cobalt',
    index: 1,
    label: 'Med. Cobalt',
    swatchGradient: 'linear-gradient(135deg, #3b82f6, #1e3a8a)',
  },
  {
    key: 'white',
    index: 2,
    label: 'Resort White',
    swatchGradient: 'linear-gradient(135deg, #ffffff, #cbd5e1)',
  },
  {
    key: 'slate',
    index: 3,
    label: 'Dark Slate',
    swatchGradient: 'linear-gradient(135deg, #334155, #0f172a)',
  },
];

export function createInitialSimState(): SimulationState {
  const noon = ENV_PRESETS.noon;
  return {
    env: 'noon',
    waveSpeed: 1.0,
    damping: 0.012,
    tension: 0.35,
    rainEnabled: noon.rainEnabled,
    rainIntensity: 0.45,
    ior: 1.333,
    dispersion: 0.32,
    causticSharpness: noon.causticSharpness,
    causticBrightness: noon.causticBrightness,
    turbidity: 0.1,
    absorptionScale: 1.0,
    sunAzimuth: noon.sunAzimuth,
    sunElevation: noon.sunElevation,
    ledEnabled: noon.ledEnabled,
    ledColor: '#00e5ff',
    tilePalette: 0,
    sunColor: [...noon.sunColor],
    sunDirectScale: noon.sunDirectScale,
    skyZenith: [...noon.skyZenith],
    skyHorizon: [...noon.skyHorizon],
    ambientColor: [...noon.ambientColor],
    cloudCover: noon.cloudCover,
    nightFactor: noon.nightFactor,
    leftOrbitMode: false,
    soundEnabled: true,
    soundVolume: 0.65,
  };
}

export function createInitialCameraState(): CameraState {
  return {
    theta: -0.84,
    phi: 0.9,
    dist: 9.6,
    targetTheta: -0.84,
    targetPhi: 0.9,
    targetDist: 9.6,
    target: [0.0, -0.35, 0.9],
    fov: (48 * Math.PI) / 180,
  };
}

export function applyPresetToState(
  prev: SimulationState,
  key: EnvPresetKey,
): SimulationState {
  const p = ENV_PRESETS[key];
  return {
    ...prev,
    env: key,
    sunAzimuth: p.sunAzimuth,
    sunElevation: p.sunElevation,
    sunColor: [...p.sunColor],
    sunDirectScale: p.sunDirectScale,
    skyZenith: [...p.skyZenith],
    skyHorizon: [...p.skyHorizon],
    ambientColor: [...p.ambientColor],
    cloudCover: p.cloudCover,
    nightFactor: p.nightFactor,
    causticSharpness: p.causticSharpness,
    causticBrightness: p.causticBrightness,
    ledEnabled: p.ledEnabled,
    rainEnabled: p.rainEnabled,
  };
}

export function hexToLinearRGB(hex: string): Vec3 {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6) return [0, 0.8, 1];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
}

export function getSunDirection(sunAzimuth: number, sunElevation: number): Vec3 {
  const az = (sunAzimuth * Math.PI) / 180;
  const elv = (sunElevation * Math.PI) / 180;
  const c = Math.cos(elv);
  return [c * Math.sin(az), Math.sin(elv), c * Math.cos(az)];
}

export function getCameraPosition(
  theta: number,
  phi: number,
  dist: number,
  target: Vec3,
): Vec3 {
  const sp = Math.sin(phi);
  return [
    target[0] + dist * sp * Math.sin(theta),
    Math.max(0.28, target[1] + dist * Math.cos(phi)),
    target[2] + dist * sp * Math.cos(theta),
  ];
}

export function normalizeVec(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function crossVec(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function pickWaterSurface(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  cam: CameraState,
): WaterPickHit | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
  const aspect = rect.width / Math.max(1, rect.height);
  const tanHalf = Math.tan(cam.fov * 0.5);

  const pos = getCameraPosition(cam.theta, cam.phi, cam.dist, cam.target);
  const fwd = normalizeVec([
    cam.target[0] - pos[0],
    cam.target[1] - pos[1],
    cam.target[2] - pos[2],
  ]);
  const right = normalizeVec(crossVec(fwd, [0, 1, 0]));
  const up = crossVec(right, fwd);

  const rd = normalizeVec([
    fwd[0] + right[0] * ndcX * aspect * tanHalf + up[0] * ndcY * tanHalf,
    fwd[1] + right[1] * ndcX * aspect * tanHalf + up[1] * ndcY * tanHalf,
    fwd[2] + right[2] * ndcX * aspect * tanHalf + up[2] * ndcY * tanHalf,
  ]);

  if (rd[1] >= -0.005) return null;
  const t = -pos[1] / rd[1];
  if (t <= 0) return null;

  const wx = pos[0] + rd[0] * t;
  const wz = pos[2] + rd[2] * t;

  // Check diving board overhang occlusion
  const tBoard = (0.68 - pos[1]) / rd[1];
  if (tBoard > 0 && tBoard < t) {
    const bx = pos[0] + rd[0] * tBoard;
    const bz = pos[2] + rd[2] * tBoard;
    if (Math.abs(bx) < 0.26 && bz > 4.82 && bz < 7.5) return null;
  }

  if (Math.abs(wx) <= POOL_HALF_X && Math.abs(wz) <= POOL_HALF_Z) {
    return {
      u: (wx + POOL_HALF_X) / (2 * POOL_HALF_X),
      v: (wz + POOL_HALF_Z) / (2 * POOL_HALF_Z),
      wx,
      wz,
    };
  }
  return null;
}
