import {
  CAUSTIC_GRID_X,
  CAUSTIC_GRID_Z,
  CAUSTIC_H,
  CAUSTIC_W,
  POOL_HALF_X,
  POOL_HALF_Z,
  SIM_H,
  SIM_W,
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
  stepBuoyancy,
} from './buoyancy';
import {
  CAUSTICS_FRAG,
  CAUSTICS_VERT,
  POOL_MAIN_FRAG,
  QUAD_VERT,
  WATER_IMPULSE_FRAG,
  WATER_NORMAL_FRAG,
  WATER_UPDATE_FRAG,
} from './shaders';
import type {
  BallState,
  CameraState,
  NoodleState,
  PoolStats,
  SimulationState,
  WaterPickHit,
} from './types';

interface FboTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export interface PoolEngineCallbacks {
  onStats: (stats: PoolStats) => void;
  onError: (message: string) => void;
  onReady: (precisionLabel: '32F' | '16F', softwareGl: boolean) => void;
  onImpulse?: (
    uvX: number,
    radiusMeters: number,
    strength: number,
    source: 'splash' | 'rain',
  ) => void;
  onWaveMotion?: (
    dt: number,
    cpuVelocities: Float32Array,
    rainEnabled: boolean,
    rainIntensity: number,
    turbidity: number,
  ) => void;
}

function detectSoftwareGl(gl: WebGL2RenderingContext): boolean {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
  name: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error(`Unable to create shader [${name}].`);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'Unknown shader compile error';
    gl.deleteShader(sh);
    throw new Error(`Shader [${name}] failed to compile:\n${log}`);
  }
  return sh;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vSrc: string,
  fSrc: string,
  name: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vSrc, `${name}.vert`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fSrc, `${name}.frag`);
  const prog = gl.createProgram();
  if (!prog) throw new Error(`Unable to create program [${name}].`);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || 'Unknown program link error';
    gl.deleteProgram(prog);
    throw new Error(`Program [${name}] failed to link:\n${log}`);
  }
  return prog;
}

function getUniforms(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  names: string[],
): Record<string, WebGLUniformLocation | null> {
  const map: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) {
    map[n] = gl.getUniformLocation(prog, n);
  }
  return map;
}

function createFloatFBO(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFmt: number,
  type: number,
  name: string,
): FboTarget {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) {
    throw new Error(`Unable to allocate FBO [${name}].`);
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(
      `Framebuffer [${name}] incomplete (status 0x${status.toString(16)}).`,
    );
  }
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

export class WebGLPoolEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: PoolEngineCallbacks;
  private gl: WebGL2RenderingContext | null = null;
  private softwareGl = false;
  private precisionLabel: '32F' | '16F' = '32F';

  private state: SimulationState = createInitialSimState();
  private cam: CameraState = createInitialCameraState();
  private readonly cpuWave = new CpuWaveGrid();
  private readonly ball: BallState = createInitialBall();
  private readonly noodle: NoodleState = createInitialNoodle();
  private readonly impulseQueue: Array<[number, number, number, number]> = [];
  private readonly impFlat = new Float32Array(40);

  // GPU Resources
  private progImpulse: WebGLProgram | null = null;
  private progUpdate: WebGLProgram | null = null;
  private progNormal: WebGLProgram | null = null;
  private progCaustics: WebGLProgram | null = null;
  private progMain: WebGLProgram | null = null;

  private uImp: Record<string, WebGLUniformLocation | null> = {};
  private uUpd: Record<string, WebGLUniformLocation | null> = {};
  private uNrm: Record<string, WebGLUniformLocation | null> = {};
  private uCau: Record<string, WebGLUniformLocation | null> = {};
  private uMain: Record<string, WebGLUniformLocation | null> = {};

  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;
  private causticVAO: WebGLVertexArrayObject | null = null;
  private cVBO: WebGLBuffer | null = null;
  private cIBO: WebGLBuffer | null = null;

  private waterA: FboTarget | null = null;
  private waterB: FboTarget | null = null;
  private normalFBO: FboTarget | null = null;
  private causticsFBO: FboTarget | null = null;

  // Loop & timing
  private disposed = false;
  private contextLost = false;
  private rafId = 0;
  private timerId = 0;
  private lastTime = 0;
  private simTime = 0;
  private rainAccum = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;

  // Pointer & pinch tracking
  private dragMode: 'splash' | 'orbit' | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastWaterPick: WaterPickHit | null = null;
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist: number | null = null;

  // Bound event listeners
  private readonly handleResizeBound: () => void;
  private readonly handleContextMenuBound: (e: MouseEvent) => void;
  private readonly handlePointerDownBound: (e: PointerEvent) => void;
  private readonly handlePointerMoveBound: (e: PointerEvent) => void;
  private readonly handlePointerUpBound: (e: PointerEvent) => void;
  private readonly handleWheelBound: (e: WheelEvent) => void;
  private readonly handleContextLostBound: (e: Event) => void;
  private readonly handleContextRestoredBound: () => void;

  constructor(canvas: HTMLCanvasElement, callbacks: PoolEngineCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.handleResizeBound = () => {
      if (!this.softwareGl && !this.disposed && !this.contextLost) {
        this.resizeCanvas();
      }
    };
    this.handleContextMenuBound = (e) => e.preventDefault();
    this.handlePointerDownBound = (e) => this.onPointerDown(e);
    this.handlePointerMoveBound = (e) => this.onPointerMove(e);
    this.handlePointerUpBound = (e) => this.onPointerUp(e);
    this.handleWheelBound = (e) => this.onWheel(e);
    this.handleContextLostBound = (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.cancelScheduledFrame();
    };
    this.handleContextRestoredBound = () => {
      this.contextLost = false;
      this.initGl();
      this.scheduleNextFrame();
    };

    this.attachEvents();
    if (this.initGl()) {
      // Initial welcoming ripples so caustics animate immediately
      this.queueImpulse(0.46, 0.42, 0.36, -0.055);
      this.queueImpulse(0.58, 0.56, 0.28, -0.032);
      this.lastTime = performance.now();
      this.scheduleNextFrame();
    }
  }

  private attachEvents(): void {
    window.addEventListener('resize', this.handleResizeBound);
    this.canvas.addEventListener('contextmenu', this.handleContextMenuBound);
    this.canvas.addEventListener('pointerdown', this.handlePointerDownBound);
    this.canvas.addEventListener('pointermove', this.handlePointerMoveBound);
    this.canvas.addEventListener('pointerup', this.handlePointerUpBound);
    this.canvas.addEventListener('pointercancel', this.handlePointerUpBound);
    this.canvas.addEventListener('wheel', this.handleWheelBound, {
      passive: false,
    });
    this.canvas.addEventListener(
      'webglcontextlost',
      this.handleContextLostBound,
    );
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.handleContextRestoredBound,
    );
  }

  private detachEvents(): void {
    window.removeEventListener('resize', this.handleResizeBound);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenuBound);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDownBound);
    this.canvas.removeEventListener('pointermove', this.handlePointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.handlePointerUpBound);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUpBound);
    this.canvas.removeEventListener('wheel', this.handleWheelBound);
    this.canvas.removeEventListener(
      'webglcontextlost',
      this.handleContextLostBound,
    );
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestoredBound,
    );
  }

  private initGl(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      this.callbacks.onError(
        'WebGL2 is required for this simulation, but your browser or GPU did not provide a WebGL2 context.',
      );
      return false;
    }

    const extCBFloat = gl.getExtension('EXT_color_buffer_float');
    const extCBHalf = gl.getExtension('EXT_color_buffer_half_float');
    const extFloatLin = gl.getExtension('OES_texture_float_linear');
    const extFloatBlend = gl.getExtension('EXT_float_blend');

    if (!extCBFloat && !extCBHalf) {
      this.callbacks.onError(
        'Floating-point framebuffers (EXT_color_buffer_float or EXT_color_buffer_half_float) are not supported on this device.',
      );
      return false;
    }

    this.gl = gl;
    this.softwareGl = detectSoftwareGl(gl);

    const use32Sim = Boolean(extCBFloat && extFloatLin && !this.softwareGl);
    const use32Caustic = Boolean(
      extCBFloat && extFloatLin && extFloatBlend && !this.softwareGl,
    );

    const simFormat = use32Sim
      ? { internal: gl.RGBA32F, type: gl.FLOAT, label: '32F' as const }
      : { internal: gl.RGBA16F, type: gl.HALF_FLOAT, label: '16F' as const };

    const causticFormat = use32Caustic
      ? { internal: gl.RGBA32F, type: gl.FLOAT }
      : { internal: gl.RGBA16F, type: gl.HALF_FLOAT };

    this.precisionLabel = simFormat.label;

    try {
      this.progImpulse = createProgram(
        gl,
        QUAD_VERT,
        WATER_IMPULSE_FRAG,
        'waterImpulse',
      );
      this.progUpdate = createProgram(
        gl,
        QUAD_VERT,
        WATER_UPDATE_FRAG,
        'waterUpdate',
      );
      this.progNormal = createProgram(
        gl,
        QUAD_VERT,
        WATER_NORMAL_FRAG,
        'waterNormal',
      );
      this.progCaustics = createProgram(
        gl,
        CAUSTICS_VERT,
        CAUSTICS_FRAG,
        'caustics',
      );
      this.progMain = createProgram(
        gl,
        QUAD_VERT,
        POOL_MAIN_FRAG,
        'poolMain',
      );

      this.uImp = getUniforms(gl, this.progImpulse, [
        'uWaterTex',
        'uTexelSize',
        'uImpulses[0]',
        'uImpulseCount',
        'uBallState',
        'uBallVelXZ',
        'uNoodleA',
        'uNoodleB',
        'uTime',
        'uRainActive',
      ]);
      this.uUpd = getUniforms(gl, this.progUpdate, [
        'uWaterTex',
        'uTexelSize',
        'uWaveSpeed',
        'uDamping',
        'uTension',
        'uSubDt',
      ]);
      this.uNrm = getUniforms(gl, this.progNormal, ['uWaterTex', 'uTexelSize']);
      this.uCau = getUniforms(gl, this.progCaustics, [
        'uNormalTex',
        'uSunDir',
        'uIOR',
        'uDispersion',
        'uBallPos',
        'uNoodleA',
        'uNoodleB',
        'uNoodleR',
      ]);
      this.uMain = getUniforms(gl, this.progMain, [
        'uNormalTex',
        'uCausticsTex',
        'uResolution',
        'uTime',
        'uQuality',
        'uCamPos',
        'uCamTarget',
        'uFov',
        'uSunDir',
        'uSunColor',
        'uSunDirectScale',
        'uSkyZenith',
        'uSkyHorizon',
        'uAmbientColor',
        'uCloudCover',
        'uNightFactor',
        'uIOR',
        'uDispersion',
        'uCausticSharpness',
        'uCausticBrightness',
        'uTurbidity',
        'uAbsorptionScale',
        'uLedEnabled',
        'uLedColor',
        'uTilePalette',
        'uBallPos',
        'uBallRot',
        'uNoodleA',
        'uNoodleB',
        'uNoodleR',
      ]);

      // Fullscreen Quad VAO
      this.quadVAO = gl.createVertexArray();
      gl.bindVertexArray(this.quadVAO);
      this.quadVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      // Caustics Mesh VAO
      this.causticVAO = gl.createVertexArray();
      gl.bindVertexArray(this.causticVAO);
      const gridVerts = new Float32Array(
        (CAUSTIC_GRID_X + 1) * (CAUSTIC_GRID_Z + 1) * 2,
      );
      let ptr = 0;
      for (let z = 0; z <= CAUSTIC_GRID_Z; z++) {
        const v = z / CAUSTIC_GRID_Z;
        for (let x = 0; x <= CAUSTIC_GRID_X; x++) {
          gridVerts[ptr++] = x / CAUSTIC_GRID_X;
          gridVerts[ptr++] = v;
        }
      }
      const gridIndices = new Uint32Array(CAUSTIC_GRID_X * CAUSTIC_GRID_Z * 6);
      ptr = 0;
      const stride = CAUSTIC_GRID_X + 1;
      for (let z = 0; z < CAUSTIC_GRID_Z; z++) {
        for (let x = 0; x < CAUSTIC_GRID_X; x++) {
          const a = z * stride + x;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          gridIndices[ptr++] = a;
          gridIndices[ptr++] = c;
          gridIndices[ptr++] = b;
          gridIndices[ptr++] = b;
          gridIndices[ptr++] = c;
          gridIndices[ptr++] = d;
        }
      }
      this.cVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cVBO);
      gl.bufferData(gl.ARRAY_BUFFER, gridVerts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.cIBO = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridIndices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);

      // Floating-Point Framebuffers
      const causticW = this.softwareGl ? 512 : CAUSTIC_W;
      const causticH = this.softwareGl ? 768 : CAUSTIC_H;
      this.waterA = createFloatFBO(
        gl,
        SIM_W,
        SIM_H,
        simFormat.internal,
        simFormat.type,
        'waterA',
      );
      this.waterB = createFloatFBO(
        gl,
        SIM_W,
        SIM_H,
        simFormat.internal,
        simFormat.type,
        'waterB',
      );
      this.normalFBO = createFloatFBO(
        gl,
        SIM_W,
        SIM_H,
        simFormat.internal,
        simFormat.type,
        'normalFBO',
      );
      this.causticsFBO = createFloatFBO(
        gl,
        causticW,
        causticH,
        causticFormat.internal,
        causticFormat.type,
        'causticsFBO',
      );
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'Failed to initialize WebGL2.',
      );
      return false;
    }

    this.resizeCanvas();
    this.callbacks.onReady(this.precisionLabel, this.softwareGl);
    return true;
  }

  private resizeCanvas(): void {
    const scale = this.softwareGl
      ? 0.55
      : Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.floor(window.innerWidth * scale));
    const h = Math.max(1, Math.floor(window.innerHeight * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  updateState(next: SimulationState): void {
    this.state = next;
  }

  queueImpulse(
    uvX: number,
    uvY: number,
    radiusMeters: number,
    strength: number,
    source: 'splash' | 'rain' = 'splash',
  ): void {
    if (this.impulseQueue.length < 10) {
      this.impulseQueue.push([uvX, uvY, radiusMeters, strength]);
    }
    this.cpuWave.addImpulse(uvX, uvY, radiusMeters, strength);
    this.callbacks.onImpulse?.(uvX, radiusMeters, strength, source);
  }

  dropRandomSplash(): void {
    const rx = 0.25 + Math.random() * 0.5;
    const rz = 0.25 + Math.random() * 0.5;
    this.queueImpulse(rx, rz, 0.44, -0.085, 'splash');
  }

  resetCamera(): void {
    this.cam.targetTheta = -0.84;
    this.cam.targetPhi = 0.90;
    this.cam.targetDist = 9.6;
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      this.lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      this.dragMode = null;
      return;
    }

    this.lastX = e.clientX;
    this.lastY = e.clientY;
    const rect = this.canvas.getBoundingClientRect();
    const hit = pickWaterSurface(e.clientX, e.clientY, rect, this.cam);

    const forceOrbit =
      e.button === 2 ||
      e.button === 1 ||
      e.shiftKey ||
      e.altKey ||
      this.state.leftOrbitMode;

    if (!forceOrbit && hit) {
      this.dragMode = 'splash';
      this.lastWaterPick = hit;
      this.queueImpulse(hit.u, hit.v, 0.34, -0.055);
      const db = Math.hypot(hit.wx - this.ball.x, hit.wz - this.ball.z);
      if (db < 0.85 && db > 1e-3) {
        const f = (1.0 - db / 0.85) * 1.4;
        this.ball.vx += ((this.ball.x - hit.wx) / db) * f;
        this.ball.vz += ((this.ball.z - hit.wz) / db) * f;
        this.ball.vy += 0.45 * (1.0 - db / 0.85);
      }
      const dn = Math.hypot(hit.wx - this.noodle.x, hit.wz - this.noodle.z);
      if (dn < 1.1 && dn > 1e-3) {
        const f = (1.0 - dn / 1.1) * 0.9;
        this.noodle.vx += ((this.noodle.x - hit.wx) / dn) * f;
        this.noodle.vz += ((this.noodle.z - hit.wz) / dn) * f;
      }
    } else {
      this.dragMode = 'orbit';
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.activePointers.size === 2 && this.lastPinchDist !== null) {
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const delta = this.lastPinchDist - dist;
      this.lastPinchDist = dist;
      this.cam.targetDist = Math.max(
        2.8,
        Math.min(18.0, this.cam.targetDist * (1 + delta * 0.005)),
      );
      return;
    }

    if (!this.dragMode) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.dragMode === 'orbit') {
      this.cam.targetTheta -= dx * 0.0055;
      this.cam.targetPhi = Math.max(
        0.14,
        Math.min(1.44, this.cam.targetPhi - dy * 0.0055),
      );
    } else if (this.dragMode === 'splash') {
      const rect = this.canvas.getBoundingClientRect();
      const hit = pickWaterSurface(e.clientX, e.clientY, rect, this.cam);
      if (hit) {
        if (this.lastWaterPick) {
          const dist = Math.hypot(
            hit.wx - this.lastWaterPick.wx,
            hit.wz - this.lastWaterPick.wz,
          );
          const steps = Math.min(4, Math.max(1, Math.ceil(dist / 0.14)));
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            this.queueImpulse(
              this.lastWaterPick.u + (hit.u - this.lastWaterPick.u) * t,
              this.lastWaterPick.v + (hit.v - this.lastWaterPick.v) * t,
              0.24,
              -0.022 / steps,
            );
          }
        } else {
          this.queueImpulse(hit.u, hit.v, 0.24, -0.022);
        }
        this.lastWaterPick = hit;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.lastPinchDist = null;
    }
    if (this.dragMode) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if capture was already released
      }
    }
    this.dragMode = null;
    this.lastWaterPick = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.cam.targetDist = Math.max(
      2.8,
      Math.min(18.0, this.cam.targetDist * (1 + e.deltaY * 0.001)),
    );
  }

  private cancelScheduledFrame(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = 0;
    }
  }

  private scheduleNextFrame(): void {
    if (this.disposed || this.contextLost) return;
    if (this.softwareGl) {
      this.afterDraw(() => {
        if (!this.disposed && !this.contextLost) {
          this.renderFrame(performance.now());
        }
      });
    } else {
      this.rafId = requestAnimationFrame((now) => this.renderFrame(now));
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.gl;
    if (!gl) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed || this.contextLost) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.timerId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.timerId = window.setTimeout(cb, 80);
      }
    };
    this.timerId = window.setTimeout(poll, 5);
  }

  private renderFrame(now: number): void {
    if (this.disposed || this.contextLost || !this.gl) return;
    const gl = this.gl;
    if (
      !this.waterA ||
      !this.waterB ||
      !this.normalFBO ||
      !this.causticsFBO ||
      !this.progImpulse ||
      !this.progUpdate ||
      !this.progNormal ||
      !this.progCaustics ||
      !this.progMain
    ) {
      return;
    }

    const rawDt = (now - this.lastTime) * 0.001;
    const dt = Math.min(0.033, Math.max(0.001, rawDt));
    this.lastTime = now;
    this.simTime += dt;

    this.fpsFrames++;
    this.fpsTimer += Math.max(0.001, rawDt);
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.callbacks.onStats({
        fps,
        precisionLabel: this.precisionLabel,
        softwareGl: this.softwareGl,
      });
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    this.resizeCanvas();

    // Smooth camera damping
    const camLerp = this.softwareGl ? 1.0 : 1 - Math.exp(-12 * dt);
    this.cam.theta += (this.cam.targetTheta - this.cam.theta) * camLerp;
    this.cam.phi += (this.cam.targetPhi - this.cam.phi) * camLerp;
    this.cam.dist += (this.cam.targetDist - this.cam.dist) * camLerp;

    // Raindrop generator
    if (this.state.rainEnabled) {
      this.rainAccum += dt * (4.0 + this.state.rainIntensity * 34.0);
      while (this.rainAccum >= 1.0) {
        this.rainAccum -= 1.0;
        const u = 0.04 + Math.random() * 0.92;
        const v = 0.04 + Math.random() * 0.92;
        const size = 0.09 + Math.random() * 0.09;
        const amp =
          -(0.012 + Math.random() * 0.018) *
          (0.55 + 0.65 * this.state.rainIntensity);
        this.queueImpulse(u, v, size, amp, 'rain');
      }
    }

    // Step CPU wave mirror & buoyant objects
    this.cpuWave.step(dt, this.state.waveSpeed, this.state.damping);
    stepBuoyancy(dt, this.cpuWave, this.ball, this.noodle);
    this.callbacks.onWaveMotion?.(
      dt,
      this.cpuWave.v,
      this.state.rainEnabled,
      this.state.rainIntensity,
      this.state.turbidity,
    );

    const cp = Math.cos(this.noodle.pitch);
    const sp = Math.sin(this.noodle.pitch);
    const dxN = Math.cos(this.noodle.yaw) * this.noodle.halfLen * cp;
    const dyN = this.noodle.halfLen * sp;
    const dzN = Math.sin(this.noodle.yaw) * this.noodle.halfLen * cp;
    const nA: [number, number, number] = [
      this.noodle.x - dxN,
      this.noodle.y - dyN,
      this.noodle.z - dzN,
    ];
    const nB: [number, number, number] = [
      this.noodle.x + dxN,
      this.noodle.y + dyN,
      this.noodle.z + dzN,
    ];

    // PASS 1: Water Impulses & Buoyant Object Wakes
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quadVAO);
    gl.viewport(0, 0, SIM_W, SIM_H);

    gl.useProgram(this.progImpulse);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waterA.tex);
    gl.uniform1i(this.uImp['uWaterTex'], 0);
    gl.uniform2f(this.uImp['uTexelSize'], 1 / SIM_W, 1 / SIM_H);
    this.impFlat.fill(0);
    for (let i = 0; i < this.impulseQueue.length; i++) {
      this.impFlat[i * 4 + 0] = this.impulseQueue[i][0];
      this.impFlat[i * 4 + 1] = this.impulseQueue[i][1];
      this.impFlat[i * 4 + 2] = this.impulseQueue[i][2];
      this.impFlat[i * 4 + 3] = this.impulseQueue[i][3];
    }
    gl.uniform4fv(this.uImp['uImpulses[0]'], this.impFlat);
    gl.uniform1i(this.uImp['uImpulseCount'], this.impulseQueue.length);
    this.impulseQueue.length = 0;

    gl.uniform4f(
      this.uImp['uBallState'],
      this.ball.x,
      this.ball.z,
      this.ball.r,
      this.ball.vy,
    );
    gl.uniform2f(this.uImp['uBallVelXZ'], this.ball.vx, this.ball.vz);
    gl.uniform4f(
      this.uImp['uNoodleA'],
      nA[0],
      nA[2],
      this.noodle.r,
      this.noodle.vy,
    );
    gl.uniform3f(
      this.uImp['uNoodleB'],
      nB[0],
      nB[2],
      Math.hypot(this.noodle.vx, this.noodle.vz),
    );
    gl.uniform1f(this.uImp['uTime'], this.simTime);
    gl.uniform1f(
      this.uImp['uRainActive'],
      this.state.rainEnabled ? 1.0 : 0.0,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.waterB.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    [this.waterA, this.waterB] = [this.waterB, this.waterA];

    // PASS 2: Shallow-Water PDE Sub-Stepping
    gl.useProgram(this.progUpdate);
    gl.uniform2f(this.uUpd['uTexelSize'], 1 / SIM_W, 1 / SIM_H);
    gl.uniform1f(this.uUpd['uWaveSpeed'], this.state.waveSpeed);
    gl.uniform1f(this.uUpd['uDamping'], this.state.damping);
    gl.uniform1f(this.uUpd['uTension'], this.state.tension);
    const subSteps = 3;
    gl.uniform1f(this.uUpd['uSubDt'], dt / subSteps);

    for (let s = 0; s < subSteps; s++) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.waterA.tex);
      gl.uniform1i(this.uUpd['uWaterTex'], 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.waterB.fbo);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      [this.waterA, this.waterB] = [this.waterB, this.waterA];
    }

    // PASS 3: Normal Derivation
    gl.useProgram(this.progNormal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waterA.tex);
    gl.uniform1i(this.uNrm['uWaterTex'], 0);
    gl.uniform2f(this.uNrm['uTexelSize'], 1 / SIM_W, 1 / SIM_H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.normalFBO.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // PASS 4: Instanced Chromatic Caustic Ray Projection
    const sunDir = getSunDirection(
      this.state.sunAzimuth,
      this.state.sunElevation,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.causticsFBO.fbo);
    gl.viewport(0, 0, this.causticsFBO.w, this.causticsFBO.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.progCaustics);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.normalFBO.tex);
    gl.uniform1i(this.uCau['uNormalTex'], 0);
    gl.uniform3fv(this.uCau['uSunDir'], sunDir);
    gl.uniform1f(this.uCau['uIOR'], this.state.ior);
    gl.uniform1f(this.uCau['uDispersion'], this.state.dispersion);
    gl.uniform4f(
      this.uCau['uBallPos'],
      this.ball.x,
      this.ball.y,
      this.ball.z,
      this.ball.r,
    );
    gl.uniform3fv(this.uCau['uNoodleA'], nA);
    gl.uniform3fv(this.uCau['uNoodleB'], nB);
    gl.uniform1f(this.uCau['uNoodleR'], this.noodle.r);

    gl.bindVertexArray(this.causticVAO);
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      CAUSTIC_GRID_X * CAUSTIC_GRID_Z * 6,
      gl.UNSIGNED_INT,
      0,
      3,
    );
    gl.disable(gl.BLEND);

    // PASS 5: Main SDF Raymarching, Fresnel, Dispersion & Beer-Lambert Shading
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    const camPos = getCameraPosition(
      this.cam.theta,
      this.cam.phi,
      this.cam.dist,
      this.cam.target,
    );
    const ledCol = hexToLinearRGB(this.state.ledColor);

    gl.useProgram(this.progMain);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.normalFBO.tex);
    gl.uniform1i(this.uMain['uNormalTex'], 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.causticsFBO.tex);
    gl.uniform1i(this.uMain['uCausticsTex'], 1);

    gl.uniform2f(
      this.uMain['uResolution'],
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform1f(this.uMain['uTime'], this.simTime);
    gl.uniform1f(this.uMain['uQuality'], this.softwareGl ? 0.65 : 1.0);

    gl.uniform3fv(this.uMain['uCamPos'], camPos);
    gl.uniform3fv(this.uMain['uCamTarget'], this.cam.target);
    gl.uniform1f(this.uMain['uFov'], this.cam.fov);

    gl.uniform3fv(this.uMain['uSunDir'], sunDir);
    gl.uniform3fv(this.uMain['uSunColor'], this.state.sunColor);
    gl.uniform1f(this.uMain['uSunDirectScale'], this.state.sunDirectScale);
    gl.uniform3fv(this.uMain['uSkyZenith'], this.state.skyZenith);
    gl.uniform3fv(this.uMain['uSkyHorizon'], this.state.skyHorizon);
    gl.uniform3fv(this.uMain['uAmbientColor'], this.state.ambientColor);
    gl.uniform1f(this.uMain['uCloudCover'], this.state.cloudCover);
    gl.uniform1f(this.uMain['uNightFactor'], this.state.nightFactor);

    gl.uniform1f(this.uMain['uIOR'], this.state.ior);
    gl.uniform1f(this.uMain['uDispersion'], this.state.dispersion);
    gl.uniform1f(
      this.uMain['uCausticSharpness'],
      this.state.causticSharpness,
    );
    gl.uniform1f(
      this.uMain['uCausticBrightness'],
      this.state.causticBrightness,
    );
    gl.uniform1f(this.uMain['uTurbidity'], this.state.turbidity);
    gl.uniform1f(this.uMain['uAbsorptionScale'], this.state.absorptionScale);

    gl.uniform1f(
      this.uMain['uLedEnabled'],
      this.state.ledEnabled ? 1.0 : 0.0,
    );
    gl.uniform3fv(this.uMain['uLedColor'], ledCol);
    gl.uniform1i(this.uMain['uTilePalette'], this.state.tilePalette);

    gl.uniform4f(
      this.uMain['uBallPos'],
      this.ball.x,
      this.ball.y,
      this.ball.z,
      this.ball.r,
    );
    gl.uniformMatrix3fv(this.uMain['uBallRot'], false, this.ball.rot);
    gl.uniform3fv(this.uMain['uNoodleA'], nA);
    gl.uniform3fv(this.uMain['uNoodleB'], nB);
    gl.uniform1f(this.uMain['uNoodleR'], this.noodle.r);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.scheduleNextFrame();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelScheduledFrame();
    this.detachEvents();

    const gl = this.gl;
    if (gl) {
      const fbos = [this.waterA, this.waterB, this.normalFBO, this.causticsFBO];
      for (const target of fbos) {
        if (target) {
          gl.deleteFramebuffer(target.fbo);
          gl.deleteTexture(target.tex);
        }
      }
      if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
      if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
      if (this.cVBO) gl.deleteBuffer(this.cVBO);
      if (this.cIBO) gl.deleteBuffer(this.cIBO);
      if (this.causticVAO) gl.deleteVertexArray(this.causticVAO);
      if (this.progImpulse) gl.deleteProgram(this.progImpulse);
      if (this.progUpdate) gl.deleteProgram(this.progUpdate);
      if (this.progNormal) gl.deleteProgram(this.progNormal);
      if (this.progCaustics) gl.deleteProgram(this.progCaustics);
      if (this.progMain) gl.deleteProgram(this.progMain);
    }
    this.gl = null;
  }
}

export { POOL_HALF_X, POOL_HALF_Z };
