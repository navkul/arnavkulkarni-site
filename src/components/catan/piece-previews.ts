import * as THREE from 'three';
import { box, building, disposeTree } from './three-models';

type PieceKind = 'road' | 'settlement' | 'city';
type Previews = Record<PieceKind, string>;
const cache = new Map<string, Previews | null>();

/** Render the actual playing pieces once; purchase buttons need no live canvas. */
export function piecePreviews(color: string): Previews | null {
  if (cache.has(color)) return cache.get(color)!;
  let renderer: THREE.WebGLRenderer | undefined;
  const scene = new THREE.Scene();
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(280, 256);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    scene.add(new THREE.HemisphereLight('#fff5de', '#687c8b', 2.4));
    const key = new THREE.DirectionalLight('#fff2d4', 3.2);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#c5e5fa', 1.1);
    fill.position.set(3, 2, -3);
    scene.add(fill);
    const aspect = 280 / 256;
    const camera = new THREE.OrthographicCamera(-aspect / 2, aspect / 2, 0.5, -0.5, 0.1, 20);
    camera.position.set(1.1, 0.9, 1.5).multiplyScalar(3);
    camera.lookAt(0, 0, 0);
    const previews = {} as Previews;
    for (const kind of ['road', 'settlement', 'city'] as const) {
      const piece = kind === 'road' ? box(0.12, 0.11, 0.72, color) : building(kind, color);
      // Identical geometry and proportions to the board, framed for a small icon.
      const bounds = new THREE.Box3().setFromObject(piece);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 0.75 / Math.max(size.x, size.y, size.z);
      const center = bounds.getCenter(new THREE.Vector3());
      piece.scale.setScalar(scale);
      piece.position.sub(center.multiplyScalar(scale));
      scene.add(piece);
      renderer.render(scene, camera);
      previews[kind] = renderer.domElement.toDataURL('image/png');
      scene.remove(piece);
      disposeTree(piece);
    }
    cache.set(color, previews);
    return previews;
  } catch {
    // The inline artwork remains available when WebGL is disabled or exhausted.
    cache.set(color, null);
    return null;
  } finally {
    disposeTree(scene);
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
