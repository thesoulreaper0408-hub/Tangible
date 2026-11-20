export const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const WATER_IMPULSE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uWaterTex;
uniform vec2 uTexelSize;

// Up to 10 queued impulses per frame: (uv.x, uv.y, radiusMeters, strength)
uniform vec4 uImpulses[10];
uniform int uImpulseCount;

// Dynamic buoyant objects 2-way wake coupling
uniform vec4 uBallState; // worldX, worldZ, radius, verticalVel
uniform vec2 uBallVelXZ;
uniform vec4 uNoodleA;   // x, z, radius, avgVy
uniform vec3 uNoodleB;   // x, z, speedXZ
uniform float uTime;
uniform float uRainActive;

void main() {
  vec4 state = texture(uWaterTex, vUv);
  float h = state.r;
  float v = state.g;
  float energy = state.b;

  for (int i = 0; i < 10; i++) {
    if (i >= uImpulseCount) break;
    vec4 imp = uImpulses[i];
    vec2 diff = (vUv - imp.xy) * vec2(6.0, 12.0);
    float d = length(diff);
    float r = imp.z;
    if (d < r) {
      float falloff = cos((d / r) * 1.5707963);
      falloff = falloff * falloff;
      h += imp.w * falloff;
      energy = min(1.0, energy + abs(imp.w) * 4.0 * falloff);
    }
  }

  vec2 worldXZ = vec2(mix(-3.0, 3.0, vUv.x), mix(-6.0, 6.0, vUv.y));

  // Subtle pool circulation return-jet micro-ripples on right wall
  float dJet1 = length(worldXZ - vec2(2.85, -1.8));
  if (dJet1 < 0.35) {
    float jet = sin(uTime * 5.2 - dJet1 * 22.0) * exp(-dJet1 * 8.0) * 0.00018;
    v += jet;
  }

  // Beach ball 2-way displacement wake
  float ballDist = length(worldXZ - uBallState.xy);
  float ballR = uBallState.z;
  if (ballDist < ballR * 1.35) {
    float ring = exp(-pow((ballDist - ballR * 0.65) / (ballR * 0.45), 2.0));
    v -= uBallState.w * 0.055 * ring;
    float spd = length(uBallVelXZ);
    if (spd > 0.02) {
      vec2 dir = normalize(uBallVelXZ);
      float bow = dot(normalize(worldXZ - uBallState.xy + 1e-5), dir);
      v += bow * spd * 0.045 * ring;
    }
  }

  // Foam noodle 2-way wake along capsule segment
  vec2 ab = uNoodleB.xy - uNoodleA.xy;
  float abLen2 = max(dot(ab, ab), 1e-5);
  float proj = clamp(dot(worldXZ - uNoodleA.xy, ab) / abLen2, 0.0, 1.0);
  vec2 closest = uNoodleA.xy + ab * proj;
  float nDist = length(worldXZ - closest);
  if (nDist < uNoodleA.z * 2.2) {
    float nProfile = exp(-pow(nDist / (uNoodleA.z * 1.15), 2.0));
    v -= uNoodleA.w * 0.045 * nProfile;
    v += uNoodleB.z * 0.02 * sin(nDist * 35.0) * nProfile;
  }

  h = clamp(h, -0.17, 0.17);
  v = clamp(v, -1.8, 1.8);
  fragColor = vec4(h, v, energy * 0.992, 1.0);
}`;

export const WATER_UPDATE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uWaterTex;
uniform vec2 uTexelSize;
uniform float uWaveSpeed;
uniform float uDamping;
uniform float uTension;
uniform float uSubDt;

float getPoolDepth(vec2 worldXZ) {
  float t = smoothstep(-2.0, 2.0, worldXZ.y);
  float baseFloor = mix(-1.05, -2.45, t);
  if (worldXZ.x < -0.60 && worldXZ.y < -4.50) {
    if (worldXZ.y < -5.50) baseFloor = -0.22;
    else if (worldXZ.y < -5.00) baseFloor = -0.50;
    else baseFloor = -0.78;
  }
  return max(0.18, -baseFloor);
}

float sampleH(vec2 uv) {
  return texture(uWaterTex, clamp(uv, uTexelSize * 0.5, 1.0 - uTexelSize * 0.5)).r;
}

float laplacian9(vec2 uv, vec2 dx, vec2 dy) {
  float c  = sampleH(uv);
  float n  = sampleH(uv + dy);
  float s  = sampleH(uv - dy);
  float e  = sampleH(uv + dx);
  float w  = sampleH(uv - dx);
  float ne = sampleH(uv + dx + dy);
  float nw = sampleH(uv - dx + dy);
  float se = sampleH(uv + dx - dy);
  float sw = sampleH(uv - dx - dy);
  return (4.0 * (n + s + e + w) + (ne + nw + se + sw) - 20.0 * c) / 6.0;
}

void main() {
  vec4 state = texture(uWaterTex, vUv);
  float h = state.r;
  float v = state.g;
  float energy = state.b;

  vec2 dx = vec2(uTexelSize.x, 0.0);
  vec2 dy = vec2(0.0, uTexelSize.y);

  float lap = laplacian9(vUv, dx, dy);

  float hN  = sampleH(vUv + dy);
  float hS  = sampleH(vUv - dy);
  float hE  = sampleH(vUv + dx);
  float hW  = sampleH(vUv - dx);
  float hNE = sampleH(vUv + dx + dy);
  float hNW = sampleH(vUv - dx + dy);
  float hSE = sampleH(vUv + dx - dy);
  float hSW = sampleH(vUv - dx - dy);
  float hN2 = sampleH(vUv + 2.0 * dy);
  float hS2 = sampleH(vUv - 2.0 * dy);
  float hE2 = sampleH(vUv + 2.0 * dx);
  float hW2 = sampleH(vUv - 2.0 * dx);
  float biharm = 20.0 * h - 8.0 * (hN + hS + hE + hW) + 2.0 * (hNE + hNW + hSE + hSW) + (hN2 + hS2 + hE2 + hW2);

  vec2 worldXZ = vec2(mix(-3.0, 3.0, vUv.x), mix(-6.0, 6.0, vUv.y));
  float depth = getPoolDepth(worldXZ);
  float depthFactor = mix(0.72, 1.05, smoothstep(0.2, 1.8, depth));

  float cGrid = clamp(uWaveSpeed * 0.36 * depthFactor, 0.05, 0.52);
  float c2 = cGrid * cGrid * 3600.0;
  float gamma = uTension * 0.014 * 3600.0;

  float accel = c2 * lap - gamma * biharm;
  v += accel * uSubDt;

  float edgeDist = min(min(vUv.x, 1.0 - vUv.x) * 256.0, min(vUv.y, 1.0 - vUv.y) * 512.0);
  float edgeDamp = mix(0.06, 0.0, smoothstep(0.0, 3.0, edgeDist));
  float dampFactor = exp(-(uDamping * 14.0 + edgeDamp * 18.0) * uSubDt);
  v *= dampFactor;

  h += v * uSubDt;
  h *= 0.99992;

  h = clamp(h, -0.17, 0.17);
  v = clamp(v, -1.8, 1.8);
  fragColor = vec4(h, v, energy, 1.0);
}`;

export const WATER_NORMAL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uWaterTex;
uniform vec2 uTexelSize;

const float METERS_PER_TEXEL = 6.0 / 256.0;

float getH(vec2 uv) {
  return texture(uWaterTex, clamp(uv, uTexelSize * 0.5, 1.0 - uTexelSize * 0.5)).r;
}

void main() {
  float hC = getH(vUv);
  vec2 dx = vec2(uTexelSize.x, 0.0);
  vec2 dy = vec2(0.0, uTexelSize.y);

  float hL  = getH(vUv - dx);
  float hR  = getH(vUv + dx);
  float hD  = getH(vUv - dy);
  float hU  = getH(vUv + dy);
  float hLD = getH(vUv - dx - dy);
  float hRD = getH(vUv + dx - dy);
  float hLU = getH(vUv - dx + dy);
  float hRU = getH(vUv + dx + dy);

  float dhdx = ((hR - hL) * 2.0 + (hRU - hLU) + (hRD - hLD)) / (8.0 * METERS_PER_TEXEL);
  float dhdz = ((hU - hD) * 2.0 + (hLU - hLD) + (hRU - hRD)) / (8.0 * METERS_PER_TEXEL);

  dhdx = clamp(dhdx, -1.35, 1.35);
  dhdz = clamp(dhdz, -1.35, 1.35);

  vec3 n = normalize(vec3(-dhdx, 1.0, -dhdz));
  fragColor = vec4(n, hC);
}`;

const POOL_COMMON_GLSL = `
const float POOL_HX = 3.0;
const float POOL_HZ = 6.0;
const float CAUSTIC_BX = 5.65;
const float CAUSTIC_BZ = 8.65;

float floorY(float z) {
  float t = smoothstep(-2.0, 2.0, z);
  return mix(-1.05, -2.45, t);
}

float floorSlopeZ(float z) {
  if (z <= -2.0 || z >= 2.0) return 0.0;
  float u = (z + 2.0) * 0.25;
  return -1.40 * (6.0 * u * (1.0 - u)) * 0.25;
}

float poolFloorAndStepsY(vec2 xz) {
  float fy = floorY(xz.y);
  if (xz.x < -0.60 && xz.y < -4.50) {
    if (xz.y < -5.50) return max(fy, -0.22);
    if (xz.y < -5.00) return max(fy, -0.50);
    return max(fy, -0.78);
  }
  return fy;
}

vec2 worldToCausticUV(vec3 p) {
  float baseY = poolFloorAndStepsY(p.xz);
  float wallH = max(0.0, p.y - baseY);
  vec2 atlas;
  if (abs(p.x) >= 2.985 && abs(p.z) < 5.985) {
    atlas = vec2(p.x + sign(p.x) * wallH, p.z);
  } else if (abs(p.z) >= 5.985 && abs(p.x) < 2.985) {
    atlas = vec2(p.x, p.z + sign(p.z) * wallH);
  } else if (abs(p.x) >= 2.985 && abs(p.z) >= 5.985) {
    if (abs(p.x) - 3.0 > abs(p.z) - 6.0) {
      atlas = vec2(p.x + sign(p.x) * wallH, p.z);
    } else {
      atlas = vec2(p.x, p.z + sign(p.z) * wallH);
    }
  } else {
    atlas = p.xz;
  }
  return atlas / vec2(CAUSTIC_BX * 2.0, CAUSTIC_BZ * 2.0) + 0.5;
}
`;

export const CAUSTICS_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aGridUV;

uniform sampler2D uNormalTex;
uniform vec3 uSunDir;
uniform float uIOR;
uniform float uDispersion;
uniform vec4 uBallPos;
uniform vec3 uNoodleA;
uniform vec3 uNoodleB;
uniform float uNoodleR;

out vec3 vOldPos;
out vec3 vNewPos;
out vec2 vFaceFlag;
out vec2 vAtlasWorld;
out float vLitMask;
out float vInstance;

${POOL_COMMON_GLSL}

float waterSurfaceShadow(vec3 w) {
  vec3 sd = normalize(uSunDir);
  if (sd.y <= 0.02) return 0.0;

  float lit = 1.0;
  float tCoping = (0.205 - w.y) / sd.y;
  if (tCoping > 0.0) {
    vec3 pc = w + tCoping * sd;
    if (abs(pc.x) > 2.975 || abs(pc.z) > 5.975) {
      float pen = max(abs(pc.x) - 2.975, abs(pc.z) - 5.975);
      lit *= (1.0 - smoothstep(0.0, 0.06, pen));
    }
  }

  float tBoard = (0.68 - w.y) / sd.y;
  if (tBoard > 0.0) {
    vec3 pb = w + tBoard * sd;
    if (abs(pb.x) < 0.28 && pb.z > 4.82 && pb.z < 7.55) {
      float dx = 0.28 - abs(pb.x);
      float dz = pb.z - 4.82;
      float soft = smoothstep(0.0, 0.06, min(dx, dz));
      lit *= (1.0 - soft * 0.92);
    }
  }

  vec3 oc = w - uBallPos.xyz;
  float b = dot(oc, sd);
  float c = dot(oc, oc) - uBallPos.w * uBallPos.w;
  float disc = b * b - c;
  if (disc > 0.0 && b < 0.0) {
    float edge = sqrt(disc) / uBallPos.w;
    lit *= (1.0 - smoothstep(0.0, 0.35, edge) * 0.88);
  }

  vec3 u = sd;
  vec3 v = uNoodleB - uNoodleA;
  vec3 w0 = w - uNoodleA;
  float a = dot(u, u);
  float b2 = dot(u, v);
  float c2 = dot(v, v);
  float d = dot(u, w0);
  float e = dot(v, w0);
  float denom = max(a * c2 - b2 * b2, 1e-5);
  float tc = clamp((a * e - b2 * d) / denom, 0.0, 1.0);
  float sc = max(0.0, (b2 * tc - d) / a);
  vec3 dp = w0 + sc * u - tc * v;
  float nd = length(dp);
  if (nd < uNoodleR * 1.15) {
    lit *= (1.0 - smoothstep(uNoodleR * 1.15, uNoodleR * 0.3, nd) * 0.85);
  }

  return clamp(lit, 0.0, 1.0);
}

void main() {
  vec4 normH = texture(uNormalTex, aGridUV);
  vec3 N = normalize(normH.rgb);
  float h = normH.a;

  vec3 W = vec3(
    mix(-POOL_HX, POOL_HX, aGridUV.x),
    h,
    mix(-POOL_HZ, POOL_HZ, aGridUV.y)
  );

  float dispShift = float(gl_InstanceID - 1) * uDispersion * 0.032;
  float iorC = max(1.03, uIOR + dispShift);

  vec3 sun = normalize(uSunDir);
  vec3 refr = refract(-sun, N, 1.0 / iorC);
  if (dot(refr, refr) < 0.01) refr = vec3(0.0, -1.0, 0.0);
  refr.y = min(refr.y, -0.06);
  refr = normalize(refr);

  float tx = refr.x > 1e-5 ? (POOL_HX - W.x) / refr.x : (refr.x < -1e-5 ? (-POOL_HX - W.x) / refr.x : 1e6);
  float tz = refr.z > 1e-5 ? (POOL_HZ - W.z) / refr.z : (refr.z < -1e-5 ? (-POOL_HZ - W.z) / refr.z : 1e6);
  float tWall = max(0.001, min(tx, tz));

  bool hitFloor = false;
  float tLo = 0.0;
  float tHi = tWall;

  for (int i = 1; i <= 7; i++) {
    float tSample = tWall * (float(i) / 7.0);
    vec3 ps = W + refr * tSample;
    if (ps.y <= poolFloorAndStepsY(ps.xz)) {
      tLo = tWall * (float(i - 1) / 7.0);
      tHi = tSample;
      hitFloor = true;
      break;
    }
  }

  vec3 hit;
  vec2 faceFlag = vec2(0.0);
  vec2 atlas;

  if (hitFloor) {
    for (int i = 0; i < 6; i++) {
      float tMid = 0.5 * (tLo + tHi);
      vec3 pm = W + refr * tMid;
      if (pm.y <= poolFloorAndStepsY(pm.xz)) {
        tHi = tMid;
      } else {
        tLo = tMid;
      }
    }
    hit = W + refr * 0.5 * (tLo + tHi);
    atlas = hit.xz;
  } else {
    hit = W + refr * tWall;
    float baseY = poolFloorAndStepsY(hit.xz);
    float wallH = max(0.0, hit.y - baseY);
    if (tx <= tz) {
      faceFlag = vec2(1.0, 0.0);
      float sgn = refr.x >= 0.0 ? 1.0 : -1.0;
      hit.x = sgn * POOL_HX;
      atlas = vec2(hit.x + sgn * wallH, hit.z);
    } else {
      faceFlag = vec2(0.0, 1.0);
      float sgn = refr.z >= 0.0 ? 1.0 : -1.0;
      hit.z = sgn * POOL_HZ;
      atlas = vec2(hit.x, hit.z + sgn * wallH);
    }
  }

  vOldPos = W - dot(W, sun) * sun;
  vNewPos = hit;
  vFaceFlag = faceFlag;
  vAtlasWorld = atlas;
  vLitMask = waterSurfaceShadow(W);
  vInstance = float(gl_InstanceID);

  vec2 ndc = atlas / vec2(CAUSTIC_BX, CAUSTIC_BZ);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const CAUSTICS_FRAG = `#version 300 es
precision highp float;
in vec3 vOldPos;
in vec3 vNewPos;
in vec2 vFaceFlag;
in vec2 vAtlasWorld;
in float vLitMask;
in float vInstance;

out vec4 fragColor;

void main() {
  if (abs(vAtlasWorld.x) > 3.004 && abs(vAtlasWorld.y) > 6.004) discard;
  if (vFaceFlag.x > 0.02 && vFaceFlag.y > 0.02) discard;

  float oldArea = length(cross(dFdx(vOldPos), dFdy(vOldPos)));
  float newArea = length(cross(dFdx(vNewPos), dFdy(vNewPos)));
  float focus = clamp(oldArea / max(newArea, 1e-6), 0.0, 11.0);

  vec3 mask = vInstance < 0.5
    ? vec3(1.0, 0.0, 0.0)
    : (vInstance < 1.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));

  fragColor = vec4(mask * focus * vLitMask, 1.0);
}`;

export const POOL_MAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uNormalTex;
uniform sampler2D uCausticsTex;

uniform vec2 uResolution;
uniform float uTime;
uniform float uQuality;

// Camera
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFov;

// Environment & Lighting
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDirectScale;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uAmbientColor;
uniform float uCloudCover;
uniform float uNightFactor;

// Optics
uniform float uIOR;
uniform float uDispersion;
uniform float uCausticSharpness;
uniform float uCausticBrightness;
uniform float uTurbidity;
uniform float uAbsorptionScale;

// Underwater LEDs
uniform float uLedEnabled;
uniform vec3 uLedColor;

// Tile Palette (0: Cyan, 1: Cobalt, 2: Resort White, 3: Dark Slate)
uniform int uTilePalette;

// Buoyant Objects
uniform vec4 uBallPos; // xyz, r
uniform mat3 uBallRot;
uniform vec3 uNoodleA;
uniform vec3 uNoodleB;
uniform float uNoodleR;

${POOL_COMMON_GLSL}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise2D(p);
    p = m * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

vec3 sampleSky(vec3 rd) {
  float y = max(rd.y, 0.0);
  float horizonGrad = pow(1.0 - y, 2.8);
  vec3 sky = mix(uSkyZenith, uSkyHorizon, horizonGrad);

  vec3 sun = normalize(uSunDir);
  float cosT = max(dot(rd, sun), 0.0);
  float mie = pow(cosT, 6.0) * 0.35 + pow(cosT, 48.0) * 0.65;
  sky += uSunColor * mie * (0.28 + 0.5 * uSunDirectScale);

  float disk = smoothstep(0.99935, 0.99978, dot(rd, sun));
  sky += uSunColor * disk * (uNightFactor > 0.5 ? 6.0 : 12.0);

  if (uNightFactor > 0.05 && rd.y > 0.02) {
    vec2 starUV = rd.xz / (rd.y + 0.35) * 110.0;
    vec2 cell = floor(starUV);
    vec2 f = fract(starUV) - 0.5;
    float rnd = hash12(cell);
    if (rnd > 0.978) {
      float d = length(f - (hash22(cell) - 0.5) * 0.5);
      float twinkle = 0.65 + 0.35 * sin(uTime * (2.0 + rnd * 4.0) + rnd * 60.0);
      float star = smoothstep(0.14, 0.01, d) * twinkle * smoothstep(0.02, 0.25, rd.y);
      sky += vec3(0.8, 0.9, 1.0) * star * uNightFactor * 1.6;
    }
  }

  if (rd.y > 0.015) {
    vec2 cloudUV = rd.xz / (rd.y + 0.14) * 0.85 + vec2(uTime * 0.008, uTime * 0.003);
    float n = fbm(cloudUV * 1.4);
    float cover = mix(0.62, 0.22, uCloudCover);
    float cloud = smoothstep(cover, cover + 0.28, n) * smoothstep(0.015, 0.22, rd.y);
    vec3 cloudLit = mix(uSkyHorizon * 0.95 + uAmbientColor * 0.5, uSunColor * 0.45 + vec3(0.92), 0.55 + 0.45 * pow(cosT, 2.0));
    cloudLit = mix(cloudLit, uSkyZenith * 1.4 + uSkyHorizon * 0.4, uNightFactor * 0.85);
    sky = mix(sky, cloudLit, cloud * mix(0.55, 0.90, uCloudCover));
  }

  if (rd.y < 0.0) {
    sky = mix(uSkyHorizon, uSkyHorizon * 0.55, clamp(-rd.y * 4.0, 0.0, 1.0));
  }
  return sky;
}

// Verified 5x9 lowercase glyphs spelling "hydrogen"
bool sampleHydrogenPixel(int ch, int row, int col) {
  if (row < 0 || row > 8 || col < 0 || col > 4) return false;
  uvec2 g = uvec2(0u);
  if (ch == 0)      g = uvec2(0x2318fa10u, 0x0011u); // h
  else if (ch == 1) g = uvec2(0x1f18c400u, 0x3a21u); // y
  else if (ch == 2) g = uvec2(0x2318bc21u, 0x000fu); // d
  else if (ch == 3) g = uvec2(0x210cd800u, 0x0010u); // r
  else if (ch == 4) g = uvec2(0x2318b800u, 0x000eu); // o
  else if (ch == 5) g = uvec2(0x1f18bc00u, 0x3a21u); // g
  else if (ch == 6) g = uvec2(0x21f8b800u, 0x000fu); // e
  else if (ch == 7) g = uvec2(0x2318f800u, 0x0011u); // n

  uint rowBits = (row < 6)
    ? ((g.x >> uint(row * 5)) & 31u)
    : ((g.y >> uint((row - 6) * 5)) & 31u);
  return ((rowBits >> uint(4 - col)) & 1u) != 0u;
}

float sdBox2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

vec3 toBoardSpace(vec3 p) {
  vec3 q = p - vec3(0.0, 0.625, 6.15);
  const float c = 0.99844;
  const float s = 0.05582;
  return vec3(q.x, q.y * c + q.z * s, -q.y * s + q.z * c);
}

float sdLadderChrome(vec3 p) {
  vec3 q = vec3(p.x, p.y, abs(p.z - 3.60) - 0.27);
  float d = 1e6;

  d = min(d, sdCapsule(q, vec3(-3.45, 0.18, 0.0), vec3(-3.45, 0.56, 0.0), 0.022));
  d = min(d, sdCapsule(q, vec3(-2.87, -1.35, 0.0), vec3(-2.87, 0.56, 0.0), 0.022));
  if (q.y >= 0.56) {
    float arch = length(vec2(length(q.xy - vec2(-3.16, 0.56)) - 0.29, q.z)) - 0.022;
    d = min(d, arch);
  }
  d = min(d, max(length(q.xz - vec2(-3.45, 0.0)) - 0.062, abs(q.y - 0.195) - 0.014) - 0.004);
  d = min(d, sdCapsule(q, vec3(-2.87, -1.35, 0.0), vec3(-2.98, -1.35, 0.0), 0.020));

  for (int i = 0; i < 3; i++) {
    float ry = -0.22 - float(i) * 0.35;
    d = min(d, sdRoundBox(p - vec3(-2.87, ry, 3.60), vec3(0.036, 0.008, 0.255), 0.008));
  }
  return d;
}

float sdLadderTreads(vec3 p) {
  float d = 1e6;
  for (int i = 0; i < 3; i++) {
    float ry = -0.22 - float(i) * 0.35;
    d = min(d, sdRoundBox(p - vec3(-2.87, ry + 0.011, 3.60), vec3(0.028, 0.004, 0.22), 0.004));
  }
  vec3 q = vec3(p.x, p.y, abs(p.z - 3.60) - 0.27);
  d = min(d, sdCapsule(q, vec3(-2.97, -1.35, 0.0), vec3(-3.005, -1.35, 0.0), 0.024));
  return d;
}

float sdDivingBoard(vec3 p, out int subMat) {
  subMat = 4;
  float dBase = sdRoundBox(p - vec3(0.0, 0.36, 6.90), vec3(0.20, 0.18, 0.50), 0.028);
  vec3 bp = toBoardSpace(p);
  float dPlank = sdRoundBox(bp, vec3(0.24, 0.016, 1.30), 0.014);
  float dBoard = min(dBase, dPlank);

  vec3 rq = vec3(abs(p.x) - 0.275, p.y, p.z);
  float dRails = sdCapsule(rq, vec3(0.0, 0.18, 7.52), vec3(0.0, 0.86, 7.52), 0.018);
  dRails = min(dRails, sdCapsule(rq, vec3(0.0, 0.18, 6.38), vec3(0.0, 0.86, 6.38), 0.018));
  dRails = min(dRails, sdCapsule(rq, vec3(0.0, 0.86, 6.35), vec3(0.0, 0.86, 7.55), 0.020));

  if (dRails < dBoard) {
    subMat = 3;
    return dRails;
  }
  return dBoard;
}

float sdLedFixtures(vec3 p) {
  float d1 = length(vec3(p.x - 3.005, p.y + 0.72, p.z + 1.6)) - 0.11;
  d1 = max(d1, abs(p.x - 3.005) - 0.018);
  float d2 = length(vec3(p.x - 3.005, p.y + 0.86, p.z - 2.4)) - 0.11;
  d2 = max(d2, abs(p.x - 3.005) - 0.018);
  float d3 = length(vec3(p.x, p.y + 0.96, p.z - 6.005)) - 0.12;
  d3 = max(d3, abs(p.z - 6.005) - 0.018);
  return min(d1, min(d2, d3));
}

float mapScene(vec3 p, out int matID) {
  float fy = floorY(p.z);
  float slope = floorSlopeZ(p.z);
  float dAboveFloor = (p.y - fy) / sqrt(1.0 + slope * slope);
  float dHoleXZ = sdBox2(p.xz, vec2(POOL_HX, POOL_HZ));
  float dCavity = max(dHoleXZ, -dAboveFloor);
  float dDeckBox = sdBox(p - vec3(0.0, -1.21, 0.0), vec3(12.0, 1.39, 15.0));
  float dBasin = max(dDeckBox, -dCavity);

  float dStep1 = sdRoundBox(p - vec3(-1.80, -0.64, -5.75), vec3(1.18, 0.40, 0.23), 0.020);
  float dStep2 = sdRoundBox(p - vec3(-1.80, -0.78, -5.25), vec3(1.18, 0.26, 0.23), 0.020);
  float dStep3 = sdRoundBox(p - vec3(-1.80, -0.92, -4.75), vec3(1.18, 0.12, 0.23), 0.020);
  float dSteps = min(dStep1, min(dStep2, dStep3));
  float dPoolInterior = min(dBasin, dSteps);

  float ring = abs(sdBox2(p.xz, vec2(3.155, 6.155))) - 0.180;
  float dCoping = length(max(vec2(ring, abs(p.y - 0.162) - 0.022), 0.0))
                + min(max(ring, abs(p.y - 0.162) - 0.022), 0.0) - 0.021;

  float dMin = dPoolInterior;
  if (p.y > 0.115 && dHoleXZ > -0.028) {
    matID = 2;
  } else {
    matID = 1;
  }
  if (dCoping < dMin) {
    dMin = dCoping;
    matID = 2;
  }

  if (p.x < -2.4 && p.z > 2.9 && p.z < 4.3 && p.y < 1.0) {
    float dL = sdLadderChrome(p);
    if (dL < dMin) { dMin = dL; matID = 3; }
    float dT = sdLadderTreads(p);
    if (dT < dMin) { dMin = dT; matID = 5; }
  }

  if (abs(p.x) < 0.7 && p.z > 4.4 && p.z < 8.0 && p.y > 0.05 && p.y < 1.1) {
    int bMat;
    float dB = sdDivingBoard(p, bMat);
    if (dB < dMin) { dMin = dB; matID = bMat; }
  }

  float dLed = sdLedFixtures(p);
  if (dLed < dMin) { dMin = dLed; matID = 8; }

  float dBall = length(p - uBallPos.xyz) - uBallPos.w;
  if (dBall < dMin) { dMin = dBall; matID = 6; }

  float dNoodle = sdCapsule(p, uNoodleA, uNoodleB, uNoodleR);
  if (dNoodle < dMin) { dMin = dNoodle; matID = 7; }

  return dMin;
}

float mapDist(vec3 p) {
  int dummy;
  return mapScene(p, dummy);
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0018, 0.0);
  return normalize(vec3(
    mapDist(p + e.xyy) - mapDist(p - e.xyy),
    mapDist(p + e.yxy) - mapDist(p - e.yxy),
    mapDist(p + e.yyx) - mapDist(p - e.yyx)
  ));
}

float calcAO(vec3 pos, vec3 nor) {
  float occ = 0.0;
  float sca = 1.0;
  int steps = uQuality > 0.8 ? 5 : 3;
  for (int i = 0; i < 5; i++) {
    if (i >= steps) break;
    float h = 0.025 + 0.14 * float(i) / float(steps - 1);
    float d = mapDist(pos + h * nor);
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.1 * occ, 0.18, 1.0);
}

float calcSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float res = 1.0;
  float t = mint;
  int steps = uQuality > 0.8 ? 28 : 16;
  for (int i = 0; i < 28; i++) {
    if (i >= steps) break;
    float h = mapDist(ro + rd * t);
    if (h < 0.0015) return 0.0;
    res = min(res, k * h / t);
    t += clamp(h, 0.02, 0.35);
    if (t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

void getTileMaterial(vec3 p, vec3 n, out vec3 albedo, out float roughness, out vec3 bumpN) {
  vec3 baseTile, altTile, groutCol, trimCol, inlayBg, inlayText;
  if (uTilePalette == 0) {
    baseTile  = vec3(0.42, 0.80, 0.90);
    altTile   = vec3(0.32, 0.72, 0.85);
    groutCol  = vec3(0.84, 0.90, 0.93);
    trimCol   = vec3(0.06, 0.28, 0.56);
    inlayBg   = vec3(0.85, 0.94, 0.98);
    inlayText = vec3(0.05, 0.20, 0.50);
  } else if (uTilePalette == 1) {
    baseTile  = vec3(0.11, 0.34, 0.74);
    altTile   = vec3(0.15, 0.42, 0.82);
    groutCol  = vec3(0.76, 0.82, 0.89);
    trimCol   = vec3(0.86, 0.78, 0.54);
    inlayBg   = vec3(0.05, 0.15, 0.40);
    inlayText = vec3(0.95, 0.92, 0.80);
  } else if (uTilePalette == 2) {
    baseTile  = vec3(0.91, 0.94, 0.95);
    altTile   = vec3(0.86, 0.91, 0.93);
    groutCol  = vec3(0.75, 0.80, 0.83);
    trimCol   = vec3(0.14, 0.46, 0.54);
    inlayBg   = vec3(0.94, 0.97, 0.98);
    inlayText = vec3(0.04, 0.38, 0.48);
  } else {
    baseTile  = vec3(0.09, 0.11, 0.14);
    altTile   = vec3(0.12, 0.15, 0.19);
    groutCol  = vec3(0.04, 0.05, 0.07);
    trimCol   = vec3(0.18, 0.24, 0.30);
    inlayBg   = vec3(0.06, 0.08, 0.11);
    inlayText = vec3(0.20, 0.85, 0.92);
  }

  vec2 tileCoord;
  vec3 absN = abs(n);
  if (absN.y >= absN.x && absN.y >= absN.z) {
    tileCoord = p.xz;
  } else if (absN.x >= absN.z) {
    tileCoord = vec2(p.z, p.y);
  } else {
    tileCoord = vec2(p.x, p.y);
  }

  float tileSize = 0.20;
  float groutWidth = 0.055;

  bool inMosaic = (absN.y > 0.85) && (abs(p.x) < 1.60) && (p.z > 3.40 && p.z < 4.20);
  if (inMosaic) {
    tileSize = 0.05;
    groutWidth = 0.10;
  }

  vec2 grid = tileCoord / tileSize;
  vec2 cell = floor(grid);
  vec2 f = fract(grid);

  vec2 edge = min(f, 1.0 - f);
  float edgeDist = min(edge.x, edge.y);
  float groutMask = 1.0 - smoothstep(groutWidth * 0.5, groutWidth, edgeDist);

  vec2 rnd = hash22(cell + absN.xy * 13.0);
  vec3 tileCol = mix(baseTile, altTile, rnd.x) * (0.94 + 0.12 * rnd.y);

  if (absN.y < 0.35 && p.y > -0.04 && p.y < 0.125) {
    tileCol = mix(trimCol, tileCol, 0.15) * (0.92 + 0.15 * rnd.x);
  }

  if (p.x < -0.58 && p.z < -4.45 && p.y > -1.00) {
    float stepEdge = min(min(abs(p.z + 5.50), abs(p.z + 5.00)), abs(p.z + 4.50));
    if (stepEdge < 0.048 && absN.y > 0.5) {
      tileCol = trimCol * (0.94 + 0.10 * rnd.x);
    }
  }

  if (inMosaic) {
    int mx = int(floor((p.x + 1.60) / 0.05));
    int mz = int(floor((p.z - 3.40) / 0.05));
    bool isBorder = ((mx == 1 || mx == 62) && (mz >= 1 && mz <= 14))
                 || ((mz == 1 || mz == 14) && (mx >= 1 && mx <= 62));
    bool isLetter = false;
    if (mx >= 5 && mx <= 58 && mz >= 3 && mz <= 11) {
      int lx = mx - 5;
      int ch = lx / 7;
      int col = lx - ch * 7;
      int row = mz - 3;
      if (col < 5 && ch >= 0 && ch < 8) {
        isLetter = sampleHydrogenPixel(ch, row, col);
      }
    }
    if (isLetter) {
      tileCol = inlayText * (0.93 + 0.14 * rnd.y);
    } else if (isBorder) {
      tileCol = trimCol * (0.92 + 0.14 * rnd.x);
    } else {
      tileCol = inlayBg * (0.95 + 0.09 * rnd.y);
    }
  }

  albedo = mix(tileCol, groutCol, groutMask);
  roughness = mix(0.11, 0.85, groutMask);

  vec2 grad = vec2(0.0);
  if (edge.x < groutWidth * 1.6) grad.x = (f.x < 0.5 ? -1.0 : 1.0) * (1.0 - edge.x / (groutWidth * 1.6));
  if (edge.y < groutWidth * 1.6) grad.y = (f.y < 0.5 ? -1.0 : 1.0) * (1.0 - edge.y / (groutWidth * 1.6));
  grad += (rnd - 0.5) * 0.04;

  vec3 t1 = (absN.y >= absN.x && absN.y >= absN.z) ? vec3(1.0, 0.0, 0.0) : ((absN.x >= absN.z) ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
  vec3 t2 = normalize(cross(n, t1));
  t1 = cross(t2, n);
  bumpN = normalize(n + (t1 * grad.x + t2 * grad.y) * 0.18);
}

void getSolidMaterial(vec3 p, vec3 n, int matID, out vec3 albedo, out float roughness, out float metallic, out vec3 bumpN) {
  bumpN = n;
  metallic = 0.0;
  roughness = 0.5;
  albedo = vec3(0.8);

  if (matID == 1) {
    getTileMaterial(p, n, albedo, roughness, bumpN);
  } else if (matID == 2) {
    bool isCoping = abs(sdBox2(p.xz, vec2(3.155, 6.155))) < 0.185;
    vec2 uv = p.xz * (isCoping ? 2.8 : 1.15);
    vec2 cell = floor(uv);
    vec2 f = fract(uv);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float seam = 1.0 - smoothstep(0.010, 0.024, edge);
    float grain = fbm(p.xz * 7.5 + hash22(cell) * 10.0);
    vec3 stone = mix(vec3(0.76, 0.72, 0.65), vec3(0.86, 0.82, 0.75), grain);
    stone *= (0.94 + 0.10 * hash12(cell));
    if (isCoping) stone *= 1.05;
    albedo = mix(stone, vec3(0.45, 0.42, 0.38), seam);
    roughness = mix(0.68, 0.92, seam) - 0.12 * grain;
    float dGrain = fbm(p.xz * 18.0);
    bumpN = normalize(n + vec3(dGrain - 0.5, 0.0, grain - 0.5) * 0.06);
  } else if (matID == 3) {
    albedo = vec3(0.88, 0.91, 0.94);
    roughness = 0.06;
    metallic = 1.0;
  } else if (matID == 4) {
    vec3 bp = toBoardSpace(p);
    bool isTopGrip = (bp.y > 0.022 && abs(bp.x) < 0.21 && bp.z < 1.24 && bp.z > -1.24);
    if (isTopGrip) {
      float rib = sin(bp.z * 110.0) * 0.5 + 0.5;
      albedo = mix(vec3(0.18, 0.34, 0.52), vec3(0.24, 0.42, 0.62), rib);
      roughness = 0.82;
    } else {
      albedo = vec3(0.92, 0.94, 0.96);
      roughness = 0.24;
    }
  } else if (matID == 5) {
    float grip = sin(p.z * 160.0) * 0.5 + 0.5;
    albedo = mix(vec3(0.06, 0.07, 0.08), vec3(0.11, 0.12, 0.14), grip);
    roughness = 0.78;
  } else if (matID == 6) {
    vec3 lp = transpose(uBallRot) * normalize(p - uBallPos.xyz);
    float polar = abs(lp.y);
    if (polar > 0.87) {
      albedo = vec3(0.96, 0.97, 0.98);
    } else {
      float ang = clamp(atan(lp.z, lp.x) + 3.14159265, 0.0, 6.28318);
      int seg = int(floor(ang / 1.04719755)) % 6;
      if (seg == 0)      albedo = vec3(0.92, 0.14, 0.16);
      else if (seg == 1) albedo = vec3(0.96, 0.96, 0.97);
      else if (seg == 2) albedo = vec3(0.09, 0.38, 0.88);
      else if (seg == 3) albedo = vec3(0.96, 0.96, 0.97);
      else if (seg == 4) albedo = vec3(0.98, 0.78, 0.08);
      else               albedo = vec3(0.10, 0.72, 0.42);
    }
    roughness = 0.14;
  } else if (matID == 7) {
    vec3 ab = uNoodleB - uNoodleA;
    float len = length(ab);
    vec3 dir = ab / max(len, 1e-5);
    vec3 rel = p - uNoodleA;
    float along = dot(rel, dir);
    float radial = length(rel - dir * along);
    bool isHole = (along < 0.03 || along > len - 0.03) && (radial < uNoodleR * 0.34);
    float cell = noise2D(vec2(along * 45.0, atan(rel.y, rel.x) * 8.0));
    albedo = isHole ? vec3(0.18, 0.04, 0.03) : mix(vec3(0.98, 0.30, 0.18), vec3(1.0, 0.42, 0.24), cell);
    roughness = 0.62;
  } else if (matID == 8) {
    albedo = vec3(0.85, 0.90, 0.94);
    roughness = 0.15;
    metallic = 0.8;
  }
}

vec3 sampleCaustics(vec3 p, vec3 n) {
  vec2 uv = worldToCausticUV(p);
  if (p.x < -0.58 && p.z < -4.45 && abs(n.y) < 0.4) {
    uv = worldToCausticUV(p + n * 0.04);
  }
  vec2 texel = vec2(1.0 / 768.0, 1.0 / 1152.0);
  vec3 cCenter = texture(uCausticsTex, uv).rgb;
  vec3 cBlur = 0.25 * (
    texture(uCausticsTex, uv + vec2( 2.0,  1.0) * texel).rgb +
    texture(uCausticsTex, uv + vec2(-2.0,  1.0) * texel).rgb +
    texture(uCausticsTex, uv + vec2( 1.0, -2.0) * texel).rgb +
    texture(uCausticsTex, uv + vec2(-1.0, -2.0) * texel).rgb
  );
  vec3 raw = mix(cBlur, cCenter, smoothstep(0.1, 0.65, uCausticSharpness));
  float pwr = mix(0.75, 1.55, uCausticSharpness);
  vec3 shaped = pow(max(raw, vec3(0.0)), vec3(pwr)) * mix(1.15, 0.82, uCausticSharpness);
  if (abs(n.y) < 0.3 && abs(p.x) < 2.95 && abs(p.z) < 5.95) {
    shaped *= 0.65;
  }
  return shaped * uCausticBrightness;
}

void evalSingleLed(vec3 lightPos, vec3 lightDir, vec3 p, vec3 n, out vec3 irr, out float coneMask) {
  vec3 toL = lightPos - p;
  float dist = length(toL);
  vec3 lDir = toL / max(dist, 1e-4);
  float spotCos = dot(-lDir, lightDir);
  coneMask = smoothstep(0.32, 0.85, spotCos);
  float atten = coneMask / (1.0 + 0.14 * dist * dist);
  float ndotl = max(dot(n, lDir), 0.0);
  irr = uLedColor * atten * ndotl * 7.5;
}

vec3 evalUnderwaterLeds(vec3 p, vec3 n, vec3 viewDir, float roughness) {
  if (uLedEnabled < 0.5) return vec3(0.0);
  vec3 l1 = vec3(2.97, -0.72, -1.60), d1 = normalize(vec3(-1.0, -0.10, 0.0));
  vec3 l2 = vec3(2.97, -0.86,  2.40), d2 = normalize(vec3(-1.0, -0.10, 0.0));
  vec3 l3 = vec3(0.00, -0.96,  5.97), d3 = normalize(vec3( 0.0, -0.10, -1.0));

  vec3 irr1, irr2, irr3;
  float c1, c2, c3;
  evalSingleLed(l1, d1, p, n, irr1, c1);
  evalSingleLed(l2, d2, p, n, irr2, c2);
  evalSingleLed(l3, d3, p, n, irr3, c3);

  float sh = calcSoftShadow(p + n * 0.015, normalize(l2 - p), 0.05, length(l2 - p), 8.0);
  vec3 totalIrr = irr1 + irr2 * (0.25 + 0.75 * sh) + irr3;

  vec3 h1 = normalize(normalize(l2 - p) + viewDir);
  float spec = pow(max(dot(n, h1), 0.0), mix(90.0, 12.0, roughness)) * (0.4 + 0.6 * sh);
  return totalIrr + uLedColor * spec * 1.4;
}

float evalLedVolumetric(vec3 ro, vec3 rd, float maxT) {
  if (uLedEnabled < 0.5) return 0.0;
  vec3 lights[3];
  vec3 dirs[3];
  lights[0] = vec3(2.97, -0.72, -1.60); dirs[0] = normalize(vec3(-1.0, -0.10, 0.0));
  lights[1] = vec3(2.97, -0.86,  2.40); dirs[1] = normalize(vec3(-1.0, -0.10, 0.0));
  lights[2] = vec3(0.00, -0.96,  5.97); dirs[2] = normalize(vec3( 0.0, -0.10, -1.0));

  float acc = 0.0;
  const int STEPS = 8;
  float stepLen = min(maxT, 8.0) / float(STEPS);
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + 0.5) * stepLen;
    vec3 p = ro + rd * t;
    for (int j = 0; j < 3; j++) {
      vec3 v = p - lights[j];
      float d = length(v);
      float cone = smoothstep(0.45, 0.88, dot(v / max(d, 1e-4), dirs[j]));
      acc += cone / (1.0 + 0.35 * d * d);
    }
  }
  return acc * stepLen * 0.14;
}

vec3 shadePBR(vec3 p, vec3 n, vec3 v, vec3 albedo, float roughness, float metallic, float ao, float shadow, vec3 extraLight) {
  vec3 sun = normalize(uSunDir);
  vec3 h = normalize(sun + v);
  float ndotl = max(dot(n, sun), 0.0);
  float ndotv = max(dot(n, v), 0.001);
  float ndoth = max(dot(n, h), 0.0);
  float vdoth = max(dot(v, h), 0.0);

  vec3 F0 = mix(vec3(0.04), albedo, metallic);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - vdoth, 5.0);

  float a = max(roughness * roughness, 0.002);
  float a2 = a * a;
  float denom = (ndoth * ndoth * (a2 - 1.0) + 1.0);
  float D = a2 / (3.14159265 * denom * denom);
  float k = (roughness + 1.0) * (roughness + 1.0) * 0.125;
  float G = (ndotv / (ndotv * (1.0 - k) + k)) * (ndotl / (ndotl * (1.0 - k) + k + 1e-4));

  vec3 spec = (D * G * F) / max(4.0 * ndotv * ndotl, 0.001);
  vec3 kD = (1.0 - F) * (1.0 - metallic);

  vec3 sunDirect = (kD * albedo / 3.14159265 + spec) * uSunColor * uSunDirectScale * ndotl * shadow;

  float hemi = 0.5 + 0.5 * n.y;
  vec3 envAmb = mix(uSkyHorizon * 0.35, uSkyZenith * 0.7 + uSkyHorizon * 0.5, hemi) * uAmbientColor;
  vec3 ambient = kD * albedo * envAmb * ao;

  vec3 reflDir = reflect(-v, n);
  vec3 envRefl = sampleSky(reflDir);
  if (metallic > 0.5) {
    if (reflDir.y < 0.0) {
      envRefl = mix(vec3(0.18, 0.52, 0.62), uSkyHorizon * 0.55, smoothstep(-0.5, 0.0, reflDir.y));
    }
    vec3 F_env = F0 + (1.0 - F0) * pow(1.0 - ndotv, 5.0);
    ambient += envRefl * F_env * ao;
  } else if (roughness < 0.35) {
    vec3 F_env = F0 + (1.0 - F0) * pow(1.0 - ndotv, 5.0);
    ambient += envRefl * F_env * (1.0 - roughness * 2.2) * ao * 0.7;
  }

  return sunDirect + ambient + albedo * extraLight;
}

vec2 intersectBox(vec3 ro, vec3 rd, vec3 bMin, vec3 bMax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bMin - ro) * inv;
  vec3 t1 = (bMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

float sampleWaterH(vec3 p) {
  vec2 uv = vec2((p.x + POOL_HX) / (2.0 * POOL_HX), (p.z + POOL_HZ) / (2.0 * POOL_HZ));
  return texture(uNormalTex, clamp(uv, 0.001, 0.999)).a;
}

vec3 sampleWaterN(vec3 p) {
  vec2 uv = vec2((p.x + POOL_HX) / (2.0 * POOL_HX), (p.z + POOL_HZ) / (2.0 * POOL_HZ));
  return normalize(texture(uNormalTex, clamp(uv, 0.001, 0.999)).rgb);
}

float intersectWaterSurface(vec3 ro, vec3 rd) {
  vec2 hitSlab = intersectBox(ro, rd, vec3(-POOL_HX, -0.18, -POOL_HZ), vec3(POOL_HX, 0.18, POOL_HZ));
  if (hitSlab.x > hitSlab.y || hitSlab.y < 0.0) return -1.0;

  float tStart = max(0.0, hitSlab.x);
  float tEnd = hitSlab.y;
  const int STEPS = 14;
  float dt = (tEnd - tStart) / float(STEPS);

  float prevT = tStart;
  float prevDiff = (ro.y + rd.y * tStart) - sampleWaterH(ro + rd * tStart);
  if (prevDiff <= 0.0 && ro.y > -0.18) return tStart;

  for (int i = 1; i <= STEPS; i++) {
    float t = tStart + dt * float(i);
    vec3 p = ro + rd * t;
    float diff = p.y - sampleWaterH(p);
    if (diff <= 0.0) {
      float lo = prevT;
      float hi = t;
      for (int b = 0; b < 4; b++) {
        float mid = 0.5 * (lo + hi);
        vec3 pm = ro + rd * mid;
        if (pm.y - sampleWaterH(pm) > 0.0) lo = mid;
        else hi = mid;
      }
      return 0.5 * (lo + hi);
    }
    prevT = t;
    prevDiff = diff;
  }
  return -1.0;
}

float raymarchSolid(vec3 ro, vec3 rd, float tMin, float tMax, out int matID) {
  matID = 0;
  float t = tMin;
  int steps = uQuality > 0.8 ? 110 : 72;
  for (int i = 0; i < 110; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    int m;
    float d = mapScene(p, m);
    if (d < 0.0014 * (1.0 + 0.08 * t)) {
      matID = m;
      t += d * 0.7;
      return t;
    }
    t += max(d * 0.92, 0.002);
    if (t > tMax) break;
  }
  return -1.0;
}

float raymarchUnderwater(vec3 ro, vec3 rd, float maxDist, out int matID) {
  matID = 0;
  float t = 0.003;
  int steps = uQuality > 0.8 ? 64 : 44;
  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    int m;
    float d = mapScene(p, m);
    if (d < 0.0018) {
      matID = m;
      return t + d * 0.6;
    }
    t += max(d * 0.90, 0.003);
    if (t > maxDist) break;
  }
  return -1.0;
}

vec3 traceWaterReflection(vec3 w, vec3 reflDir) {
  bool checkAbove = (reflDir.y < 0.45);
  if (checkAbove) {
    vec2 box = intersectBox(w, reflDir, vec3(-3.8, -0.1, -6.5), vec3(3.8, 1.15, 8.2));
    if (box.x <= box.y && box.y > 0.0) {
      float t = max(0.015, box.x);
      float tEnd = min(box.y, 12.0);
      int steps = uQuality > 0.8 ? 36 : 24;
      for (int i = 0; i < 36; i++) {
        if (i >= steps) break;
        vec3 p = w + reflDir * t;
        int m;
        float d = mapScene(p, m);
        if (d < 0.003) {
          vec3 n = calcNormal(p);
          vec3 alb, bN; float rgh, met;
          getSolidMaterial(p, n, m, alb, rgh, met, bN);
          float sh = calcSoftShadow(p + n * 0.008, normalize(uSunDir), 0.02, 8.0, 12.0);
          float ao = calcAO(p, n);
          vec3 ledGlow = (m == 8 && uLedEnabled > 0.5) ? uLedColor * 6.0 : vec3(0.0);
          return shadePBR(p, bN, -reflDir, alb, rgh, met, ao, sh, ledGlow);
        }
        t += max(d * 0.95, 0.005);
        if (t > tEnd) break;
      }
    }
  }
  return sampleSky(reflDir);
}

vec3 shadeUnderwaterPoint(vec3 w, vec3 p, vec3 n, int matID, vec3 refrDir, float dEye) {
  vec3 alb, bN;
  float rgh, met;
  getSolidMaterial(p, n, matID, alb, rgh, met, bN);
  float ao = calcAO(p, n);

  vec3 sun = normalize(uSunDir);
  vec3 refrSun = refract(-sun, vec3(0.0, 1.0, 0.0), 1.0 / uIOR);
  float dSun = max(0.0, (0.0 - p.y) / max(-refrSun.y, 0.16));
  float dTotal = dEye + dSun;

  vec3 sigmaA = vec3(0.44, 0.088, 0.052) * uAbsorptionScale;
  vec3 caustics = sampleCaustics(p, bN);
  vec3 ledLight = evalUnderwaterLeds(p, bN, -refrDir, rgh);
  vec3 emissive = vec3(0.0);
  if (matID == 8 && uLedEnabled > 0.5) {
    emissive = uLedColor * 14.0;
  }

  float hemi = 0.5 + 0.5 * bN.y;
  vec3 skyAmb = mix(uSkyHorizon * 0.30, uSkyZenith * 0.60 + uSkyHorizon * 0.45, hemi) * uAmbientColor * 0.78;
  vec3 directCausticSun = uSunColor * uSunDirectScale * caustics;

  vec3 h = normalize(-refrSun - refrDir);
  float ndoth = max(dot(bN, h), 0.0);
  float spec = pow(ndoth, mix(110.0, 10.0, rgh)) * (met > 0.5 ? 1.2 : 0.35) * uSunDirectScale;

  vec3 sunAbsorb = exp(-sigmaA * dTotal);
  vec3 eyeAbsorb = exp(-sigmaA * dEye);
  vec3 surfaceAfterAbsorb = (alb * (directCausticSun + skyAmb * ao) + uSunColor * spec) * sunAbsorb
                          + (alb * ledLight + emissive) * eyeAbsorb;

  float scatterAmt = 1.0 - exp(-uTurbidity * dEye * 0.55);
  vec3 scatterCol = (uSunColor * uSunDirectScale * 0.16 + uSkyZenith * 0.25 + uSkyHorizon * 0.18)
                  * vec3(0.24, 0.78, 0.86)
                  + uLedColor * (uLedEnabled * 0.18);
  vec3 volLedBeam = uLedColor * evalLedVolumetric(w, refrDir, dEye) * (0.28 + 0.9 * uTurbidity);

  return mix(surfaceAfterAbsorb, scatterCol, scatterAmt) + volLedBeam * eyeAbsorb;
}

void main() {
  vec3 forward = normalize(uCamTarget - uCamPos);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);

  vec2 ndc = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float tanHalf = tan(uFov * 0.5);
  vec3 rd = normalize(forward + right * (ndc.x * aspect * tanHalf) + up * (ndc.y * tanHalf));

  vec2 sceneHit = intersectBox(uCamPos, rd, vec3(-12.2, -2.6, -15.2), vec3(12.2, 1.15, 15.2));
  if (sceneHit.x > sceneHit.y || sceneHit.y < 0.0) {
    vec3 sky = sampleSky(rd);
    sky = (sky * (2.51 * sky + 0.03)) / (sky * (2.43 * sky + 0.59) + 0.14);
    fragColor = vec4(pow(clamp(sky, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    return;
  }

  float tStart = max(0.001, sceneHit.x);
  float tEnd = sceneHit.y;

  float tWater = intersectWaterSurface(uCamPos, rd);
  float tMaxSolid = (tWater > 0.0) ? tWater : tEnd;

  int matID = 0;
  float tSolid = raymarchSolid(uCamPos, rd, tStart, tMaxSolid, matID);

  vec3 col;

  if (tSolid > 0.0 && (tWater < 0.0 || tSolid < tWater)) {
    vec3 p = uCamPos + rd * tSolid;
    vec3 n = calcNormal(p);
    vec3 alb, bN; float rgh, met;
    getSolidMaterial(p, n, matID, alb, rgh, met, bN);
    float ao = calcAO(p, n);
    float sh = calcSoftShadow(p + n * 0.006, normalize(uSunDir), 0.02, 10.0, 14.0);

    vec3 nightBounce = vec3(0.0);
    if (uLedEnabled > 0.5 && p.y < 0.45) {
      float insidePool = step(abs(p.x), POOL_HX + 0.05) * step(abs(p.z), POOL_HZ + 0.05);
      float edgeProx = exp(-max(0.0, sdBox2(p.xz, vec2(3.0, 6.0))) * 1.4);
      float toyBoost = (matID == 6 || matID == 7) ? 0.55 * insidePool : 0.28;
      nightBounce = uLedColor * toyBoost * edgeProx * max(0.22, -bN.y * 0.55 + 0.45);
    }

    col = shadePBR(p, bN, -rd, alb, rgh, met, ao, sh, nightBounce);

    float distFade = smoothstep(14.0, 32.0, tSolid);
    col = mix(col, sampleSky(rd), distFade);
  } else if (tWater > 0.0) {
    vec3 w = uCamPos + rd * tWater;
    vec3 nw = sampleWaterN(w);
    if (dot(nw, -rd) < 0.0) nw = normalize(nw - rd * 0.15);

    float F0 = pow((1.0 - uIOR) / (1.0 + uIOR), 2.0);
    float NdotV = clamp(dot(nw, -rd), 0.0, 1.0);
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    vec3 reflDir = reflect(rd, nw);
    vec3 reflCol = traceWaterReflection(w, reflDir);

    vec3 sun = normalize(uSunDir);
    vec3 hw = normalize(sun - rd);
    float ndoth = max(dot(nw, hw), 0.0);
    float glint = pow(ndoth, 420.0) * 6.5 + pow(ndoth, 42.0) * 0.28;
    vec3 sunGlint = uSunColor * uSunDirectScale * glint * (0.25 + 0.75 * fresnel);

    float dispScale = uDispersion * 0.036;
    vec3 refrG = refract(rd, nw, 1.0 / uIOR);
    if (dot(refrG, refrG) < 0.01) refrG = reflect(rd, nw);

    int underMat = 0;
    float tUnder = raymarchUnderwater(w, refrG, 14.0, underMat);
    vec3 refrCol;

    if (tUnder > 0.0) {
      vec3 pG = w + refrG * tUnder;
      vec3 nUnder = calcNormal(pG);
      vec3 colG = shadeUnderwaterPoint(w, pG, nUnder, underMat, refrG, tUnder);

      if (uDispersion > 0.005) {
        vec3 refrR = refract(rd, nw, 1.0 / max(1.02, uIOR - dispScale));
        vec3 refrB = refract(rd, nw, 1.0 / (uIOR + dispScale));
        if (dot(refrR, refrR) < 0.01) refrR = refrG;
        if (dot(refrB, refrB) < 0.01) refrB = refrG;

        float denomR = dot(refrR, nUnder);
        float denomB = dot(refrB, nUnder);
        float tR = abs(denomR) > 0.05 ? clamp(dot(pG - w, nUnder) / denomR, 0.02, tUnder + 0.45) : tUnder;
        float tB = abs(denomB) > 0.05 ? clamp(dot(pG - w, nUnder) / denomB, 0.02, tUnder + 0.45) : tUnder;

        vec3 pR = w + refrR * tR;
        vec3 pB = w + refrB * tB;
        float colR = shadeUnderwaterPoint(w, pR, nUnder, underMat, refrR, tR).r;
        float colB = shadeUnderwaterPoint(w, pB, nUnder, underMat, refrB, tB).b;
        refrCol = vec3(colR, colG.g, colB);
      } else {
        refrCol = colG;
      }
    } else {
      refrCol = vec3(0.03, 0.25, 0.35);
    }

    if (uLedEnabled > 0.5) {
      vec3 ledUp = normalize(vec3(1.5, -0.8, 0.5) - w);
      float upGlint = pow(max(dot(nw, normalize(ledUp - rd)), 0.0), 36.0);
      refrCol += uLedColor * upGlint * 0.45;
    }

    col = mix(refrCol, reflCol, fresnel) + sunGlint;
  } else {
    col = sampleSky(rd);
  }

  col = max(col, vec3(0.0));
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}`;
