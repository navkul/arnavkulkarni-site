import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  BUILD_DURATION_MS,
  DICE_DURATION_MS,
  DICE_VISIBLE_MS,
  OPENING_REVEAL_MS,
  ROBBER_DURATION_MS,
  PRODUCTION_HEX_MS,
  PRODUCTION_CAMERA_MS,
  PRODUCTION_RETURN_MS,
} from '@/lib/catan/motion-timing';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BoardProps } from './board';
import { ocean, terrainMaterial } from './three-textures';
import { PLAYER_COLORS } from '@/lib/catan/types';
import {
  mesh,
  box,
  building,
  landscape,
  robberModel,
  discLabel,
  portModel,
  disposeTree,
} from './three-models';

const SURFACE = 0.22;
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
type Target = { kind: 'vertex' | 'edge' | 'hex'; id: number };
export function createIsland(host: HTMLElement, initial: BoardProps, fail: () => void) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D Catan island');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.className = 'ct3d-canvas';
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = 1.02;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.65;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  scene.add(new THREE.HemisphereLight('#fff8de', '#496760', 1.45));
  const sun = new THREE.DirectionalLight('#fff0cb', 2.5);
  sun.position.set(-5, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.normalBias = 0.013;
  sun.shadow.radius = 2;
  sun.shadow.bias = -0.00005;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#d8edf1', 0.75);
  fill.position.set(6, 4, -8);
  scene.add(fill);
  const island = new THREE.Group(),
    pieces = new THREE.Group(),
    targets = new THREE.Group(),
    ghosts = new THREE.Group();
  scene.add(island, pieces, targets, ghosts);
  let props = initial;
  let serverEpoch = initial.now || Date.now();
  let performanceEpoch = performance.now();
  const serverTime = () => serverEpoch + performance.now() - performanceEpoch;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tiles = new Map<
    number,
    {
      root: THREE.Group;
      terrain: THREE.Group;
      token?: THREE.Group;
      glow: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    }
  >();
  const placed = new Map<string, THREE.Object3D>();
  const animations: { object: THREE.Object3D; start: number; kind: 'drop' | 'grow'; y: number }[] =
    [];
  const pickMeshes: THREE.Object3D[] = [];
  const vector = new THREE.Vector3(),
    raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  let hover: Target | undefined,
    frame = 0,
    disposed = false,
    boardKey = '',
    targetKey = '',
    pieceKey = '',
    lastDice = '',
    dirty = true,
    visualKey = '',
    hadDynamicFrame = false,
    renderOffscreen = true,
    lastFrame = 0,
    animationPixelRatio = Math.min(window.devicePixelRatio, 2.5),
    fastFrames = 0,
    slowFrames = 0,
    wakeTimer: ReturnType<typeof setTimeout> | undefined;
  const robber = robberModel(),
    robberFrom = new THREE.Vector3(),
    robberTo = new THREE.Vector3();
  let robberAt = 0,
    lastRobber = -1;
  let size = { width: 1, height: 1 },
    radius = 6,
    visible = true;
  const dice = new THREE.Group();
  scene.add(dice);
  dice.visible = false;
  const dieModels: THREE.Group[] = [];
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d')!,
    gradient = shadowContext.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(28,35,29,.55)');
  gradient.addColorStop(1, 'rgba(28,35,29,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 64, 64);
  const contactMap = new THREE.CanvasTexture(shadowCanvas);
  const diceContacts = [0, 1].map(() => {
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: contactMap,
        transparent: true,
        depthWrite: false,
        opacity: 0.6,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.visible = false;
    scene.add(contact);
    return contact;
  });
  let productionVisits: { hex: number; at: number }[] = [];
  let productionCamera: { id: string; position: THREE.Vector3; target: THREE.Vector3 } | undefined;
  let canceledProduction = '';
  const focusPosition = new THREE.Vector3(),
    focusTarget = new THREE.Vector3();
  const smooth = (t: number) => {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  };
  function cancelProductionCamera() {
    canceledProduction = props.production?.id ?? '';
    productionCamera = undefined;
  }
  controls.addEventListener('start', cancelProductionCamera);
  let anchorNodes: HTMLElement[] = [];
  const refreshAnchors = () => {
    anchorNodes = Array.from(host.querySelectorAll<HTMLElement>('[data-world-x]'));
    invalidate();
  };
  const anchorObserver = new MutationObserver(refreshAnchors);
  anchorObserver.observe(host, { childList: true, subtree: true });
  function schedule() {
    if (!disposed && !frame && (visible || renderOffscreen) && !document.hidden)
      frame = requestAnimationFrame(tick);
  }
  function isInViewport() {
    const bounds = host.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.bottom > 0 &&
      bounds.right > 0 &&
      bounds.top < window.innerHeight &&
      bounds.left < window.innerWidth
    );
  }
  function invalidate() {
    // Full-page captures and layout transitions can leave a stale non-intersecting
    // observer entry. Real input/state changes must be able to wake a visible scene.
    if (!visible) visible = isInViewport();
    dirty = true;
    clearTimeout(wakeTimer);
    schedule();
  }
  controls.addEventListener('change', invalidate);
  const onVisibility = () => {
    if (!document.hidden) invalidate();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', invalidate);

  const diagnostics =
    process.env.NODE_ENV === 'development'
      ? {
          samples: [] as {
            at: number;
            cpuMs: number;
            calls: number;
            triangles: number;
            shadow: boolean;
            pixelRatio: number;
            diceVisible: boolean;
          }[],
          reset() {
            this.samples.length = 0;
          },
          state() {
            return {
              frame,
              visible,
              dirty,
              renderOffscreen,
              disposed,
              time: serverTime(),
              diceEvent: props.diceEvent,
              lastDice,
              cameraPosition: camera.position.toArray(),
              cameraTarget: controls.target.toArray(),
              productionVisits,
              documentHidden: document.hidden,
            };
          },
        }
      : null;
  if (diagnostics)
    Object.defineProperty(host, '__catanGraphics', { value: diagnostics, configurable: true });
  function frameCamera() {
    invalidate();
    cancelProductionCamera();
    const aspect = size.width / size.height;
    // Fit actual land and harbor extents rather than a padded bounding sphere.
    // Nearly straight-on azimuth keeps the rows easy to read on compact tables.
    const direction = new THREE.Vector3(
      0.025,
      aspect < 1 ? 0.89 : 0.81,
      aspect < 1 ? 0.455 : 0.586,
    ).normalize();
    controls.target.set(0, 0.1, 0);
    const points = props.board.vertices.flatMap((v) => {
      const n = Math.hypot(v.x, v.y) || 1;
      return [-0.45, 1.15].map(
        (y) => new THREE.Vector3(v.x + (v.x / n) * 0.95, y, v.y + (v.y / n) * 0.95),
      );
    });
    let low = radius,
      high = radius * 12;
    for (let attempt = 0; attempt < 18; attempt++) {
      const distance = (low + high) / 2;
      camera.position.copy(controls.target).addScaledVector(direction, distance);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      const fits = points.every((point) => {
        vector.copy(point).project(camera);
        return Math.abs(vector.x) < 0.92 && Math.abs(vector.y) < 0.88;
      });
      if (fits) high = distance;
      else low = distance;
    }
    camera.position.copy(controls.target).addScaledVector(direction, high);
    camera.lookAt(controls.target);
    controls.minDistance = radius * 1.35;
    controls.maxDistance = radius * 5;
    controls.update();
  }
  const resize = new ResizeObserver(() => {
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    size = { width: bounds.width, height: bounds.height };
    renderer.setSize(size.width, size.height, false);
    renderOffscreen = true;
    invalidate();
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    frameCamera();
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting || isInViewport();
    if (visible) invalidate();
    else if (dirty) {
      renderOffscreen = true;
      schedule();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  intersection.observe(host);
  function clearGroup(group: THREE.Group) {
    disposeTree(group);
    group.clear();
  }
  function mergeStatic(root: THREE.Group) {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const buckets = new Map<
      string,
      {
        material: THREE.Material;
        nodes: THREE.Mesh[];
        cast: boolean;
        receive: boolean;
        colored: boolean;
      }
    >();
    root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        Array.isArray(object.material) ||
        object.material.transparent
      )
        return;
      const mat = object.material;
      const colored =
        mat instanceof THREE.MeshStandardMaterial &&
        !mat.map &&
        !mat.normalMap &&
        !mat.bumpMap &&
        !mat.alphaMap;
      const materialKey = colored
        ? `solid:${mat.roughness}:${mat.metalness}:${mat.side}`
        : mat.uuid;
      const attributes = Object.keys(object.geometry.attributes)
        .filter((key) => key !== 'color')
        .sort()
        .join(',');
      const key = `${materialKey}:${object.castShadow}:${object.receiveShadow}:${attributes}`;
      if (!buckets.has(key))
        buckets.set(key, {
          material: mat,
          nodes: [],
          cast: object.castShadow,
          receive: object.receiveShadow,
          colored,
        });
      buckets.get(key)!.nodes.push(object);
    });
    for (const batch of buckets.values()) {
      if (batch.nodes.length < 2) continue;
      const copies = batch.nodes.map((node) => {
        const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
        geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld));
        if (batch.colored) {
          const mat = node.material as THREE.MeshStandardMaterial,
            existing = geometry.getAttribute('color'),
            colors = new Float32Array(geometry.getAttribute('position').count * 3);
          for (let i = 0; i < colors.length / 3; i++) {
            colors[i * 3] = mat.color.r * (existing && mat.vertexColors ? existing.getX(i) : 1);
            colors[i * 3 + 1] = mat.color.g * (existing && mat.vertexColors ? existing.getY(i) : 1);
            colors[i * 3 + 2] = mat.color.b * (existing && mat.vertexColors ? existing.getZ(i) : 1);
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        return geometry;
      });
      const geometry = mergeGeometries(copies, false);
      copies.forEach((copy) => copy.dispose());
      if (!geometry) continue;
      let combinedMaterial = batch.material;
      if (batch.colored) {
        const mat = (batch.material as THREE.MeshStandardMaterial).clone();
        mat.color.set('#ffffff');
        mat.vertexColors = true;
        mat.userData.shared = false;
        combinedMaterial = mat;
      }
      const combined = new THREE.Mesh(geometry, combinedMaterial);
      combined.castShadow = batch.cast;
      combined.receiveShadow = batch.receive;
      root.add(combined);
      batch.nodes.forEach((node) => {
        node.removeFromParent();
        node.geometry.dispose();
      });
    }
  }
  function rebuild() {
    clearGroup(island);
    tiles.clear();
    radius = Math.max(...props.board.vertices.map((v) => Math.hypot(v.x, v.y))) + 1.45;
    island.add(ocean(props.board, radius));
    const shadowRadius = radius + 0.5;
    sun.shadow.camera.left = -shadowRadius;
    sun.shadow.camera.right = shadowRadius;
    sun.shadow.camera.top = shadowRadius;
    sun.shadow.camera.bottom = -shadowRadius;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 32;
    sun.shadow.camera.updateProjectionMatrix();
    const pigments = new Map<string, THREE.MeshStandardMaterial>();
    for (const hex of props.board.hexes) {
      const root = new THREE.Group();
      root.position.set(hex.x, 0, hex.y);
      const tile = mesh(new THREE.CylinderGeometry(0.982, 1, 0.43, 6), '#4f5749', 0, -0.105);
      const stratum = mesh(new THREE.CylinderGeometry(0.99, 0.994, 0.09, 6), '#73745a', 0, -0.13);
      root.add(stratum);
      const rim = mesh(new THREE.CylinderGeometry(0.98, 0.984, 0.055, 6), '#b9a97b', 0, 0.125);
      const foundation = new THREE.Group();
      foundation.add(rim, tile, stratum);
      mergeStatic(foundation);
      root.add(foundation);
      if (!pigments.has(hex.resource)) pigments.set(hex.resource, terrainMaterial(hex.resource));
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.965, 6, Math.PI / 6),
        pigments.get(hex.resource)!,
      );
      face.rotation.x = -Math.PI / 2;
      face.position.y = SURFACE;
      face.receiveShadow = true;
      root.add(face);
      const borderPoints = Array.from(
        { length: 6 },
        (_, i) =>
          new THREE.Vector3(
            Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * 0.963,
            SURFACE + 0.003,
            Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * 0.963,
          ),
      );
      const border = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(borderPoints),
        new THREE.LineBasicMaterial({ color: '#f0dfb4', transparent: true, opacity: 0.95 }),
      );
      root.add(border);
      const terrain = landscape(hex.resource, hex.id);
      mergeStatic(terrain);
      terrain.position.y = SURFACE;
      root.add(terrain);
      let token: THREE.Group | undefined;
      if (hex.number) {
        token = discLabel(
          String(hex.number),
          '•'.repeat(6 - Math.abs(7 - hex.number)),
          [6, 8].includes(hex.number),
        );
        token.position.set(0, SURFACE + 0.015, 0);
        root.add(token);
      }
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.925, 0.99, 6, 1, Math.PI / 6),
        new THREE.MeshBasicMaterial({
          color: '#ffdc70',
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = SURFACE + 0.025;
      glow.visible = false;
      root.add(glow);
      tiles.set(hex.id, { root, terrain, token, glow });
      island.add(root);
    }
    const ports =
      props.board.ports ??
      props.board.edges
        .filter(
          (e) =>
            e.hexes.length === 1 &&
            props.board.vertices[e.a].port &&
            props.board.vertices[e.a].port === props.board.vertices[e.b].port,
        )
        .map((e) => ({ edge: e.id, resource: props.board.vertices[e.a].port! }));
    for (const port of ports) {
      const edge = props.board.edges[port.edge],
        a = props.board.vertices[edge.a],
        b = props.board.vertices[edge.b];
      const x = (a.x + b.x) / 2,
        z = (a.y + b.y) / 2,
        n = Math.hypot(x, z);
      const dock = portModel(port.resource);
      dock.position.set(x + (x / n) * 0.68, 0.025, z + (z / n) * 0.68);
      dock.rotation.y = -Math.atan2(z, x) + Math.PI / 2;
      dock.getObjectByName('port-label')!.rotation.y = -dock.rotation.y;
      mergeStatic(dock);
      island.add(dock);
      // Each harbor serves both vertices of its coastal edge. Two raised,
      // slatted ramps make those exact building sites visible from any angle.
      const piers = new THREE.Group();
      piers.name = `port-connections-${port.edge}`;
      const junction = new THREE.Vector3(x + (x / n) * 0.43, 0.105, z + (z / n) * 0.43);
      for (const vertex of [a, b]) {
        const landing = new THREE.Vector3(vertex.x, SURFACE + 0.025, vertex.y);
        const direction = landing.clone().sub(junction);
        const length = direction.length();
        const orientation = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          direction.clone().normalize(),
        );
        const ramp = new THREE.Group();
        ramp.position.copy(junction.clone().add(landing).multiplyScalar(0.5));
        ramp.quaternion.copy(orientation);
        const count = Math.ceil(length / 0.075);
        for (let i = 0; i < count; i++) {
          ramp.add(
            box(
              0.18,
              0.045,
              length / count - 0.008,
              i % 2 ? '#c2a271' : '#debd84',
              0,
              0,
              ((i + 0.5) / count - 0.5) * length,
            ),
          );
        }
        for (const side of [-1, 1])
          ramp.add(box(0.022, 0.045, length, '#96744d', side * 0.085, 0.025));
        piers.add(ramp);
        const pad = box(0.21, 0.045, 0.21, '#debd84', landing.x, landing.y, landing.z);
        pad.rotation.y = Math.atan2(direction.x, direction.z);
        piers.add(pad);
        piers.add(box(0.055, landing.y, 0.055, '#80674b', landing.x, landing.y / 2, landing.z));
      }
      mergeStatic(piers);
      island.add(piers);
    }
    frameCamera();
    lastRobber = -1;
  }
  function updatePieces() {
    const nextKeys = new Set<string>();
    for (const vertex of props.board.vertices)
      if (vertex.building) {
        const key = `v${vertex.id}:${vertex.building.kind}:${vertex.building.player}`;
        nextKeys.add(key);
        if (!placed.has(key)) {
          const object = building(
            vertex.building.kind,
            PLAYER_COLORS[(props.colors ?? [0, 1, 2, 3, 4, 5])[vertex.building.player]],
          );
          object.position.set(vertex.x, SURFACE + 0.01, vertex.y);
          object.rotation.y = 0.2;
          pieces.add(object);
          placed.set(key, object);
          const event = props.visualEvents?.findLast(
            (e) => e.vertex === vertex.id && e.type === vertex.building!.kind,
          );
          if (!reduced.matches && event && serverTime() - event.at < BUILD_DURATION_MS)
            animations.push({
              object,
              start: event.at,
              kind: vertex.building.kind === 'city' ? 'grow' : 'drop',
              y: object.position.y,
            });
        }
      }
    for (const edge of props.board.edges)
      if (edge.player !== undefined) {
        const key = `e${edge.id}:${edge.player}`;
        nextKeys.add(key);
        if (!placed.has(key)) {
          const a = props.board.vertices[edge.a],
            b = props.board.vertices[edge.b];
          const object = box(
            0.12,
            0.11,
            0.72,
            PLAYER_COLORS[(props.colors ?? [0, 1, 2, 3, 4, 5])[edge.player]],
            (a.x + b.x) / 2,
            SURFACE + 0.055,
            (a.y + b.y) / 2,
          );
          object.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
          pieces.add(object);
          placed.set(key, object);
          const event = props.visualEvents?.findLast(
            (e) => e.edge === edge.id && e.type === 'road',
          );
          if (!reduced.matches && event && serverTime() - event.at < BUILD_DURATION_MS)
            animations.push({ object, start: event.at, kind: 'grow', y: object.position.y });
        }
      }
    for (const [key, object] of placed)
      if (!nextKeys.has(key)) {
        pieces.remove(object);
        disposeTree(object);
        placed.delete(key);
      }
    if (lastRobber !== props.board.robber) {
      const hex = props.board.hexes[props.board.robber];
      robberFrom.copy(robber.position);
      robberTo.set(hex.x + 0.32, SURFACE, hex.y + 0.12);
      const event = props.visualEvents?.findLast(
        (e) => e.type === 'robber' && e.hex === props.board.robber,
      );
      if (event?.fromHex !== undefined) {
        const from = props.board.hexes[event.fromHex];
        robberFrom.set(from.x + 0.32, SURFACE, from.y + 0.12);
      }
      robberAt =
        !reduced.matches && event && serverTime() - event.at < ROBBER_DURATION_MS ? event.at : 0;
      robber.position.copy(robberAt ? robberFrom : robberTo);
      lastRobber = props.board.robber;
    }
    if (!robber.parent) pieces.add(robber);
  }
  function makeTarget(target: Target, x: number, z: number, edgeAngle?: number) {
    const ring = new THREE.Mesh(
      edgeAngle === undefined
        ? new THREE.TorusGeometry(target.kind === 'hex' ? 0.38 : 0.135, 0.025, 6, 32)
        : new THREE.BoxGeometry(0.09, 0.025, 0.64),
      new THREE.MeshStandardMaterial({
        color: '#fff5ce',
        emissive: '#efd59b',
        emissiveIntensity: 0.35,
        roughness: 0.7,
      }),
    );
    ring.position.set(x, SURFACE + 0.07, z);
    if (edgeAngle === undefined) ring.rotation.x = -Math.PI / 2;
    else ring.rotation.y = edgeAngle;
    ring.userData.target = target;
    targets.add(ring);
    pickMeshes.push(ring);
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(
        target.kind === 'hex' ? 0.77 : 0.24,
        target.kind === 'hex' ? 0.77 : 0.24,
        0.12,
        12,
      ),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(x, SURFACE + 0.12, z);
    hit.userData.target = target;
    targets.add(hit);
    pickMeshes.push(hit);
  }
  function updateTargets() {
    renderer.shadowMap.needsUpdate = true;
    clearGroup(targets);
    pickMeshes.length = 0;
    clearGroup(ghosts);
    hover = undefined;
    for (const id of props.vertices) {
      const v = props.board.vertices[id];
      makeTarget({ kind: 'vertex', id }, v.x, v.y);
    }
    for (const id of props.edges) {
      const e = props.board.edges[id],
        a = props.board.vertices[e.a],
        b = props.board.vertices[e.b];
      makeTarget(
        { kind: 'edge', id },
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.atan2(b.x - a.x, b.y - a.y),
      );
    }
    if (props.selectedHex !== undefined && props.robber) {
      const h = props.board.hexes[props.selectedHex];
      const preview = robberModel();
      preview.position.set(h.x + 0.32, SURFACE + 0.04, h.y + 0.12);
      targets.add(preview);
    }
    if (props.robber)
      for (const h of props.board.hexes)
        if (h.id !== props.board.robber) makeTarget({ kind: 'hex', id: h.id }, h.x, h.y);
    for (const id of props.selectedEdges ?? []) {
      const e = props.board.edges[id],
        a = props.board.vertices[e.a],
        b = props.board.vertices[e.b];
      const road = box(
        0.13,
        0.14,
        0.76,
        '#fff0b6',
        (a.x + b.x) / 2,
        SURFACE + 0.07,
        (a.y + b.y) / 2,
      );
      road.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
      targets.add(road);
    }
  }
  function hoverTarget(target?: Target) {
    if (hover?.kind === target?.kind && hover?.id === target?.id) return;
    hover = target;
    invalidate();
    clearGroup(ghosts);
    renderer.domElement.style.cursor = target ? 'pointer' : 'grab';
    if (!target) return;
    let object: THREE.Object3D;
    if (target.kind === 'vertex') {
      const v = props.board.vertices[target.id];
      object = building(v.building ? 'city' : 'settlement', PLAYER_COLORS[props.activeColor ?? 0]);
      object.position.set(v.x, SURFACE, v.y);
    } else if (target.kind === 'edge') {
      const e = props.board.edges[target.id],
        a = props.board.vertices[e.a],
        b = props.board.vertices[e.b];
      object = box(
        0.13,
        0.12,
        0.74,
        PLAYER_COLORS[props.activeColor ?? 0],
        (a.x + b.x) / 2,
        SURFACE + 0.06,
        (a.y + b.y) / 2,
      );
      object.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
    } else {
      const h = props.board.hexes[target.id];
      object = robberModel();
      object.position.set(h.x + 0.32, SURFACE, h.y + 0.12);
    }
    object.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = false;
        node.material = (node.material as THREE.Material).clone();
        node.material.userData.shared = false;
        node.material.transparent = true;
        node.material.opacity = 0.65;
      }
    });
    ghosts.add(object);
  }
  function activate(target: Target) {
    if (target.kind === 'vertex') props.onVertex(target.id);
    else if (target.kind === 'edge') props.onEdge(target.id);
    else props.onHex(target.id);
  }
  function pick(event: PointerEvent) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickMeshes, false)[0]?.object.userData.target as
      Target | undefined;
  }
  const pointers = new Set<number>();
  let down: { id: number; x: number; y: number } | undefined;
  const pointerDown = (e: PointerEvent) => {
    pointers.add(e.pointerId);
    down =
      pointers.size === 1 && e.button === 0 && e.isPrimary && e.target === renderer.domElement
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : undefined;
  };
  const pointerMove = (e: PointerEvent) => {
    if (down?.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6)
      down = undefined;
    if (!e.buttons) hoverTarget(pick(e));
  };
  const pointerUp = (e: PointerEvent) => {
    const click = down;
    pointers.delete(e.pointerId);
    down = undefined;
    if (
      e.target === renderer.domElement &&
      click?.id === e.pointerId &&
      Math.hypot(e.clientX - click.x, e.clientY - click.y) < 6
    ) {
      const target = pick(e);
      if (target) activate(target);
    }
  };
  const pointerCancel = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    down = undefined;
  };
  const pointerLeave = () => hoverTarget();
  const contextLost = (e: Event) => {
    e.preventDefault();
    fail();
  };
  // Track both touches even when one starts on an overlaid placement button.
  document.addEventListener('pointerdown', pointerDown, true);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  document.addEventListener('pointerup', pointerUp, true);
  document.addEventListener('pointercancel', pointerCancel, true);
  renderer.domElement.addEventListener('pointerleave', pointerLeave);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  function setProps(next: BoardProps) {
    props = next;
    const productionStart = next.production ? next.production.at + DICE_DURATION_MS : Infinity;
    const roll = next.visualEvents?.find(
      (event) => event.type === 'roll' && event.at === next.diceEvent?.at,
    );
    const rollPrefix = roll?.id.slice(0, roll.id.lastIndexOf('-') + 1);
    const visitMap = new Map<number, number>();
    for (const event of next.visualEvents ?? []) {
      if (
        event.type !== 'production' ||
        !rollPrefix ||
        !event.id.startsWith(rollPrefix) ||
        event.at < productionStart ||
        event.at > productionStart + 15_000
      )
        continue;
      const hex = event.hex ?? event.hexes?.[0];
      if (hex !== undefined) visitMap.set(hex, event.at);
    }
    productionVisits = [...visitMap]
      .map(([hex, at]) => ({ hex, at }))
      .sort((a, b) => a.at - b.at || a.hex - b.hex);
    if (next.now && Math.abs(next.now - serverTime()) > 200) {
      serverEpoch = next.now;
      performanceEpoch = performance.now();
    }
    const nextVisualKey = JSON.stringify([
      next.revealAt,
      next.diceEvent?.id,
      next.production?.id,
      next.visualEvents?.at(-1)?.id,
    ]);
    if (nextVisualKey !== visualKey) {
      visualKey = nextVisualKey;
      invalidate();
    }
    const key = JSON.stringify(next.board.hexes.map((h) => [h.resource, h.number]));
    const first = boardKey !== key;
    if (first) {
      boardKey = key;
      rebuild();
      invalidate();
    }
    const pk = JSON.stringify([
      next.board.vertices.map((v) => v.building),
      next.board.edges.map((e) => e.player),
      next.board.robber,
      next.colors,
    ]);
    if (pk !== pieceKey || first) {
      pieceKey = pk;
      renderer.shadowMap.needsUpdate = true;
      updatePieces();
      invalidate();
    }
    const tk = JSON.stringify([
      next.vertices,
      next.edges,
      next.robber,
      next.selectedEdges,
      next.selectedHex,
    ]);
    if (tk !== targetKey || first) {
      targetKey = tk;
      updateTargets();
      refreshAnchors();
      invalidate();
    }
  }
  function makeDie(value: number, color: string) {
    const group = new THREE.Group();
    const body = mesh(new RoundedBoxGeometry(0.43, 0.43, 0.43, 3, 0.035), color);
    body.castShadow = false;
    group.add(body);
    // Each face has the proper opposite pairing; the rolled result finishes upward.
    const faces = [
      { n: value, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.222, 0] },
      { n: 7 - value, rot: [Math.PI / 2, 0, 0], pos: [0, -0.222, 0] },
    ];
    const others = [1, 2, 3, 4, 5, 6].filter((n) => n !== value && n !== 7 - value);
    faces.push(
      { n: others[0], rot: [0, 0, 0], pos: [0, 0, 0.222] },
      { n: 7 - others[0], rot: [0, Math.PI, 0], pos: [0, 0, -0.222] },
      {
        n: others.find((n) => n !== others[0] && n !== 7 - others[0])!,
        rot: [0, Math.PI / 2, 0],
        pos: [0.222, 0, 0],
      },
      {
        n: 7 - others.find((n) => n !== others[0] && n !== 7 - others[0])!,
        rot: [0, -Math.PI / 2, 0],
        pos: [-0.222, 0, 0],
      },
    );
    const pipMaterial = new THREE.MeshBasicMaterial({ color: '#fff9df' });
    for (const face of faces) {
      const side = new THREE.Group();
      const pairs: Record<number, number[][]> = {
        1: [[0, 0]],
        2: [
          [-1, -1],
          [1, 1],
        ],
        3: [
          [-1, -1],
          [0, 0],
          [1, 1],
        ],
        4: [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ],
        5: [
          [-1, -1],
          [-1, 1],
          [0, 0],
          [1, -1],
          [1, 1],
        ],
        6: [
          [-1, -1],
          [-1, 0],
          [-1, 1],
          [1, -1],
          [1, 0],
          [1, 1],
        ],
      };
      pairs[face.n].forEach(([x, y]) => {
        const pip = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), pipMaterial);
        pip.position.set(x * 0.105, y * 0.105, 0);
        side.add(pip);
      });
      side.position.set(...(face.pos as [number, number, number]));
      side.rotation.set(...(face.rot as [number, number, number]));
      group.add(side);
    }
    mergeStatic(group);
    return group;
  }
  function tick() {
    frame = 0;
    if (disposed || (!visible && !renderOffscreen) || document.hidden) return;
    renderOffscreen = false;
    const frameTime = performance.now(),
      now = serverTime(),
      clock = now;
    const delta = lastFrame ? frameTime - lastFrame : 16.7;
    lastFrame = frameTime;
    controls.dampingFactor = 1 - Math.exp(-Math.min(delta, 50) / 115);
    const visitEnd = productionVisits.length ? productionVisits.at(-1)!.at + PRODUCTION_HEX_MS : 0;
    const productionStart = productionVisits[0]?.at ?? Infinity;
    const productionActive = now >= productionStart && now < visitEnd + PRODUCTION_RETURN_MS;
    if (
      productionActive &&
      props.production &&
      !reduced.matches &&
      canceledProduction !== props.production.id
    ) {
      if (!productionCamera || productionCamera.id !== props.production.id) {
        productionCamera = {
          id: props.production.id,
          position: camera.position.clone(),
          target: controls.target.clone(),
        };
      }
      const snapshot = productionCamera;
      const visitIndex = Math.max(
        0,
        productionVisits.findLastIndex((visit) => now >= visit.at),
      );
      const visit = productionVisits[visitIndex];
      const frameFor = (hexId: number, target: THREE.Vector3, position: THREE.Vector3) => {
        const hex = props.board.hexes[hexId];
        target.set(hex.x * 0.85, 0.2, hex.y * 0.85);
        position
          .copy(snapshot.position)
          .sub(snapshot.target)
          .multiplyScalar(size.width < 600 ? 0.77 : 0.62)
          .add(target);
      };
      if (now < visitEnd) {
        frameFor(visit.hex, focusTarget, focusPosition);
        const blend = smooth((now - visit.at) / PRODUCTION_CAMERA_MS);
        if (visitIndex === 0) {
          controls.target.lerpVectors(snapshot.target, focusTarget, blend);
          camera.position.lerpVectors(snapshot.position, focusPosition, blend);
        } else {
          const destination = focusPosition.clone(),
            target = focusTarget.clone();
          frameFor(productionVisits[visitIndex - 1].hex, focusTarget, focusPosition);
          controls.target.lerpVectors(focusTarget, target, blend);
          camera.position.lerpVectors(focusPosition, destination, blend);
          // Pull back between tiles, then settle into the next close view.
          camera.position.addScaledVector(
            snapshot.position.clone().sub(snapshot.target),
            0.16 * Math.sin(Math.PI * blend),
          );
        }
      } else {
        frameFor(visit.hex, focusTarget, focusPosition);
        const blend = smooth((now - visitEnd) / PRODUCTION_RETURN_MS);
        controls.target.lerpVectors(focusTarget, snapshot.target, blend);
        camera.position.lerpVectors(focusPosition, snapshot.position, blend);
      }
    } else if (productionCamera) {
      camera.position.copy(productionCamera.position);
      controls.target.copy(productionCamera.target);
      productionCamera = undefined;
    }
    const cameraMoved = controls.update();
    const openingActive = Boolean(
      props.revealAt && now >= props.revealAt && now < props.revealAt + OPENING_REVEAL_MS,
    );
    const diceActive = Boolean(
      props.diceEvent && now >= props.diceEvent.at && now < props.diceEvent.at + DICE_VISIBLE_MS,
    );
    const moving =
      openingActive || diceActive || productionActive || animations.length > 0 || robberAt > 0;
    const dynamicFrame = (!reduced.matches && moving) || cameraMoved;
    const nativeRatio = Math.min(
      window.devicePixelRatio,
      2.5,
      Math.sqrt(3_000_000 / (size.width * size.height)),
    );
    if (dynamicFrame && delta > 26 && delta < 300) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 2);
    if (slowFrames >= 18) {
      animationPixelRatio = Math.max(1.25, Math.min(nativeRatio, animationPixelRatio) - 0.25);
      slowFrames = 0;
      fastFrames = 0;
    }
    if (dynamicFrame && delta < 19) fastFrames++;
    else fastFrames = 0;
    // Recover detail after a temporary workload spike rather than keeping a reduced budget forever.
    if (fastFrames >= 120) {
      animationPixelRatio = Math.min(nativeRatio, animationPixelRatio + 0.25);
      fastFrames = 0;
    }
    const wantedRatio = dynamicFrame ? Math.min(nativeRatio, animationPixelRatio) : nativeRatio;
    if (Math.abs(renderer.getPixelRatio() - wantedRatio) > 0.03) {
      renderer.setPixelRatio(wantedRatio);
      dirty = true;
    }
    if (!dirty && !dynamicFrame && !hadDynamicFrame) {
      lastFrame = 0;
      return;
    }
    hadDynamicFrame = dynamicFrame;
    dirty = false;
    const shadowMoving = openingActive || animations.length > 0 || robberAt > 0;
    if (shadowMoving) renderer.shadowMap.needsUpdate = true;
    for (const [id, tile] of tiles) {
      const start = props.revealAt;
      if (start && !reduced.matches && now < start + OPENING_REVEAL_MS) {
        const elapsed = now - start;
        const t = ease((elapsed - id * (400 / props.board.hexes.length)) / 420);
        tile.root.visible = elapsed >= id * (400 / props.board.hexes.length);
        tile.root.position.y = (1 - t) * 1.5;
        tile.root.scale.setScalar(Math.max(0.01, t));
        const face = ease((elapsed - 600 - id * (500 / props.board.hexes.length)) / 500);
        tile.terrain.scale.y = Math.max(0.001, face);
        tile.terrain.visible = face > 0;
        if (tile.token) {
          const disc = ease(
            (elapsed -
              1450 -
              (props.board.tokenOrder?.indexOf(id) ?? id) * (450 / props.board.hexes.length)) /
              350,
          );
          tile.token.scale.setScalar(Math.max(0.001, disc));
          tile.token.visible = disc > 0;
        }
      } else {
        tile.root.visible = true;
        tile.root.position.y = 0;
        tile.root.scale.setScalar(1);
        tile.terrain.visible = true;
        tile.terrain.scale.y = 1;
        if (tile.token) {
          tile.token.visible = true;
          tile.token.scale.setScalar(1);
        }
      }
      const visit = productionVisits.find((item) => item.hex === id);
      const producing = !!visit && now >= visit.at && now < visit.at + PRODUCTION_HEX_MS;
      tile.glow.visible = producing;
      if (producing && visit) {
        const pulse = reduced.matches ? 1 : Math.sin((now - visit.at) / 260) ** 2;
        tile.glow.material.opacity = 0.5 + pulse * 0.45;
        if (!reduced.matches) tile.token?.scale.setScalar(1 + 0.12 * pulse);
      }
    }
    for (let i = animations.length - 1; i >= 0; i--) {
      const a = animations[i],
        t = reduced.matches ? 1 : ease((clock - a.start) / BUILD_DURATION_MS);
      if (a.kind === 'drop') a.object.position.y = a.y + (1 - t) * 1.3;
      else a.object.scale.setScalar(Math.max(0.01, t));
      if (t >= 1) {
        a.object.position.y = a.y;
        a.object.scale.setScalar(1);
        animations.splice(i, 1);
      }
    }
    if (robberAt) {
      const t = reduced.matches ? 1 : ease((clock - robberAt) / ROBBER_DURATION_MS);
      robber.position.lerpVectors(robberFrom, robberTo, t);
      robber.position.y += Math.sin(t * Math.PI) * 1.3;
      if (t >= 1) robberAt = 0;
    }
    pieces.visible = !props.revealAt || reduced.matches || now >= props.revealAt + 1400;
    const event = props.diceEvent;
    if (event && event.id !== lastDice) {
      lastDice = event.id;
      clearGroup(dice);
      dieModels.length = 0;
      let seed = 2166136261;
      for (const char of event.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
      const random = () => {
        seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
        return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
      };
      // Clear number-disc centers provide varied, readable landings across the island,
      // without burying a die in the taller mountain and forest miniatures.
      const landingSites = props.board.hexes.filter(
        (hex) =>
          hex.id !== props.board.robber &&
          !['ore', 'wood'].includes(hex.resource) &&
          Math.hypot(hex.x, hex.y) < radius * 0.72,
      );
      const firstSite =
        landingSites[Math.floor(random() * landingSites.length)] ?? props.board.hexes[0];
      const nearby = landingSites.filter(
        (hex) =>
          hex.id !== firstSite.id && Math.hypot(hex.x - firstSite.x, hex.y - firstSite.y) < 3.2,
      );
      const secondSite = nearby[Math.floor(random() * nearby.length)] ?? firstSite;
      event.values.forEach((value, i) => {
        const site = i ? secondSite : firstSite;
        const die = makeDie(value, PLAYER_COLORS[event.color]);
        die.userData.throw = {
          x: site.x + (random() - 0.5) * 0.12,
          z: site.y + (random() - 0.5) * 0.12,
          yaw: random() * Math.PI * 2,
          spin: 4 + Math.floor(random() * 4),
          arc: 1.3 + random() * 0.8,
          side: (i ? 1 : -1) * (1.5 + random()),
        };
        dice.add(die);
        dieModels.push(die);
      });
    }
    dice.visible = Boolean(event && now >= event.at && now < event.at + DICE_VISIBLE_MS);
    diceContacts.forEach((contact) => (contact.visible = dice.visible));
    if (dice.visible && event) {
      const elapsed = now - event.at,
        t = reduced.matches ? 1 : Math.min(1, elapsed / DICE_DURATION_MS),
        out = elapsed > DICE_VISIBLE_MS - 250 ? (elapsed - DICE_VISIBLE_MS + 250) / 250 : 0;
      dieModels.forEach((die, i) => {
        const flight = die.userData.throw;
        die.position.set(
          flight.x + (1 - t) * flight.side,
          SURFACE + 0.25 + Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * flight.arc,
          flight.z + (1 - t) * (1.25 + i * 0.3),
        );
        die.rotation.set(
          (1 - t) * Math.PI * flight.spin,
          flight.yaw + (1 - t) * Math.PI * (flight.spin - 1),
          (1 - t) * Math.PI * (flight.spin + 1),
        );
        die.scale.setScalar(1 - out);
        const height = die.position.y - SURFACE;
        diceContacts[i].position.set(die.position.x, SURFACE + 0.006, die.position.z);
        diceContacts[i].scale.setScalar((0.6 + height * 0.18) * (1 - out));
        diceContacts[i].material.opacity = 0.65 / (1 + height * 1.8);
      });
    }
    for (const anchor of anchorNodes) {
      vector
        .set(
          Number(anchor.dataset.worldX),
          Number(anchor.dataset.worldY ?? SURFACE + 0.1),
          Number(anchor.dataset.worldZ),
        )
        .project(camera);
      anchor.style.transform = `translate(${(vector.x * 0.5 + 0.5) * size.width}px,${(-vector.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%)`;
    }
    const renderStart = performance.now(),
      shadow = renderer.shadowMap.needsUpdate;
    renderer.render(scene, camera);
    if (diagnostics) {
      diagnostics.samples.push({
        at: renderStart,
        cpuMs: performance.now() - renderStart,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        shadow,
        pixelRatio: renderer.getPixelRatio(),
        diceVisible: dice.visible,
      });
      if (diagnostics.samples.length > 600) diagnostics.samples.shift();
    }
    if (dynamicFrame) schedule();
    else {
      lastFrame = 0;
      slowFrames = 0;
      clearTimeout(wakeTimer);
      const nextWake = [
        props.revealAt,
        props.diceEvent?.at,
        props.diceEvent ? props.diceEvent.at + DICE_VISIBLE_MS : undefined,
        ...productionVisits.flatMap((visit) => [visit.at, visit.at + PRODUCTION_HEX_MS]),
        visitEnd ? visitEnd + PRODUCTION_RETURN_MS : undefined,
      ]
        .filter((at): at is number => at !== undefined && at > now)
        .sort((a, b) => a - b)[0];
      if (nextWake !== undefined) wakeTimer = setTimeout(invalidate, Math.max(1, nextWake - now));
    }
  }
  setProps(initial);
  refreshAnchors();
  invalidate();
  return {
    update: setProps,
    reset: frameCamera,
    zoom: (factor: number) => {
      cancelProductionCamera();
      invalidate();
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      controls.update();
    },
    hover: hoverTarget,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(wakeTimer);
      anchorObserver.disconnect();
      controls.removeEventListener('change', invalidate);
      controls.removeEventListener('start', cancelProductionCamera);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', invalidate);
      delete (host as HTMLElement & { __catanGraphics?: unknown }).__catanGraphics;
      resize.disconnect();
      intersection.disconnect();
      controls.dispose();
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('pointercancel', pointerCancel, true);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeTree(scene, true);
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
