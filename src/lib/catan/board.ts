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
  const numbers = extended
    ? [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12]
    : [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  // Place red tokens using randomized independent sets, then fill the other tokens.
  const productive = board.hexes.filter((h) => h.resource !== 'desert');
  const reds = numbers.filter((n) => n === 6 || n === 8);
  let redHexes: number[] = [];
  for (let attempt = 0; attempt < 1000; attempt++) {
    redHexes = [];
    for (const hex of shuffle(productive, random)) {
      const adjacent = board.edges.some(
        (e) => e.hexes.includes(hex.id) && e.hexes.some((h) => redHexes.includes(h)),
      );
      if (!adjacent) redHexes.push(hex.id);
      if (redHexes.length === reds.length) break;
    }
    if (redHexes.length === reds.length) break;
  }
  if (redHexes.length !== reds.length) throw new Error('Unable to generate number tokens');
  const rest = shuffle(
    numbers.filter((n) => n !== 6 && n !== 8),
    random,
  );
  const redNumbers = shuffle(reds, random);
  for (const hex of productive)
    hex.number = redHexes.includes(hex.id) ? redNumbers.pop()! : rest.pop()!;
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
  ports.forEach((port, i) => {
    const edge = coast[Math.floor((i * coast.length) / ports.length)];
    board.vertices[edge.a].port = port;
    board.vertices[edge.b].port = port;
  });
  return board;
}
