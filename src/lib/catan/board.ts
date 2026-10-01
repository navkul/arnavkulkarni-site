import { RESOURCES, type Board, type Random, type Resource } from './types.ts';

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createBoard(extended: boolean, random: Random): Board {
  const board: Board = { hexes: [], vertices: [], edges: [], robber: 0 };
  const rows = extended ? [3, 4, 5, 6, 5, 4, 3] : [3, 4, 5, 4, 3];
  const terrain: (Resource | 'desert')[] = [];
  const counts = extended ? [6, 5, 6, 6, 5] : [4, 3, 4, 4, 3];
  RESOURCES.forEach((r, i) => terrain.push(...Array<Resource>(counts[i]).fill(r)));
  terrain.push('desert');
  if (extended) terrain.push('desert');
  const land = shuffle(terrain, random);
  const vertexKeys = new Map<string, number>();
  const edgeKeys = new Map<string, number>();
  rows.forEach((length, row) => {
    for (let col = 0; col < length; col++) {
      const id = board.hexes.length;
      const x = (col - (length - 1) / 2) * Math.sqrt(3);
      const y = (row - (rows.length - 1) / 2) * 1.5;
      const vertices: number[] = [];
      for (let k = 0; k < 6; k++) {
        const angle = ((30 + k * 60) * Math.PI) / 180;
        const vx = x + Math.cos(angle),
          vy = y + Math.sin(angle);
        const key = `${Math.round(vx * 10000)},${Math.round(vy * 10000)}`;
        let vertex = vertexKeys.get(key);
        if (vertex === undefined) {
          vertex = board.vertices.length;
          vertexKeys.set(key, vertex);
          board.vertices.push({ id: vertex, x: vx, y: vy, hexes: [], edges: [] });
        }
        vertices.push(vertex);
        board.vertices[vertex].hexes.push(id);
      }
      for (let k = 0; k < 6; k++) {
        const a = vertices[k],
          b = vertices[(k + 1) % 6];
        const key = [a, b].sort((a, b) => a - b).join(',');
        let edge = edgeKeys.get(key);
        if (edge === undefined) {
          edge = board.edges.length;
          edgeKeys.set(key, edge);
          board.edges.push({ id: edge, a, b, hexes: [] });
          board.vertices[a].edges.push(edge);
          board.vertices[b].edges.push(edge);
        }
        board.edges[edge].hexes.push(id);
      }
      board.hexes.push({ id, x, y, vertices, resource: land[id], number: 0 });
      if (land[id] === 'desert') board.robber = id;
    }
  });
  // Official A–R / A–Zc discs: counterclockwise spiral, skipping deserts.
  const sequence = extended
    ? [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 10, 5, 4, 9, 5, 9, 12, 3, 2, 6]
    : [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
  const neighbors = (id: number) =>
    board.edges.filter((e) => e.hexes.includes(id)).flatMap((e) => e.hexes.filter((h) => h !== id));
  const corners = board.hexes.filter((h) => neighbors(h.id).length === 3);
  const corner = corners[Math.floor(random() * corners.length)];
  const startAngle = Math.atan2(corner.y, corner.x);
  const remaining = new Set(board.hexes.map((h) => h.id));
  const spiral: number[] = [];
  while (remaining.size) {
    const ring = [...remaining].filter(
      (id) => neighbors(id).filter((n) => remaining.has(n)).length < 6,
    );
    const angle = (id: number) =>
      (startAngle - Math.atan2(board.hexes[id].y, board.hexes[id].x) + Math.PI * 4) % (Math.PI * 2);
    ring.sort((a, b) => angle(a) - angle(b));
    const closest = ring.reduce((best, id) => {
      const distance = (n: number) =>
        Math.abs(
          Math.atan2(
            Math.sin(startAngle - Math.atan2(board.hexes[n].y, board.hexes[n].x)),
            Math.cos(startAngle - Math.atan2(board.hexes[n].y, board.hexes[n].x)),
          ),
        );
      return distance(id) < distance(best) ? id : best;
    }, ring[0]);
    const offset = ring.indexOf(closest);
    spiral.push(...ring.slice(offset), ...ring.slice(0, offset));
    ring.forEach((id) => remaining.delete(id));
  }
  board.tokenOrder = spiral.filter((id) => board.hexes[id].resource !== 'desert');
  board.tokenOrder.forEach((id, i) => {
    board.hexes[id].number = sequence[i];
  });
  const coast = board.edges
    .filter((e) => e.hexes.length === 1)
    .sort((a, b) => {
      const angle = (e: typeof a) =>
        Math.atan2(
          board.vertices[e.a].y + board.vertices[e.b].y,
          board.vertices[e.a].x + board.vertices[e.b].x,
        );
      return angle(a) - angle(b);
    });
  const ports = shuffle<Resource | 'any'>(
    [
      ...RESOURCES,
      'any',
      'any',
      'any',
      'any',
      ...(extended ? ['any' as const, 'sheep' as const] : []),
    ],
    random,
  );
  board.ports = [];
  ports.forEach((port, i) => {
    const edge = coast[Math.floor((i * coast.length) / ports.length)];
    board.ports!.push({ edge: edge.id, resource: port });
    board.vertices[edge.a].port = port;
    board.vertices[edge.b].port = port;
  });
  return board;
}
