import { POOL_HALF_X, POOL_HALF_Z } from './presets';
import type { BallState, NoodleState } from './types';

export const CPU_WAVE_W = 48;
export const CPU_WAVE_H = 96;

export class CpuWaveGrid {
  readonly width = CPU_WAVE_W;
  readonly height = CPU_WAVE_H;
  readonly h = new Float32Array(CPU_WAVE_W * CPU_WAVE_H);
  readonly v = new Float32Array(CPU_WAVE_W * CPU_WAVE_H);

  addImpulse(uvX: number, uvY: number, radiusMeters: number, strength: number): void {
    const wx = (uvX - 0.5) * 6.0;
    const wz = (uvY - 0.5) * 12.0;
    const r = Math.max(radiusMeters, 0.16);
    const rCells = Math.ceil((r / 6.0) * this.width) + 1;
    const cx = Math.round(uvX * (this.width - 1));
    const cy = Math.round(uvY * (this.height - 1));
    for (let j = -rCells; j <= rCells; j++) {
      const y = cy + j;
      if (y < 0 || y >= this.height) continue;
      const pz = (y / (this.height - 1) - 0.5) * 12.0;
      for (let i = -rCells; i <= rCells; i++) {
        const x = cx + i;
        if (x < 0 || x >= this.width) continue;
        const px = (x / (this.width - 1) - 0.5) * 6.0;
        const d = Math.hypot(px - wx, pz - wz);
        if (d < r) {
          const f = Math.cos((d / r) * Math.PI * 0.5);
          const idx = y * this.width + x;
          this.h[idx] = Math.max(-0.17, Math.min(0.17, this.h[idx] + strength * f * f));
        }
      }
    }
  }

  step(dt: number, speed: number, damping: number): void {
    const c2 = Math.pow(speed * 2.2, 2);
    const damp = Math.exp(-(damping * 14.0 + 0.15) * dt);
    const dx = 6.0 / this.width;
    const invDx2 = 1.0 / (dx * dx);
    for (let y = 0; y < this.height; y++) {
      const ym = Math.max(0, y - 1) * this.width;
      const y0 = y * this.width;
      const yp = Math.min(this.height - 1, y + 1) * this.width;
      for (let x = 0; x < this.width; x++) {
        const xm = Math.max(0, x - 1);
        const xp = Math.min(this.width - 1, x + 1);
        const lap =
          (this.h[y0 + xm] +
            this.h[y0 + xp] +
            this.h[ym + x] +
            this.h[yp + x] -
            4.0 * this.h[y0 + x]) *
          invDx2;
        this.v[y0 + x] = (this.v[y0 + x] + c2 * lap * dt) * damp;
      }
    }
    for (let i = 0; i < this.width * this.height; i++) {
      this.h[i] = Math.max(-0.17, Math.min(0.17, this.h[i] + this.v[i] * dt));
    }
  }

  sample(wx: number, wz: number): { h: number; nx: number; ny: number; nz: number } {
    const u = Math.max(0.01, Math.min(0.99, (wx + 3.0) / 6.0));
    const v = Math.max(0.01, Math.min(0.99, (wz + 6.0) / 12.0));
    const fx = u * (this.width - 1);
    const fy = v * (this.height - 1);
    const ix = Math.min(this.width - 2, Math.floor(fx));
    const iy = Math.min(this.height - 2, Math.floor(fy));
    const tx = fx - ix;
    const ty = fy - iy;
    const h00 = this.h[iy * this.width + ix];
    const h10 = this.h[iy * this.width + ix + 1];
    const h01 = this.h[(iy + 1) * this.width + ix];
    const h11 = this.h[(iy + 1) * this.width + ix + 1];
    const h =
      (h00 * (1 - tx) + h10 * tx) * (1 - ty) +
      (h01 * (1 - tx) + h11 * tx) * ty;
    const dx = 6.0 / this.width;
    const dz = 12.0 / this.height;
    const dhdx = ((h10 - h00) * (1 - ty) + (h11 - h01) * ty) / dx;
    const dhdz = ((h01 - h00) * (1 - tx) + (h11 - h10) * tx) / dz;
    const invLen = 1.0 / Math.hypot(dhdx, 1.0, dhdz);
    return { h, nx: -dhdx * invLen, ny: invLen, nz: -dhdz * invLen };
  }
}

export function createInitialBall(): BallState {
  return {
    x: 0.75,
    y: 0.14,
    z: -0.95,
    vx: 0.0,
    vy: 0.0,
    vz: 0.0,
    r: 0.25,
    rot: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  };
}

export function createInitialNoodle(): NoodleState {
  return {
    x: -0.85,
    y: 0.015,
    z: 1.55,
    vx: 0.0,
    vy: 0.0,
    vz: 0.0,
    yaw: 0.68,
    vyaw: 0.0,
    pitch: 0.0,
    vpitch: 0.0,
    halfLen: 0.62,
    r: 0.048,
  };
}

export function rotateMat3AxisAngle(
  mat: Float32Array,
  ax: number,
  ay: number,
  az: number,
  angle: number,
): void {
  if (Math.abs(angle) < 1e-6) return;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const R = [
    t * ax * ax + c,
    t * ax * ay + s * az,
    t * ax * az - s * ay,
    t * ax * ay - s * az,
    t * ay * ay + c,
    t * ay * az + s * ax,
    t * ax * az + s * ay,
    t * ay * az - s * ax,
    t * az * az + c,
  ];
  const out = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      out[col * 3 + row] =
        R[row] * mat[col * 3] +
        R[3 + row] * mat[col * 3 + 1] +
        R[6 + row] * mat[col * 3 + 2];
    }
  }
  mat.set(out);
}

export function stepBuoyancy(
  dt: number,
  wave: CpuWaveGrid,
  ball: BallState,
  noodle: NoodleState,
): void {
  // 1. Beach Ball
  const r = ball.r;
  const samples = [
    wave.sample(ball.x, ball.z),
    wave.sample(ball.x + r * 0.6, ball.z),
    wave.sample(ball.x - r * 0.6, ball.z),
    wave.sample(ball.x, ball.z + r * 0.6),
    wave.sample(ball.x, ball.z - r * 0.6),
  ];
  let avgH = 0;
  let avgNx = 0;
  let avgNz = 0;
  for (const s of samples) {
    avgH += s.h;
    avgNx += s.nx;
    avgNz += s.nz;
  }
  avgH *= 0.2;
  avgNx *= 0.2;
  avgNz *= 0.2;

  const sub = Math.max(0, Math.min(2 * r, avgH + r - ball.y));
  const volFrac = (sub * sub * (3 * r - sub)) / (4 * r * r * r);
  const targetFrac = 0.14;
  const fy = (volFrac / targetFrac - 1.0) * 9.8;
  ball.vy = (ball.vy + fy * dt) * Math.exp(-3.2 * dt);
  ball.y += ball.vy * dt;

  ball.vx = (ball.vx + avgNx * 11.5 * dt) * Math.exp(-1.35 * dt);
  ball.vz = (ball.vz + avgNz * 11.5 * dt) * Math.exp(-1.35 * dt);
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  const limX = POOL_HALF_X - r - 0.06;
  const limZ = POOL_HALF_Z - r - 0.06;
  if (ball.x < -limX) {
    ball.x = -limX;
    ball.vx = Math.abs(ball.vx) * 0.65;
  }
  if (ball.x > limX) {
    ball.x = limX;
    ball.vx = -Math.abs(ball.vx) * 0.65;
  }
  if (ball.z < -limZ) {
    ball.z = -limZ;
    ball.vz = Math.abs(ball.vz) * 0.65;
  }
  if (ball.z > limZ) {
    ball.z = limZ;
    ball.vz = -Math.abs(ball.vz) * 0.65;
  }
  if (ball.x < -0.55 + r && ball.z < -4.45 + r) {
    if (-0.55 + r - ball.x < -4.45 + r - ball.z) {
      ball.x = -0.55 + r;
      ball.vx = Math.abs(ball.vx) * 0.6;
    } else {
      ball.z = -4.45 + r;
      ball.vz = Math.abs(ball.vz) * 0.6;
    }
  }

  const speedXZ = Math.hypot(ball.vx, ball.vz);
  if (speedXZ > 0.002) {
    const axisX = ball.vz / speedXZ;
    const axisZ = -ball.vx / speedXZ;
    rotateMat3AxisAngle(ball.rot, axisX, 0, axisZ, (speedXZ * dt) / r);
  }

  // 2. Foam Noodle
  const dirX = Math.cos(noodle.yaw);
  const dirZ = Math.sin(noodle.yaw);
  const sA = wave.sample(
    noodle.x - dirX * noodle.halfLen,
    noodle.z - dirZ * noodle.halfLen,
  );
  const sM = wave.sample(noodle.x, noodle.z);
  const sB = wave.sample(
    noodle.x + dirX * noodle.halfLen,
    noodle.z + dirZ * noodle.halfLen,
  );

  const nAvgH = (sA.h + sM.h + sB.h) / 3.0;
  const targetY = nAvgH + noodle.r * 0.25;
  noodle.vy = (noodle.vy + (targetY - noodle.y) * 42.0 * dt) * Math.exp(-4.0 * dt);
  noodle.y += noodle.vy * dt;

  const targetPitch = Math.atan2(sB.h - sA.h, 2.0 * noodle.halfLen);
  noodle.vpitch =
    (noodle.vpitch + (targetPitch - noodle.pitch) * 35.0 * dt) *
    Math.exp(-5.0 * dt);
  noodle.pitch += noodle.vpitch * dt;

  const nNx = (sA.nx + sM.nx + sB.nx) / 3.0;
  const nNz = (sA.nz + sM.nz + sB.nz) / 3.0;
  noodle.vx = (noodle.vx + nNx * 9.0 * dt) * Math.exp(-1.8 * dt);
  noodle.vz = (noodle.vz + nNz * 9.0 * dt) * Math.exp(-1.8 * dt);
  noodle.x += noodle.vx * dt;
  noodle.z += noodle.vz * dt;

  const torque = ((sB.nx - sA.nx) * -dirZ + (sB.nz - sA.nz) * dirX) * 4.5;
  noodle.vyaw = (noodle.vyaw + torque * dt) * Math.exp(-2.6 * dt);
  noodle.yaw += noodle.vyaw * dt;

  const nPad = noodle.halfLen * 0.72 + 0.12;
  if (noodle.x < -POOL_HALF_X + nPad) {
    noodle.x = -POOL_HALF_X + nPad;
    noodle.vx = Math.abs(noodle.vx) * 0.5;
  }
  if (noodle.x > POOL_HALF_X - nPad) {
    noodle.x = POOL_HALF_X - nPad;
    noodle.vx = -Math.abs(noodle.vx) * 0.5;
  }
  if (noodle.z < -POOL_HALF_Z + nPad) {
    noodle.z = -POOL_HALF_Z + nPad;
    noodle.vz = Math.abs(noodle.vz) * 0.5;
  }
  if (noodle.z > POOL_HALF_Z - nPad) {
    noodle.z = POOL_HALF_Z - nPad;
    noodle.vz = -Math.abs(noodle.vz) * 0.5;
  }

  // Soft collision between beach ball and foam noodle
  const cp = Math.cos(noodle.pitch);
  const ax = noodle.x - dirX * noodle.halfLen * cp;
  const az = noodle.z - dirZ * noodle.halfLen * cp;
  const bx = noodle.x + dirX * noodle.halfLen * cp;
  const bz = noodle.z + dirZ * noodle.halfLen * cp;
  const abx = bx - ax;
  const abz = bz - az;
  const proj = Math.max(
    0,
    Math.min(
      1,
      ((ball.x - ax) * abx + (ball.z - az) * abz) /
        Math.max(1e-5, abx * abx + abz * abz),
    ),
  );
  const cx = ax + abx * proj;
  const cz = az + abz * proj;
  const dx = ball.x - cx;
  const dz = ball.z - cz;
  const dist = Math.hypot(dx, dz);
  const minD = ball.r + noodle.r;
  if (dist < minD && dist > 1e-4) {
    const push = (minD - dist) * 0.5;
    const nx = dx / dist;
    const nz = dz / dist;
    ball.x += nx * push;
    ball.z += nz * push;
    noodle.x -= nx * push;
    noodle.z -= nz * push;
    ball.vx += nx * 0.25;
    ball.vz += nz * 0.25;
    noodle.vx -= nx * 0.2;
    noodle.vz -= nz * 0.2;
  }
}

// Mirror of the GLSL sampleHydrogenPixel bitmap so unit tests can verify glyph legibility
export const HYDROGEN_GLYPH_PACKED: ReadonlyArray<readonly [number, number]> = [
  [0x2318fa10, 0x0011], // h
  [0x1f18c400, 0x3a21], // y
  [0x2318bc21, 0x000f], // d
  [0x210cd800, 0x0010], // r
  [0x2318b800, 0x000e], // o
  [0x1f18bc00, 0x3a21], // g
  [0x21f8b800, 0x000f], // e
  [0x2318f800, 0x0011], // n
];

export function sampleHydrogenGlyphPixel(
  ch: number,
  row: number,
  col: number,
): boolean {
  if (ch < 0 || ch >= HYDROGEN_GLYPH_PACKED.length) return false;
  if (row < 0 || row > 8 || col < 0 || col > 4) return false;
  const [low, high] = HYDROGEN_GLYPH_PACKED[ch];
  const rowBits =
    row < 6 ? (low >>> (row * 5)) & 31 : (high >>> ((row - 6) * 5)) & 31;
  return ((rowBits >>> (4 - col)) & 1) !== 0;
}
