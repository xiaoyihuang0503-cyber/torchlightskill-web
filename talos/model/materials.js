import * as THREE from '../vendor/three/three.module.js';

// 所有表面均在本地生成；修改配色、噪声参数即可继续精修，无外部贴图依赖。
const TEXTURE_SIZE = 256;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value, min = 0, max = 255) => Math.min(max, Math.max(min, value));
const mix = (a, b, amount) => a + (b - a) * amount;

function makeNoise(random, resolution) {
  const grid = Float32Array.from({ length: resolution ** 2 }, () => random());
  return (u, v) => {
    const x = u * resolution;
    const y = v * resolution;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const sx = x - ix;
    const sy = y - iy;
    const fx = sx * sx * (3 - 2 * sx);
    const fy = sy * sy * (3 - 2 * sy);
    const at = (dx, dy) => grid[((iy + dy) % resolution) * resolution + ((ix + dx) % resolution)];
    return mix(mix(at(0, 0), at(1, 0), fx), mix(at(0, 1), at(1, 1), fx), fy);
  };
}

const SURFACES = {
  stone: { rgb: [120, 122, 117], grain: 21, relief: 34, roughness: 236 },
  slab: { rgb: [108, 112, 110], grain: 17, relief: 23, roughness: 224 },
  iron: { rgb: [118, 124, 124], grain: 18, relief: 20, roughness: 177, metal: true },
  ironEdge: { rgb: [153, 157, 152], grain: 11, relief: 12, roughness: 149, metal: true },
  rust: { rgb: [127, 82, 49], grain: 27, relief: 38, roughness: 243 },
  brass: { rgb: [158, 129, 73], grain: 15, relief: 14, roughness: 168, metal: true },
  warmStone: { rgb: [130, 105, 75], grain: 26, relief: 31, roughness: 239 },
};

function buildSurface(kind, seed, textures) {
  if (typeof document === 'undefined') return {};
  const random = seededRandom(seed);
  const config = SURFACES[kind];
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEXTURE_SIZE;
    return canvas;
  });
  const contexts = canvases.map((canvas) => canvas.getContext('2d'));
  if (contexts.some((context) => !context)) return {};
  const images = contexts.map((context) => context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE));
  const coarse = makeNoise(random, 5);
  const medium = makeNoise(random, 17);
  const fine = makeNoise(random, 61);
  const stains = makeNoise(random, 9);

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const broad = coarse(u, v) - 0.5;
      const detail = medium(u, v) - 0.5;
      const micro = fine(u, v) - 0.5;
      const grit = random() - 0.5;
      const value = broad * 40 + detail * 24 + micro * 12 + grit * config.grain;
      const oxidized = config.metal
        ? clamp((stains(u, v) + detail * 0.35 - 0.61) * 3.3, 0, 0.75)
        : 0;
      const metalStreak = config.metal ? Math.sin(y * 1.87 + broad * 2) * 2.5 : 0;
      const pitting = grit > 0.465 ? -27 : 0;
      const index = (y * TEXTURE_SIZE + x) * 4;
      const rustColor = kind === 'brass' ? [64, 99, 83] : [126, 75, 42];
      for (let channel = 0; channel < 3; channel++) {
        images[0].data[index + channel] = clamp(mix(config.rgb[channel] + value + metalStreak + pitting, rustColor[channel] + micro * 26, oxidized));
        images[1].data[index + channel] = clamp(132 + broad * config.relief + detail * 37 + micro * 24 + grit * 21 + oxidized * 33 + pitting);
        images[2].data[index + channel] = clamp(config.roughness + detail * 22 + micro * 12 + oxidized * 65);
      }
      images.forEach((image) => { image.data[index + 3] = 255; });
    }
  }
  contexts.forEach((context, index) => context.putImageData(images[index], 0, 0));

  // 细裂隙和磨痕在颜色与凹凸中同步出现，不把石材画成重复的砖墙。
  if (!config.metal) {
    const crackCount = kind === 'slab' ? 7 : 13;
    for (let i = 0; i < crackCount; i++) {
      let x = random() * TEXTURE_SIZE;
      let y = random() * TEXTURE_SIZE;
      const angle = random() * Math.PI * 2;
      const path = [{ x, y }];
      for (let step = 0; step < 3 + Math.floor(random() * 4); step++) {
        x += Math.cos(angle) * (4 + random() * 11) + (random() - 0.5) * 8;
        y += Math.sin(angle) * (4 + random() * 11) + (random() - 0.5) * 8;
        path.push({ x, y });
      }
      [0, 1].forEach((layer) => {
        const context = contexts[layer];
        context.strokeStyle = layer === 0 ? 'rgba(32, 32, 29, 0.26)' : 'rgba(39, 39, 39, 0.48)';
        context.lineWidth = layer === 0 ? 0.7 : 1;
        context.beginPath();
        path.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
        context.stroke();
      });
    }
  } else {
    for (let i = 0; i < 75; i++) {
      const x = random() * TEXTURE_SIZE;
      const y = random() * TEXTURE_SIZE;
      const length = 2 + random() * 24;
      const drift = (random() - 0.5) * 3;
      contexts.forEach((context, layer) => {
        context.strokeStyle = layer === 0 ? 'rgba(205, 203, 184, 0.12)' : layer === 1 ? 'rgba(80, 80, 80, 0.28)' : 'rgba(100, 100, 100, 0.25)';
        context.lineWidth = 0.6;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + length, y + drift);
        context.stroke();
      });
    }
  }

  const maps = canvases.map((canvas, index) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `talos-${kind}-${['color', 'height', 'roughness'][index]}`;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
    textures.add(texture);
    return texture;
  });
  return { map: maps[0], bumpMap: maps[1], roughnessMap: maps[2] };
}

/** 返回独立可编辑的材质集合。调用 dispose() 可释放全部贴图和材质。 */
export function createMaterials({ seed = 14 } = {}) {
  const textures = new Set();
  const surface = {};
  Object.keys(SURFACES).forEach((kind, index) => {
    surface[kind] = buildSurface(kind, Number(seed) + index * 104729, textures);
  });
  const standard = (name, parameters) => {
    const material = new THREE.MeshStandardMaterial(parameters);
    material.name = `talos-${name}`;
    return material;
  };
  const materials = {
    stone: standard('stone', { color: 0xd2d5d2, ...surface.stone, roughness: 0.94, metalness: 0.02, bumpScale: 0.055 }),
    stoneDark: standard('stone-dark', { color: 0x939b98, ...surface.stone, roughness: 0.97, metalness: 0.025, bumpScale: 0.055 }),
    slab: standard('slab', { color: 0xa4a8a5, ...surface.slab, roughness: 0.91, metalness: 0.055, bumpScale: 0.035 }),
    iron: standard('iron', { color: 0xb9c1bf, ...surface.iron, roughness: 0.78, metalness: 0.68, bumpScale: 0.018 }),
    ironEdge: standard('iron-edge', { color: 0xc4c8c1, ...surface.ironEdge, roughness: 0.68, metalness: 0.73, bumpScale: 0.009 }),
    rust: standard('rust', { color: 0xc1aaa0, ...surface.rust, roughness: 0.97, metalness: 0.17, bumpScale: 0.025 }),
    brass: standard('brass', { color: 0xe0d2a3, ...surface.brass, roughness: 0.71, metalness: 0.65, bumpScale: 0.012 }),
    void: standard('void', { color: 0x141918, roughness: 1, metalness: 0 }),
    warmStone: standard('warm-stone', { color: 0xccb899, ...surface.warmStone, roughness: 1, metalness: 0, bumpScale: 0.07 }),
    flame: new THREE.MeshBasicMaterial({ name: 'talos-flame', color: 0xffbe59, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ name: 'talos-glow', color: 0xff8a32, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    selection: new THREE.MeshBasicMaterial({ name: 'talos-selection', color: 0xb46cff, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  };
  materials.dispose = () => {
    Object.values(materials).forEach((material) => {
      if (material?.isMaterial) material.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    textures.clear();
  };
  return materials;
}

/** 半透明背景的象牙白牢房编号；贴图由调用方负责 dispose。Node 环境返回 null。 */
export function makeLabelTexture(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '72px Georgia, "Times New Roman", serif';
  context.shadowColor = 'rgba(0, 0, 0, 0.85)';
  context.shadowBlur = 5;
  context.shadowOffsetY = 2;
  context.fillStyle = '#c9c6b5';
  context.fillText(String(text), 128, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `talos-label-${text}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
