import * as THREE from 'three';
import type { Board, Resource } from '@/lib/catan/types';
import { TERRAIN } from './three-models';

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
function canvas(size: number) {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  return { element, ctx: element.getContext('2d')! };
}
function texture(element: HTMLCanvasElement) {
  const map = new THREE.CanvasTexture(element);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Quiet, scale-aware pigment. Geometry carries the relief; these maps describe land use. */
export function terrainMaterial(kind: Resource | 'desert') {
  const { element, ctx } = canvas(512),
    random = seeded(kind.charCodeAt(0) * 123);
  ctx.fillStyle = TERRAIN[kind];
  ctx.fillRect(0, 0, 512, 512);
  const palettes = {
    wood: ['#426344', '#6c8054', '#4c6e49'],
    sheep: ['#a9bd7d', '#bac991', '#899e67'],
    wheat: ['#d8bb73', '#cfac61', '#b79951'],
    ore: ['#8b9796', '#aab2ab', '#748586'],
    brick: ['#bd805c', '#cb9570', '#a97255'],
    desert: ['#e2c68f', '#d8b980', '#ead4a2'],
  };
  // Broad translucent glazes replace the previous high-contrast noise carpet.
  for (let i = 0; i < 45; i++) {
    const x = random() * 512,
      y = random() * 512,
      r = 25 + random() * 85;
    const glaze = ctx.createRadialGradient(x, y, 0, x, y, r);
    glaze.addColorStop(0, palettes[kind][i % 3] + '99');
    glaze.addColorStop(1, palettes[kind][i % 3] + '00');
    ctx.fillStyle = glaze;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.lineCap = 'round';
  if (kind === 'wood') {
    ctx.strokeStyle = '#93846138';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(70, 510);
    ctx.bezierCurveTo(190, 370, 360, 200, 275, -20);
    ctx.stroke();
    ctx.strokeStyle = '#b3a17a24';
    ctx.lineWidth = 8;
    ctx.stroke();
    for (let i = 0; i < 170; i++) {
      const x = random() * 512,
        y = random() * 512;
      ctx.strokeStyle = i % 2 ? '#b4b78135' : '#1f483b35';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 3, y + 4);
      ctx.lineTo(x, y - 3);
      ctx.lineTo(x + 3, y + 3);
      ctx.stroke();
    }
  } else if (kind === 'sheep') {
    for (let i = 0; i < 240; i++) {
      const x = random() * 512,
        y = random() * 512;
      ctx.strokeStyle = i % 2 ? '#698a4940' : '#d1dc9d66';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x + 1, y - 4);
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x - 3, y - 2);
      ctx.stroke();
    }
  }
  if (kind === 'wheat') {
    for (let row = -3; row < 25; row++) {
      const y = row * 23;
      ctx.strokeStyle = '#92773d45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(130, y + 7, 340, y - 4, 512, y + 5);
      ctx.stroke();
      ctx.strokeStyle = '#f0d49180';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(0, y + 8);
      ctx.bezierCurveTo(130, y + 15, 340, y + 4, 512, y + 13);
      ctx.stroke();
    }
  } else if (kind === 'desert') {
    for (let i = 0; i < 22; i++) {
      ctx.strokeStyle = i % 2 ? '#f1dbaa88' : '#b9945c35';
      ctx.lineWidth = i % 2 ? 2 : 1;
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 8) {
        const y = i * 27 + Math.sin(x / 85 + i * 0.2) * 16;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'ore' || kind === 'brick') {
    for (let i = 0; i < 26; i++) {
      const x = random() * 512,
        y = random() * 512;
      ctx.strokeStyle = kind === 'ore' ? '#c0c7bd55' : '#e1b58a66';
      ctx.lineWidth = 1 + random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y - 7);
      ctx.lineTo(x + 26, y - 4);
      ctx.lineTo(x + 44, y - 15);
      ctx.stroke();
    }
  }
  // Microtexture is deliberately low contrast, so it does not shimmer during orbit.
  for (let i = 0; i < 1700; i++) {
    ctx.fillStyle = palettes[kind][i % 3] + '30';
    ctx.fillRect(random() * 512, random() * 512, 0.6 + random(), 1 + random() * 2);
  }
  const map = texture(element);
  map.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.93,
    bumpMap: map,
    bumpScale: 0.012,
  });
  mat.userData.authoredTerrain = true;
  return mat;
}

export function ocean(board: Board, radius: number) {
  const group = new THREE.Group(),
    { element, ctx } = canvas(1024),
    random = seeded(814);
  const image = ctx.createImageData(1024, 1024);
  for (let y = 0; y < 1024; y++)
    for (let x = 0; x < 1024; x++) {
      const wave =
        Math.sin((x / 1024) * Math.PI * 8 + Math.sin((y / 1024) * Math.PI * 6) * 2.3) +
        Math.sin((y / 1024) * Math.PI * 10 + (x / 1024) * Math.PI * 4) +
        Math.sin((x / 1024) * Math.PI * 26 - (y / 1024) * Math.PI * 22) * 0.35;
      const noise = (random() - 0.5) * 2,
        n = (wave + 2) * 1.8;
      const i = (y * 1024 + x) * 4;
      image.data[i] = 30 + n + noise;
      image.data[i + 1] = 104 + n * 1.25 + noise;
      image.data[i + 2] = 113 + n * 0.95 + noise;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 1800; i++) {
    const x = random() * 1024,
      y = random() * 1024,
      w = 4 + random() * 23;
    ctx.strokeStyle = `rgba(214,240,220,${0.025 + random() * 0.07})`;
    ctx.lineWidth = 0.5 + random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * 0.5, y - 3, x + w, y);
    ctx.stroke();
  }
  const map = texture(element);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 5);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 10, radius * 10),
    new THREE.MeshStandardMaterial({
      map,
      bumpMap: map,
      bumpScale: 0.017,
      roughness: 0.52,
      metalness: 0.06,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.34;
  water.receiveShadow = true;
  group.add(water);
  const coast = canvas(1024),
    extent = radius * 2.25,
    scale = 1024 / extent;
  coast.ctx.lineCap = 'round';
  coast.ctx.lineJoin = 'round';
  for (const edge of board.edges.filter((e) => e.hexes.length === 1)) {
    const a = board.vertices[edge.a],
      b = board.vertices[edge.b];
    for (const [width, alpha] of [
      [0.45, 0.12],
      [0.23, 0.16],
      [0.085, 0.36],
    ]) {
      coast.ctx.strokeStyle = `rgba(227,246,220,${alpha})`;
      coast.ctx.lineWidth = width * scale;
      coast.ctx.beginPath();
      coast.ctx.moveTo(512 + a.x * scale, 512 + a.y * scale);
      coast.ctx.lineTo(512 + b.x * scale, 512 + b.y * scale);
      coast.ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const t = random(),
        x = a.x + (b.x - a.x) * t + (random() - 0.5) * 0.4,
        z = a.y + (b.y - a.y) * t + (random() - 0.5) * 0.4;
      coast.ctx.fillStyle = `rgba(246,252,235,${0.1 + random() * 0.32})`;
      coast.ctx.beginPath();
      coast.ctx.ellipse(
        512 + x * scale,
        512 + z * scale,
        0.7 + random() * 2,
        0.5 + random(),
        0,
        0,
        Math.PI * 2,
      );
      coast.ctx.fill();
    }
  }
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(extent, extent),
    new THREE.MeshBasicMaterial({
      map: texture(coast.element),
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = -0.325;
  group.add(foam);
  // A continuous, banded cliff is legible as geology rather than a necklace of stones.
  const positions: number[] = [],
    colors: number[] = [];
  const strata = [
    { y: -0.31, out: 0.1, color: '#5f726e' },
    { y: -0.2, out: 0.065, color: '#738077' },
    { y: -0.13, out: 0.045, color: '#92947e' },
    { y: -0.06, out: 0.03, color: '#818875' },
    { y: 0.055, out: 0.012, color: '#a39f80' },
    { y: 0.11, out: 0, color: '#8d9476' },
  ];
  for (const edge of board.edges.filter((e) => e.hexes.length === 1)) {
    const a = board.vertices[edge.a],
      b = board.vertices[edge.b];
    const mx = (a.x + b.x) / 2,
      mz = (a.y + b.y) / 2,
      length = Math.hypot(mx, mz),
      nx = mx / length,
      nz = mz / length;
    const point = (t: number, l: number) => {
      const x = a.x + (b.x - a.x) * t,
        z = a.y + (b.y - a.y) * t,
        layer = strata[l];
      const jag = 0.048 * Math.sin(x * 27 + z * 19 + l * 0.45) * Math.sin(Math.PI * t);
      return new THREE.Vector3(
        x + nx * (layer.out + jag),
        layer.y + jag * 0.35,
        z + nz * (layer.out + jag),
      );
    };
    for (let seg = 0; seg < 5; seg++)
      for (let l = 0; l < strata.length - 1; l++) {
        const a1 = point(seg / 5, l),
          a2 = point((seg + 1) / 5, l),
          b1 = point(seg / 5, l + 1),
          b2 = point((seg + 1) / 5, l + 1);
        const color = new THREE.Color(strata[l].color).multiplyScalar(0.9 + (seg % 3) * 0.06);
        for (const tri of [
          [a1, a2, b1],
          [a2, b2, b1],
        ])
          for (const v of tri) {
            positions.push(v.x, v.y, v.z);
            colors.push(color.r, color.g, color.b);
          }
      }
  }
  const cliffGeometry = new THREE.BufferGeometry();
  cliffGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cliffGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  cliffGeometry.computeVertexNormals();
  const cliff = new THREE.Mesh(
    cliffGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
  );
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  group.add(cliff);
  return group;
}
