import { validCards } from './engine.ts';
import { RESOURCES, type Action, type Resource } from './types.ts';
import { ServiceError } from './store.ts';
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const resource = (value: unknown): value is Resource => RESOURCES.includes(value as Resource);
export function parseAction(input: unknown): Action {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ServiceError('Invalid action.');
  const a = input as Record<string, unknown>;
  let valid = false;
  switch (a.type) {
    case 'roll':
    case 'end':
    case 'buy-development':
    case 'cancel-trade':
      valid = true;
      break;
    case 'road':
      valid = integer(a.edge);
      break;
    case 'city':
    case 'settlement':
      valid = integer(a.vertex);
      break;
    case 'discard':
      valid = validCards(a.cards);
      break;
    case 'robber':
      valid = integer(a.hex) && (a.victim === undefined || integer(a.victim));
      break;
    case 'bank-trade':
      valid = resource(a.give) && resource(a.receive);
      break;
    case 'offer':
      valid = (a.to === 'all' || integer(a.to)) && validCards(a.give) && validCards(a.receive);
      break;
    case 'accept-trade':
      valid = integer(a.offer);
      break;
    case 'development':
      if (a.card === 'knight') valid = true;
      if (a.card === 'monopoly') valid = resource(a.resource);
      if (a.card === 'roads')
        valid = Array.isArray(a.edges) && a.edges.length <= 2 && a.edges.every(integer);
      if (a.card === 'plenty')
        valid =
          Array.isArray(a.resources) && a.resources.length <= 2 && a.resources.every(resource);
      break;
  }
  if (!valid) throw new ServiceError('Invalid action fields.');
  return input as Action;
}
