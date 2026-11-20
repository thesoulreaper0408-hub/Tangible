export type EnvPresetKey = 'noon' | 'sunset' | 'midnight' | 'overcast';
export type TilePaletteKey = 'cyan' | 'cobalt' | 'white' | 'slate';

export type Vec3 = [number, number, number];

export interface EnvPreset {
  key: EnvPresetKey;
  label: string;
  sunAzimuth: number;
  sunElevation: number;
  sunColor: Vec3;
  sunDirectScale: number;
  skyZenith: Vec3;
  skyHorizon: Vec3;
  ambientColor: Vec3;
  cloudCover: number;
  nightFactor: number;
  causticSharpness: number;
  causticBrightness: number;
  ledEnabled: boolean;
  rainEnabled: boolean;
}

export interface SimulationState {
  env: EnvPresetKey;
  waveSpeed: number;
  damping: number;
  tension: number;
  rainEnabled: boolean;
  rainIntensity: number;
  ior: number;
  dispersion: number;
  causticSharpness: number;
  causticBrightness: number;
  turbidity: number;
  absorptionScale: number;
  sunAzimuth: number;
  sunElevation: number;
  ledEnabled: boolean;
  ledColor: string;
  tilePalette: number;
  sunColor: Vec3;
  sunDirectScale: number;
  skyZenith: Vec3;
  skyHorizon: Vec3;
  ambientColor: Vec3;
  cloudCover: number;
  nightFactor: number;
  leftOrbitMode: boolean;
  soundEnabled: boolean;
  soundVolume: number;
}

export interface CameraState {
  theta: number;
  phi: number;
  dist: number;
  targetTheta: number;
  targetPhi: number;
  targetDist: number;
  target: Vec3;
  fov: number;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  rot: Float32Array;
}

export interface NoodleState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  vyaw: number;
  pitch: number;
  vpitch: number;
  halfLen: number;
  r: number;
}

export interface WaterPickHit {
  u: number;
  v: number;
  wx: number;
  wz: number;
}

export interface PoolStats {
  fps: number;
  precisionLabel: '32F' | '16F';
  softwareGl: boolean;
}
