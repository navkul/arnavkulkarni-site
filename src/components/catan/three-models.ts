import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Resource } from '@/lib/catan/types';

// All models are original, local geometry: the offline host needs no asset CDN.
export const TERRAIN = {
  wood: '#4f7150',
  brick: '#b36e4c',
  sheep: '#a5b779',
  wheat: '#c8aa5a',
  ore: '#879597',
  desert: '#dfc291',
};
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function material(color: string, roughness = 0.88) {
  const key = `${color}:${roughness}`;
  if (!materials.has(key))
    materials.set(
      key,
      Object.assign(new THREE.MeshStandardMaterial({ color, roughness }), {
        userData: { shared: true },
      }),
    );
  return materials.get(key)!;
}
export function mesh(geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material(color));
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}
export function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);
}
function cone(r: number, h: number, color: string, x: number, y: number, z: number, sides = 7) {
  return mesh(new THREE.ConeGeometry(r, h, sides), color, x, y, z);
}
function sphere(r: number, color: string, x: number, y: number, z: number) {
  return mesh(new THREE.IcosahedronGeometry(r, 1), color, x, y, z);
}
export function building(kind: 'settlement' | 'city', color: string) {
  const group = new THREE.Group();
  const house = (x: number, z: number, scale = 1) => {
    const part = new THREE.Group();
    part.add(box(0.3, 0.24, 0.28, color, 0, 0.12));
    const roof = new THREE.Shape();
    roof.moveTo(-0.19, 0);
    roof.lineTo(0.19, 0);
    roof.lineTo(0, 0.19);
    roof.closePath();
    const roofMesh = mesh(
      new THREE.ExtrudeGeometry(roof, { depth: 0.34, bevelEnabled: false }),
      `#${new THREE.Color(color).multiplyScalar(0.68).getHexString()}`,
      0,
      0.24,
      -0.17,
    );
    part.add(roofMesh);
    part.add(
      box(
        0.33,
        0.035,
        0.31,
        `#${new THREE.Color(color).multiplyScalar(0.52).getHexString()}`,
        0,
        0.017,
      ),
    );
    part.add(box(0.35, 0.018, 0.018, '#decfa9', 0, 0.238, 0.17));
    part.add(box(0.06, 0.13, 0.067, '#aa9575', 0.08, 0.37, -0.07));
    part.add(box(0.072, 0.12, 0.012, '#453c32', 0, 0.06, 0.146));
    part.add(box(0.05, 0.055, 0.014, '#ffe4a1', -0.105, 0.17, 0.148));
    part.position.set(x, 0, z);
    part.scale.setScalar(scale);
    group.add(part);
  };
  house(kind === 'city' ? -0.12 : 0, 0);
  if (kind === 'city') {
    house(0.18, 0.06, 0.82);
    group.add(box(0.2, 0.46, 0.22, color, 0.12, 0.23, -0.13));
    const roof = cone(0.18, 0.19, color, 0.12, 0.555, -0.13, 4);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    group.add(box(0.055, 0.095, 0.014, '#ffe4a1', 0.12, 0.36, -0.012));
  }
  return group;
}
export function robberModel() {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.23, 0.48, 10), '#303c43', 0, 0.27));
  group.add(sphere(0.145, '#283840', 0, 0.61, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 24), '#bfab7a', 0, 0.03));
  return group;
}
/** A hand-shaped mountain, with asymmetric shoulders, sharp arêtes and snow seams. */
function cragGeometry() {
  const vertices: number[] = [],
    colors: number[] = [];
  const rings = [
    { y: 0, r: 0.3, x: 0, z: 0 },
    { y: 0.095, r: 0.24, x: -0.02, z: 0.015 },
    { y: 0.245, r: 0.15, x: 0.045, z: -0.018 },
    { y: 0.42, r: 0.067, x: 0.006, z: -0.04 },
    { y: 0.56, r: 0, x: -0.037, z: -0.015 },
  ];
  const point = (level: number, segment: number) => {
    const ring = rings[level],
      angle = (segment * Math.PI) / 6;
    const irregular = 1 + 0.19 * Math.sin(segment * 2.7 + level * 0.75);
    return new THREE.Vector3(
      ring.x + Math.cos(angle) * ring.r * irregular,
      ring.y + (level > 0 && level < 4 ? Math.sin(segment * 2.1 + level) * 0.028 : 0),
      ring.z + Math.sin(angle) * ring.r * irregular,
    );
  };
  for (let level = 0; level < rings.length - 1; level++) {
    for (let segment = 0; segment < 12; segment++) {
      const a = point(level, segment),
        b = point(level, segment + 1),
        c = point(level + 1, segment),
        d = point(level + 1, segment + 1);
      for (const tri of [
        [a, c, b],
        [b, c, d],
      ]) {
        const elevation = (tri[0].y + tri[1].y + tri[2].y) / 3;
        const snow = elevation > 0.36 && segment % 5 !== 1;
        const color = new THREE.Color(
          snow ? '#e4e5d7' : elevation > 0.2 ? '#82969a' : '#586e74',
        ).multiplyScalar(0.82 + (segment % 4) * 0.08);
        for (const v of tri) {
          vertices.push(v.x, v.y, v.z);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Branch skirts make the silhouette, rather than piling smooth cones on top of one another. */
function firGeometry() {
  const profile = [
    [0.052, 0.035],
    [0.102, 0.066],
    [0.077, 0.091],
    [0.12, 0.105],
    [0.072, 0.148],
    [0.104, 0.17],
    [0.049, 0.21],
    [0.082, 0.235],
    [0.028, 0.274],
    [0.057, 0.3],
    [0.018, 0.346],
    [0, 0.41],
  ];
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    12,
  );
  const p = g.getAttribute('position'),
    colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      angle = Math.atan2(z, x);
    const asym = 1 + 0.11 * Math.sin(angle * 5 + y * 19);
    p.setXYZ(i, x * asym + 0.018 * (y / 0.41) ** 2, y, z * asym);
    const c = new THREE.Color('#355f4d').lerp(new THREE.Color('#7e9e60'), Math.min(1, y / 0.5));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Bake wool, face and legs into one reusable sheep mesh: a whole flock is one draw call. */
function sheepGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const part = (
    g: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) => {
    g.scale(sx, sy, sz).translate(x, y, z);
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    flat.deleteAttribute('uv');
    const c = new THREE.Color(color),
      values = [];
    for (let i = 0; i < flat.getAttribute('position').count; i++) values.push(c.r, c.g, c.b);
    flat.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
    parts.push(flat);
  };
  part(new THREE.SphereGeometry(0.08, 12, 8), '#f2ead6', 0, 0.105, 0, 1.4, 0.92, 0.85);
  part(new THREE.SphereGeometry(0.043, 10, 6), '#524b3b', 0.109, 0.102, 0, 0.8, 1, 0.75);
  part(new THREE.SphereGeometry(0.018, 8, 4), '#b8a990', 0.101, 0.135, 0.025, 1, 0.45, 1.1);
  part(new THREE.SphereGeometry(0.018, 8, 4), '#b8a990', 0.101, 0.135, -0.025, 1, 0.45, 1.1);
  for (const x of [-0.054, 0.054])
    for (const z of [-0.035, 0.035])
      part(new THREE.CylinderGeometry(0.01, 0.008, 0.074, 5), '#504b3b', x, 0.037, z);
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

export function landscape(resource: Resource | 'desert', seed: number) {
  const group = new THREE.Group();
  let randomSeed = seed * 9301 + 49297;
  const random = () => {
    randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) | 0;
    return (randomSeed >>> 0) / 4294967296;
  };
  type Point = { x: number; z: number; size: number };
  const points = (count: number): Point[] =>
    Array.from({ length: count }, () => {
      const a = random() * Math.PI * 2,
        r = 0.37 + Math.sqrt(random()) * 0.4;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, size: 0.7 + random() * 0.6 };
    });
  const dummy = new THREE.Object3D();
  const instances = (
    geometry: THREE.BufferGeometry,
    color: string,
    items: Point[],
    place: (p: Point, i: number) => void,
  ) => {
    const mat = geometry.hasAttribute('color')
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
      : material(color);
    const objects = new THREE.InstancedMesh(geometry, mat, items.length);
    items.forEach((p, i) => {
      dummy.position.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      place(p, i);
      dummy.updateMatrix();
      objects.setMatrixAt(i, dummy.matrix);
      objects.setColorAt(i, new THREE.Color('#ffffff').multiplyScalar(0.91 + random() * 0.14));
    });
    objects.castShadow = true;
    objects.receiveShadow = true;
    group.add(objects);
    return objects;
  };
  if (resource === 'wood') {
    const trees = points(25);
    instances(new THREE.CylinderGeometry(0.013, 0.02, 0.18, 6), '#66513a', trees, (p) => {
      dummy.position.set(p.x, 0.07, p.z);
      dummy.scale.y = p.size;
    });
    instances(firGeometry(), '#ffffff', trees, (p) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.scale.set(p.size, p.size * (0.88 + random() * 0.22), p.size);
      dummy.rotation.y = random() * 6;
    });
    instances(new THREE.IcosahedronGeometry(0.065, 1), '#688154', points(12), (p) => {
      dummy.position.set(p.x, 0.035, p.z);
      dummy.scale.set(p.size, 0.6, p.size);
    });
    // Fallen timber makes this a working forest, not just a ring of ornamental trees.
    const logs = instances(
      new THREE.CylinderGeometry(0.024, 0.027, 0.19, 8),
      '#96704b',
      points(3),
      (p) => {
        dummy.position.set(p.x, 0.033, p.z);
        dummy.rotation.z = Math.PI / 2;
        dummy.rotation.y = random() * 6;
      },
    );
    logs.castShadow = false;
  } else if (resource === 'ore') {
    const ridges = [
      { x: -0.45, z: -0.36, size: 1 },
      { x: 0.14, z: -0.58, size: 0.8 },
      { x: 0.55, z: -0.21, size: 1.12 },
      { x: 0.57, z: 0.34, size: 0.55 },
      { x: -0.6, z: 0.18, size: 0.66 },
    ];
    instances(cragGeometry(), '#ffffff', ridges, (p) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.scale.set(p.size, p.size * (0.8 + random() * 0.3), p.size);
      dummy.rotation.y = random() * 2;
    });
    instances(new THREE.TetrahedronGeometry(0.064, 0), '#889899', points(26), (p) => {
      dummy.position.set(p.x, 0.025, p.z);
      dummy.scale.set(p.size, 0.5 + random() * 0.5, p.size);
      dummy.rotation.set(random(), random() * 6, random());
    });
  } else if (resource === 'wheat') {
    const stalks: Point[] = [];
    for (let row = -8; row <= 8; row++)
      for (let n = -13; n <= 13; n++) {
        const x = n * 0.061 + (random() - 0.5) * 0.018,
          z = row * 0.087 + (random() - 0.5) * 0.012;
        if (Math.hypot(x, z) > 0.79 || Math.hypot(x, z) < 0.35) continue;
        stalks.push({ x, z, size: 0.7 + random() * 0.6 });
      }
    const stems = instances(
      new THREE.CylinderGeometry(0.003, 0.004, 0.11, 3),
      '#b69a52',
      stalks,
      (p) => {
        dummy.position.set(p.x, 0.055 * p.size, p.z);
        dummy.scale.y = p.size;
        dummy.rotation.z = 0.12;
      },
    );
    stems.castShadow = false;
    const heads = instances(new THREE.SphereGeometry(0.016, 5, 3), '#e1c575', stalks, (p) => {
      dummy.position.set(p.x + 0.007, 0.114 * p.size, p.z);
      dummy.scale.set(0.55, p.size * 1.55, 0.55);
      dummy.rotation.z = 0.12;
    });
    heads.castShadow = false;
    // Two bound sheaves beside the headland give the field a recognizable focal detail.
    instances(new THREE.CylinderGeometry(0.025, 0.048, 0.11, 9), '#ddbc69', points(2), (p) => {
      dummy.position.set(p.x, 0.056, p.z);
      dummy.rotation.z = 0.12;
    });
  } else if (resource === 'brick') {
    const clay = cragGeometry();
    const colors = clay.getAttribute('color'),
      positions = clay.getAttribute('position');
    for (let i = 0; i < colors.count; i++) {
      const y = positions.getY(i),
        c = new THREE.Color(y > 0.32 ? '#d49a69' : y > 0.13 ? '#b77350' : '#94563f');
      c.multiplyScalar(0.88 + (i % 9) * 0.016);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    instances(
      clay,
      '#ffffff',
      [
        { x: -0.49, z: -0.29, size: 1 },
        { x: 0.37, z: -0.49, size: 0.84 },
        { x: 0.58, z: 0.22, size: 0.77 },
      ],
      (p) => {
        dummy.position.set(p.x, 0, p.z);
        dummy.scale.set(p.size, p.size * 0.43, p.size * 1.2);
        dummy.rotation.y = random() * 3;
      },
    );
    instances(new THREE.BoxGeometry(0.057, 0.028, 0.032), '#b66b46', points(15), (p) => {
      dummy.position.set(p.x, 0.016, p.z);
      dummy.rotation.y = 0.3 + (Math.floor(random() * 2) * Math.PI) / 2;
    });
  } else if (resource === 'sheep') {
    instances(sheepGeometry(), '#ffffff', points(6), (p) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.y = random() * 6;
      dummy.scale.setScalar(0.78 + p.size * 0.2);
    });
    const grass = instances(new THREE.ConeGeometry(0.012, 0.042, 3), '#7d9455', points(65), (p) => {
      dummy.position.set(p.x, 0.02, p.z);
      dummy.scale.y = p.size;
    });
    grass.castShadow = false;
    const flowers = instances(new THREE.SphereGeometry(0.008, 5, 3), '#eee2b1', points(22), (p) =>
      dummy.position.set(p.x, 0.037, p.z),
    );
    flowers.castShadow = false;
  } else {
    // A low curved dune ridge catches light without looking like rounded stones.
    const dune = new THREE.CircleGeometry(0.3, 32),
      p = dune.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getY(i),
        h = Math.max(0, 1 - (x / 0.27) ** 2) * Math.max(0, 1 - (z / 0.19) ** 2) * 0.095;
      p.setXYZ(i, x, h * (0.75 + 0.25 * Math.sin(z * 12)), z * 0.64);
    }
    dune.setIndex(Array.from(dune.index!.array).reverse());
    dune.computeVertexNormals();
    instances(
      dune,
      '#d6b57c',
      [
        { x: -0.48, z: -0.23, size: 1 },
        { x: 0.46, z: 0.24, size: 0.9 },
      ],
      (p) => {
        dummy.position.set(p.x, 0.005, p.z);
        dummy.rotation.y = 0.6;
        dummy.scale.setScalar(p.size);
      },
    );
  }
  return group;
}

export function discLabel(label: string, sublabel: string, red = false, width = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(width / 256, width / 256);
  const size = 256;
  ctx.fillStyle = '#fff4d9';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c8b17c';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = red ? '#9c352a' : '#222c28';
  ctx.font = `700 ${sublabel ? 102 : 86}px Georgia`;
  ctx.fillText(label, size / 2, sublabel ? 109 : 128);
  ctx.font = /^[•]+$/.test(sublabel) ? '32px sans-serif' : 'bold 44px sans-serif';
  ctx.fillText(sublabel, size / 2, 184);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(0.29, 40),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  top.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.055, 40), '#d7bd86', 0, 0.025));
  top.position.y = 0.058;
  group.add(top);
  return group;
}
export function portModel(resource: Resource | 'any') {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++)
    group.add(box(0.65, 0.04, 0.09, i % 2 ? '#ae8c5e' : '#c2a271', 0, 0.045, (i - 2) * 0.105));
  [-0.24, 0.24].forEach((x) =>
    [-0.2, 0.2].forEach((z) =>
      group.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), '#80674b', x, 0, z)),
    ),
  );
  const boat = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 0.37);
  hullShape.bezierCurveTo(-0.14, 0.2, -0.16, -0.12, -0.07, -0.3);
  hullShape.quadraticCurveTo(0, -0.35, 0.07, -0.3);
  hullShape.bezierCurveTo(0.16, -0.12, 0.14, 0.2, 0, 0.37);
  const hull = mesh(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 0.085,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      curveSegments: 10,
    }),
    '#654b35',
  );
  hull.rotation.x = Math.PI / 2;
  hull.position.y = 0.095;
  boat.add(hull);
  const deck = mesh(new THREE.ShapeGeometry(hullShape, 10), '#b59462');
  deck.rotation.x = -Math.PI / 2;
  deck.scale.set(0.87, 0.91, 1);
  deck.position.y = 0.116;
  boat.add(deck);
  for (let i = -2; i <= 2; i++)
    boat.add(box(0.2 - Math.abs(i) * 0.018, 0.012, 0.026, '#dbc28b', 0, 0.128, i * 0.08));
  boat.add(mesh(new THREE.CylinderGeometry(0.012, 0.019, 0.67, 8), '#745839', 0, 0.39));
  const sailGeometry = new THREE.PlaneGeometry(1, 1, 6, 6),
    p = sailGeometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5,
      v = p.getY(i) + 0.5;
    p.setXYZ(
      i,
      0.29 * u * (1 - v),
      0.245 + v * 0.46,
      Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.075,
    );
  }
  sailGeometry.computeVertexNormals();
  const sailMesh = new THREE.Mesh(
    sailGeometry,
    new THREE.MeshStandardMaterial({ color: '#f3e5bf', side: THREE.DoubleSide, roughness: 0.95 }),
  );
  boat.add(sailMesh);
  const jib = new THREE.Shape();
  jib.moveTo(-0.018, 0.65);
  jib.lineTo(-0.19, 0.25);
  jib.lineTo(-0.018, 0.27);
  jib.closePath();
  boat.add(
    new THREE.Mesh(
      new THREE.ShapeGeometry(jib),
      new THREE.MeshStandardMaterial({ color: '#ded0aa', side: THREE.DoubleSide, roughness: 1 }),
    ),
  );
  const boom = mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.28, 5), '#886e45', 0.125, 0.24);
  boom.rotation.z = Math.PI / 2;
  boat.add(boom);
  const pennant = new THREE.Shape();
  pennant.moveTo(0, 0.72);
  pennant.lineTo(0.11, 0.69);
  pennant.lineTo(0, 0.665);
  pennant.closePath();
  boat.add(
    new THREE.Mesh(
      new THREE.ShapeGeometry(pennant),
      new THREE.MeshStandardMaterial({ color: '#b66142', side: THREE.DoubleSide, roughness: 1 }),
    ),
  );
  boat.position.set(0.36, 0, 0.12);
  boat.rotation.y = -0.5;
  group.add(boat);
  const badge = discLabel(
    resource === 'any' ? '3:1' : '2:1',
    resource === 'any' ? 'ANY' : resource.toUpperCase(),
  );
  badge.name = 'port-label';
  badge.scale.setScalar(0.95);
  badge.position.set(-0.08, 0.12, -0.1);
  group.add(badge);
  if (resource !== 'any') {
    const crate = box(0.12, 0.12, 0.12, TERRAIN[resource], -0.25, 0.13, 0.14);
    group.add(crate);
  }
  return group;
}
export function disposeTree(root: THREE.Object3D, full = false) {
  const geometries = new Set<THREE.BufferGeometry>(),
    mats = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(
        (mat: THREE.Material) => {
          mats.add(mat);
          for (const value of Object.values(mat))
            if (value instanceof THREE.Texture) textures.add(value);
        },
      );
    }
  });
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  mats.forEach((m) => {
    if (full || !m.userData.shared) m.dispose();
  });
  if (full) materials.clear();
}
