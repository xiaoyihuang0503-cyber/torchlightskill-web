(() => {
  'use strict';

  const field = document.querySelector('.ambient-field');
  const canvas = document.getElementById('fluid-background');
  if (!field || !canvas) return;

  const aura = document.querySelector('.pointer-aura');
  const ring = document.querySelector('.pointer-ring');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, sx: innerWidth / 2, sy: innerHeight / 2, active: false, strength: 0 };
  const ripples = new Set();
  let gl = null;
  let program = null;
  let locations = null;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  let resizeNeeded = true;

  const vertexSource = `
    attribute vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const fragmentSource = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform float uTime;
    uniform float uStrength;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, amplitude = 0.5;
      mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 4; i++) {
        v += amplitude * noise(p);
        p = turn * p * 2.02 + 3.7;
        amplitude *= 0.5;
      }
      return v;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      float aspect = uResolution.x / uResolution.y;
      vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
      vec2 mouse = (uPointer - 0.5) * vec2(aspect, 1.0);
      vec2 delta = p - mouse;
      float influence = exp(-dot(delta, delta) * 6.5) * uStrength;
      p += vec2(-delta.y, delta.x) * influence * 0.38;
      float t = uTime * 0.055;
      vec2 q = vec2(fbm(p * 1.15 + vec2(t, -t * 0.6)),
                    fbm(p * 1.15 + vec2(4.1 - t * 0.4, 1.7 + t)));
      vec2 r = vec2(fbm(p * 1.25 + q * 2.1 + vec2(1.7, 9.2) + t * 0.35),
                    fbm(p * 1.25 + q * 2.1 + vec2(8.3, 2.8) - t * 0.28));
      float flow = fbm(p * 1.35 + r * 2.6);
      float fold = sin((p.x * 1.15 + p.y * 0.62 + flow * 2.2 + q.y * 0.8) * 4.6 + t);
      float ribbon = pow(1.0 - abs(fold), 2.0);
      float silk = smoothstep(0.25, 0.8, flow);
      float edge = pow(1.0 - abs(fold), 12.0);
      vec3 color = vec3(0.012, 0.006, 0.029);
      color += mix(vec3(0.065, 0.023, 0.14), vec3(0.22, 0.054, 0.35), r.x) * silk;
      color += vec3(0.23, 0.062, 0.38) * ribbon * (0.25 + silk);
      color += vec3(0.24, 0.09, 0.34) * edge * 0.18;
      color += vec3(0.055, 0.022, 0.09) * influence;
      float vignette = 1.0 - smoothstep(0.25, 1.35, length(p * vec2(0.65, 0.8)));
      color *= 0.65 + vignette * 0.35;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function resetPointer() {
    pointer.active = false;
    if (aura) aura.classList.remove('is-visible');
    if (ring) ring.classList.remove('is-visible', 'is-pressed');
    ripples.forEach(ripple => ripple.remove());
    ripples.clear();
  }

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Ambient shader unavailable');
    }
    return shader;
  }

  function initializeWebGL() {
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
      if (!gl) return;
      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Ambient program unavailable');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      locations = {
        resolution: gl.getUniformLocation(program, 'uResolution'),
        pointer: gl.getUniformLocation(program, 'uPointer'),
        time: gl.getUniformLocation(program, 'uTime'),
        strength: gl.getUniformLocation(program, 'uStrength')
      };
      resizeNeeded = true;
      draw();
      field.classList.add('is-webgl');
    } catch (_) {
      gl = null;
      program = null;
      field.classList.remove('is-webgl');
    }
  }

  function draw() {
    if (!gl || !program || gl.isContextLost()) return;
    if (resizeNeeded) {
      // This decorative layer is intentionally rendered below display resolution.
      const scale = Math.min(devicePixelRatio || 1, 1.25, 1280 / Math.max(innerWidth, innerHeight));
      canvas.width = Math.max(1, Math.round(innerWidth * scale));
      canvas.height = Math.max(1, Math.round(innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(locations.resolution, canvas.width, canvas.height);
      resizeNeeded = false;
    }
    gl.uniform2f(locations.pointer, pointer.sx / innerWidth, 1 - pointer.sy / innerHeight);
    gl.uniform1f(locations.time, elapsed);
    gl.uniform1f(locations.strength, pointer.strength);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function animate(timestamp) {
    frame = 0;
    if (document.hidden || reduceMotion.matches) return;
    if (!previous || timestamp - previous >= 1000 / 30) {
      const delta = previous ? Math.min((timestamp - previous) / 1000, 0.1) : 1 / 30;
      previous = timestamp;
      elapsed += delta;
      const follow = 1 - Math.exp(-delta * 10);
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
      pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * follow;
      if (pointer.active && finePointer.matches) {
        if (aura) aura.style.transform = `translate3d(${pointer.sx}px,${pointer.sy}px,0)`;
        if (ring) ring.style.transform = `translate3d(${pointer.sx}px,${pointer.sy}px,0)`;
      }
      draw();
    }
    frame = requestAnimationFrame(animate);
  }

  function updateActivity() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    field.classList.toggle('is-paused', document.hidden || reduceMotion.matches);
    resetPointer();
    if (reduceMotion.matches) {
      pointer.strength = 0;
      draw();
    } else if (!document.hidden) {
      frame = requestAnimationFrame(animate);
    }
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches || reduceMotion.matches) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (!pointer.active) {
      pointer.sx = pointer.x;
      pointer.sy = pointer.y;
      const transform = `translate3d(${pointer.x}px,${pointer.y}px,0)`;
      if (aura) { aura.style.transform = transform; aura.classList.add('is-visible'); }
      if (ring) { ring.style.transform = transform; ring.classList.add('is-visible'); }
    }
    pointer.active = true;
  }, { passive: true });

  window.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !finePointer.matches || reduceMotion.matches) return;
    if (ring) ring.classList.add('is-pressed');
    const ripple = document.createElement('span');
    ripple.className = 'pointer-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    if (ripples.size >= 5) {
      const oldest = ripples.values().next().value;
      oldest.remove();
      ripples.delete(oldest);
    }
    ripples.add(ripple);
    document.body.appendChild(ripple);
    const remove = () => { ripple.remove(); ripples.delete(ripple); };
    ripple.addEventListener('animationend', remove, { once: true });
    // Keep cleanup bounded if CSS changes or animations are cancelled.
    setTimeout(remove, 1100);
  }, { passive: true });

  window.addEventListener('pointerup', () => { if (ring) ring.classList.remove('is-pressed'); }, { passive: true });
  document.documentElement.addEventListener('pointerleave', resetPointer);
  window.addEventListener('blur', resetPointer);
  document.addEventListener('visibilitychange', updateActivity);
  reduceMotion.addEventListener('change', updateActivity);
  finePointer.addEventListener('change', resetPointer);
  window.addEventListener('resize', () => {
    resizeNeeded = true;
    if (reduceMotion.matches) draw();
  }, { passive: true });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    field.classList.remove('is-webgl');
    program = null;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    initializeWebGL();
    updateActivity();
  });

  initializeWebGL();
  updateActivity();
})();
