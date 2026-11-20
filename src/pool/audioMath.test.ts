import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWaveSloshLevel,
  mapImpulseToAudioParams,
  mapRaindropToAudioParams,
} from './audioMath';

test('mapImpulseToAudioParams separates discrete splash impacts from gentle drag wakes', () => {
  const drag = mapImpulseToAudioParams(-0.015, 0.24, 0.2);
  const drop = mapImpulseToAudioParams(-0.085, 0.44, 0.8);

  assert.equal(drag.isDiscreteImpact, false);
  assert.equal(drag.thumpGain, 0);
  assert.equal(drag.bubbleCount, 0);

  assert.equal(drop.isDiscreteImpact, true);
  assert.ok(drop.magnitude > drag.magnitude);
  assert.ok(drop.bodyGain > drag.bodyGain);
  assert.ok(drop.sprayGain > drag.sprayGain);
  assert.ok(drop.sprayStartHz > drop.sprayEndHz);
  assert.ok(drop.thumpStartHz > drop.thumpEndHz);
  assert.ok(drop.thumpGain > 0);
  assert.ok(drop.bubbleCount >= 2);
  assert.ok(drop.decaySec > drag.decaySec);
  assert.ok(drag.pan < 0 && drop.pan > 0);
});

test('mapRaindropToAudioParams produces upward Minnaert pitch chirp and stereo pan', () => {
  const dropLeft = mapRaindropToAudioParams(0.1, -0.02, 0.6, 0.25, 0.5);
  const dropRight = mapRaindropToAudioParams(0.9, -0.025, 0.9, 0.85, 0.8);

  assert.ok(dropLeft.endHz > dropLeft.startHz);
  assert.ok(dropRight.endHz > dropRight.startHz);
  assert.ok(dropLeft.pan < 0);
  assert.ok(dropRight.pan > 0);
  assert.ok(dropRight.gain >= dropLeft.gain);
  assert.ok(dropLeft.durationSec >= 0.035 && dropLeft.durationSec <= 0.1);
});

test('computeWaveSloshLevel responds to wave velocity RMS, rain toggle, and turbidity pump hum', () => {
  const calmClear = new Float32Array(64);
  const calmParams = computeWaveSloshLevel(calmClear, 0, false, 0.45, 0.05);
  assert.equal(calmParams.rainBedGain, 0);
  assert.ok(calmParams.normalizedEnergy < 0.05);

  const turbulentCloudy = new Float32Array(64).fill(0.09);
  const activeParams = computeWaveSloshLevel(
    turbulentCloudy,
    0.8,
    true,
    0.85,
    0.9,
  );
  assert.ok(activeParams.normalizedEnergy > calmParams.normalizedEnergy);
  assert.ok(activeParams.sloshGain > calmParams.sloshGain);
  assert.ok(activeParams.sloshCenterHz > calmParams.sloshCenterHz);
  assert.ok(activeParams.rainBedGain > 0);
  assert.ok(activeParams.pumpNoiseGain > calmParams.pumpNoiseGain);
  assert.ok(activeParams.pumpCutoffHz > calmParams.pumpCutoffHz);
  assert.ok(activeParams.pumpHumGain > calmParams.pumpHumGain);
  assert.ok(activeParams.pumpLfoHz > calmParams.pumpLfoHz);
});
