export const PLAYER_COLORS = [
  '#bd5038',
  '#287eb2',
  '#d49a2a',
  '#7962a4',
  '#448369',
  '#bf7290',
] as const;
export const PLAYER_COLOR_NAMES = [
  'Terracotta',
  'Ocean',
  'Ochre',
  'Violet',
  'Forest',
  'Rose',
] as const;
export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Cards = Record<Resource, number>;
export type Development = 'knight' | 'victory' | 'roads' | 'plenty' | 'monopoly';
export const DEVELOPMENT_NAMES: Record<Development, string> = {
  knight: 'Knight',
  victory: 'Victory point',
  roads: 'Road building',
  plenty: 'Year of plenty',
  monopoly: 'Monopoly',
};
export type Random = () => number;
export type Phase =
  'setup-settlement' | 'setup-road' | 'roll' | 'discard' | 'robber' | 'trade' | 'finished';
export type VisualEventType =
  | 'start'
  | 'opening-roll'
  | 'settlement'
  | 'road'
  | 'city'
  | 'roll'
  | 'production'
  | 'discard'
  | 'robber'
  | 'steal'
  | 'bank-trade'
  | 'offer'
  | 'accept-trade'
  | 'cancel-trade'
  | 'buy-development'
  | 'development'
  | 'turn'
  | 'phase'
  | 'pause-request'
  | 'pause-vote'
  | 'pause-declined'
  | 'pause'
  | 'resume'
  | 'finish';
/** Public animation facts only. Hidden draws, hands and discarded card kinds never belong here. */
export interface VisualEvent {
  id: string;
  type: VisualEventType;
  at: number;
  actorId?: string;
  targetPlayerId?: string;
  phase?: Phase;
  fromPhase?: Phase;
  vertex?: number;
  edge?: number;
  edges?: number[];
  hex?: number;
  fromHex?: number;
  hexes?: number[];
  count?: number;
  resources?: Partial<Cards>;
  give?: Partial<Cards>;
  receive?: Partial<Cards>;
  card?: Exclude<Development, 'victory'>;
  values?: [number, number];
  reason?: 'winner' | 'ended';
}
export interface Vertex {
  id: number;
  x: number;
  y: number;
  hexes: number[];
  edges: number[];
  building?: { player: number; kind: 'settlement' | 'city' };
  port?: Resource | 'any';
}
export interface Edge {
  id: number;
  a: number;
  b: number;
  hexes: number[];
  player?: number;
}
export interface Hex {
  id: number;
  x: number;
  y: number;
  resource: Resource | 'desert';
  number: number;
  vertices: number[];
}
export interface Board {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  robber: number;
  tokenOrder?: number[];
  ports?: { edge: number; resource: Resource | 'any' }[];
}
export interface PlayerMetrics {
  produced: Cards;
  spent: Cards;
  stolen: number;
  robbed: number;
  discarded: number;
  trades: number;
  roadsBuilt: number;
  settlementsBuilt: number;
  citiesBuilt: number;
  developmentBought: number;
}
export interface Player {
  color?: number;
  id: string;
  name: string;
  profileId?: string;
  resources: Cards;
  development: { kind: Development; boughtTurn: number }[];
  playedDevelopment?: { kind: Exclude<Development, 'victory'>; turn: number }[];
  knights: number;
  metrics: PlayerMetrics;
}
export interface Offer {
  id: number;
  from: number;
  to: number | 'all';
  give: Cards;
  receive: Cards;
}
export interface Game {
  board: Board;
  players: Player[];
  bank: Cards;
  deck: Development[];
  phase: Phase;
  active: number;
  primary: number;
  paired: boolean;
  turn: number;
  setupStep: number;
  setupVertex?: number;
  dice?: [number, number];
  discard: Record<number, number>;
  robberReturn: 'roll' | 'trade';
  developmentPlayed: boolean;
  longestRoad?: number;
  largestArmy?: number;
  roadLengths: number[];
  offer?: Offer;
  nextOffer: number;
  winner?: number;
  log: { turn: number; text: string }[];
}
export type Action =
  | { type: 'settlement' | 'city'; vertex: number }
  | { type: 'road'; edge: number }
  | { type: 'roll' | 'end' | 'buy-development' | 'cancel-trade' }
  | { type: 'discard'; cards: Cards }
  | { type: 'robber'; hex: number; victim?: number }
  | { type: 'bank-trade'; give: Resource; receive: Resource }
  | { type: 'offer'; to: number | 'all'; give: Cards; receive: Cards }
  | { type: 'accept-trade'; offer: number }
  | { type: 'development'; card: 'knight' }
  | { type: 'development'; card: 'monopoly'; resource: Resource }
  | { type: 'development'; card: 'plenty'; resources: Resource[] }
  | { type: 'development'; card: 'roads'; edges: number[] };
export const emptyCards = (): Cards => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const cardCount = (cards: Cards) => RESOURCES.reduce((n, r) => n + cards[r], 0);
