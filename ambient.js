(() => {
  'use strict';

  const field = document.querySelector('.ambient-field');
  const canvas = document.getElementById('fluid-background');
  if (!field || !canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const traces = [];
  const traceUniforms = new Float32Array(24);
  const ageUniforms = new Float32Array(6);
  let lastPointer = null;
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
    uniform vec4 uTraces[6];
    uniform float uAges[6];
    uniform float uTime;

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
      for (int i = 0; i < 3; i++) {
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
      float t = uTime * 0.018;
      // Quiet charcoal material, with broad light variation rather than bright contours.
      float material = fbm(p * 0.8 + vec2(t, -t * 0.3));
      float shade = 0.012 + material * 0.019;
      shade += exp(-dot(p * vec2(0.6, 1.0), p * vec2(0.6, 1.0))) * 0.012;
      float ink = 0.0;
      for (int i = 0; i < 6; i++) {
        float age = uAges[i];
        if (age < 1.8) {
          vec2 origin = (uTraces[i].xy - 0.5) * vec2(aspect, 1.0);
          vec2 direction = uTraces[i].zw;
          vec2 delta = p - origin - direction * age * 0.026;
          vec2 local = vec2(dot(delta, direction), dot(delta, vec2(-direction.y, direction.x)));
          float radius = 0.044 + age * 0.028;
          float eddy = noise(local * 19.0 + vec2(float(i) * 4.1, age * 0.6));
          local.y += (eddy - 0.5) * (0.025 + age * 0.015);
          float body = exp(-pow(local.x / (radius * 1.9), 2.0) - pow(local.y / radius, 2.0) * 2.0);
          float fade = (1.0 - smoothstep(0.05, 1.8, age)) * smoothstep(0.0, 0.07, age);
          ink += body * fade * (0.45 + eddy * 0.55) * 0.032;
        }
      }
      shade += min(ink, 0.065);
      gl_FragColor = vec4(vec3(shade), 1.0);
    }
  `;

  function resetPointer() {
    lastPointer = null;
    traces.length = 0;
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
        traces: gl.getUniformLocation(program, 'uTraces[0]'),
        ages: gl.getUniformLocation(program, 'uAges[0]'),
        time: gl.getUniformLocation(program, 'uTime'),
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
    const now = performance.now();
    ageUniforms.fill(2);
    traceUniforms.fill(0);
    traces.forEach((trace, index) => {
      traceUniforms.set([trace.x / innerWidth, 1 - trace.y / innerHeight, trace.dx, -trace.dy], index * 4);
      ageUniforms[index] = (now - trace.born) / 1000;
    });
    gl.uniform4fv(locations.traces, traceUniforms);
    gl.uniform1fv(locations.ages, ageUniforms);
    gl.uniform1f(locations.time, elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function animate(timestamp) {
    frame = 0;
    if (document.hidden || reduceMotion.matches) return;
    if (!previous || timestamp - previous >= 1000 / 45) {
      const delta = previous ? Math.min((timestamp - previous) / 1000, 0.1) : 1 / 30;
      previous = timestamp;
      elapsed += delta;
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
      draw();
    } else if (!document.hidden) {
      frame = requestAnimationFrame(animate);
    }
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches || reduceMotion.matches) return;
    const now = performance.now();
    const point = { x: event.clientX, y: event.clientY, time: now };
    if (!lastPointer || now - lastPointer.time > 350) {
      lastPointer = point;
      return;
    }
    const dx = point.x - lastPointer.x;
    const dy = point.y - lastPointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) return;
    // Short-lived marks follow the actual movement; no separate cursor or click animation.
    const steps = Math.min(3, Math.ceil(distance / 32));
    for (let index = 1; index <= steps; index++) {
      traces.push({ x: lastPointer.x + dx * index / steps, y: lastPointer.y + dy * index / steps, dx: dx / distance, dy: dy / distance, born: now });
    }
    if (traces.length > 6) traces.splice(0, traces.length - 6);
    lastPointer = point;
  }, { passive: true });

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
