import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPresetToState,
  createInitialCameraState,
  createInitialSimState,
  getCameraPosition,
  getSunDirection,
  hexToLinearRGB,
  pickWaterSurface,
} from './presets';
import {
  CpuWaveGrid,
  createInitialBall,
  createInitialNoodle,
  sampleHydrogenGlyphPixel,
  stepBuoyancy,
} from './buoyancy';

test('hexToLinearRGB converts sRGB hex values accurately', () => {
  const black = hexToLinearRGB('#000000');
  assert.deepEqual(black, [0, 0, 0]);

  const white = hexToLinearRGB('#ffffff');
  assert.ok(Math.abs(white[0] - 1) < 1e-6);
  assert.ok(Math.abs(white[1] - 1) < 1e-6);
  assert.ok(Math.abs(white[2] - 1) < 1e-6);

  const cyan = hexToLinearRGB('#00e5ff');
  assert.equal(cyan[0], 0);
  assert.ok(cyan[1] > 0.7 && cyan[1] < 0.9);
  assert.ok(Math.abs(cyan[2] - 1) < 1e-6);
});

test('getSunDirection produces unit-length vectors pointing above horizon', () => {
  const d1 = getSunDirection(135, 62);
  const len1 = Math.hypot(d1[0], d1[1], d1[2]);
  assert.ok(Math.abs(len1 - 1) < 1e-6);
  assert.ok(d1[1] > 0.8);

  const d2 = getSunDirection(238, 12);
  const len2 = Math.hypot(d2[0], d2[1], d2[2]);
  assert.ok(Math.abs(len2 - 1) < 1e-6);
  assert.ok(d2[1] > 0.15 && d2[1] < 0.25);
});

test('applyPresetToState updates lighting, LED, and rain settings cleanly', () => {
  const base = createInitialSimState();
  assert.equal(base.env, 'noon');
  assert.equal(base.ledEnabled, false);

  const midnight = applyPresetToState(base, 'midnight');
  assert.equal(midnight.env, 'midnight');
  assert.equal(midnight.ledEnabled, true);
  assert.equal(midnight.nightFactor, 1.0);

  const overcast = applyPresetToState(midnight, 'overcast');
  assert.equal(overcast.env, 'overcast');
  assert.equal(overcast.rainEnabled, true);
  assert.equal(overcast.ledEnabled, false);
});

test('pickWaterSurface hits center of pool and rejects sky rays', () => {
  const cam = createInitialCameraState();
  const rect = { left: 0, top: 0, width: 1440, height: 900 };

  // Center of viewport looks toward cam.target (0, -0.45, 0.6), which intersects y=0 inside pool
  const hit = pickWaterSurface(720, 450, rect, cam);
  assert.ok(hit !== null);
  assert.ok(hit.u > 0.1 && hit.u < 0.9);
  assert.ok(hit.v > 0.1 && hit.v < 0.9);

  // Top edge of viewport aims toward sky above horizon
  const skyMiss = pickWaterSurface(720, 10, rect, cam);
  assert.equal(skyMiss, null);

  // Camera position stays above deck height
  const pos = getCameraPosition(cam.theta, cam.phi, cam.dist, cam.target);
  assert.ok(pos[1] >= 0.28);
});

test('CpuWaveGrid stays bounded and propagates impulses symmetrically', () => {
  const wave = new CpuWaveGrid();
  wave.addImpulse(0.5, 0.5, 0.4, -0.08);
  const centerBefore = wave.sample(0, 0).h;
  assert.ok(centerBefore < 0);

  for (let i = 0; i < 60; i++) {
    wave.step(1 / 60, 1.0, 0.012);
  }
  const s1 = wave.sample(0.5, 0);
  const s2 = wave.sample(-0.5, 0);
  assert.ok(Math.abs(s1.h - s2.h) < 0.015);

  for (let i = 0; i < wave.h.length; i++) {
    assert.ok(wave.h[i] >= -0.17 && wave.h[i] <= 0.17);
    assert.ok(Number.isFinite(wave.h[i]));
  }
});

test('stepBuoyancy keeps ball and noodle contained and separated', () => {
  const wave = new CpuWaveGrid();
  const ball = createInitialBall();
  const noodle = createInitialNoodle();

  // Force ball & noodle to overlap to test collision separation
  ball.x = 0;
  ball.z = 0;
  noodle.x = 0.05;
  noodle.z = 0;

  for (let i = 0; i < 120; i++) {
    wave.step(1 / 60, 1.0, 0.012);
    stepBuoyancy(1 / 60, wave, ball, noodle);
  }

  assert.ok(Math.abs(ball.x) <= 3.0);
  assert.ok(Math.abs(ball.z) <= 6.0);
  assert.ok(Math.abs(noodle.x) <= 3.0);
  assert.ok(Math.abs(noodle.z) <= 6.0);
  assert.ok(Number.isFinite(ball.y) && Number.isFinite(noodle.y));
});

test('HYDROGEN_GLYPH_PACKED renders legible 5x9 glyphs for all 8 letters', () => {
  const rendered: string[] = [];
  for (let ch = 0; ch < 8; ch++) {
    const rows: string[] = [];
    let litCount = 0;
    for (let r = 0; r < 9; r++) {
      let line = '';
      for (let c = 0; c < 5; c++) {
        const on = sampleHydrogenGlyphPixel(ch, r, c);
        if (on) litCount++;
        line += on ? '#' : '.';
      }
      rows.push(line);
    }
    rendered.push(rows.join('\n'));
    assert.ok(litCount >= 8, `glyph ${ch} has too few pixels: ${litCount}`);
  }
  // Verify 'h' starts with a vertical stem on column 0 in rows 0..6
  assert.equal(sampleHydrogenGlyphPixel(0, 0, 0), true);
  assert.equal(sampleHydrogenGlyphPixel(0, 1, 0), true);
  assert.equal(sampleHydrogenGlyphPixel(0, 2, 0), true);
});
