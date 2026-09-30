export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Cards = Record<Resource, number>;
export type Development = 'knight' | 'victory' | 'roads' | 'plenty' | 'monopoly';
export type Random = () => number;
export type Phase =
  'setup-settlement' | 'setup-road' | 'roll' | 'discard' | 'robber' | 'trade' | 'finished';
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
  id: string;
  name: string;
  profileId?: string;
  resources: Cards;
  development: { kind: Development; boughtTurn: number }[];
  knights: number;
  metrics: PlayerMetrics;
}
export interface Offer {
  id: number;
  from: number;
  to: number;
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
  | { type: 'offer'; to: number; give: Cards; receive: Cards }
  | { type: 'accept-trade'; offer: number }
  | { type: 'development'; card: 'knight' }
  | { type: 'development'; card: 'monopoly'; resource: Resource }
  | { type: 'development'; card: 'plenty'; resources: Resource[] }
  | { type: 'development'; card: 'roads'; edges: number[] };
export const emptyCards = (): Cards => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const cardCount = (cards: Cards) => RESOURCES.reduce((n, r) => n + cards[r], 0);
