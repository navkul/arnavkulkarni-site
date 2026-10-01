import { after, NextRequest, NextResponse } from 'next/server';
import { getStore, queueEvaluation, offlineOnly } from '@/lib/catan/server';
import { owns, ServiceError } from '@/lib/catan/store';
import { roomSummary, roomView } from '@/lib/catan/view';
import { networkInterfaces } from 'node:os';
import { parseAction } from '@/lib/catan/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function sessionCookie(request: NextRequest) {
  return request.nextUrl.searchParams.get('hosting') === 'local' || offlineOnly()
    ? 'catan_local_session'
    : 'catan_session';
}
const privateHeaders = {
  'Cache-Control': 'no-store, private',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};
function response(request: NextRequest, data: unknown, secret?: string, status = 200) {
  const res = NextResponse.json(data, { status, headers: privateHeaders });
  if (secret)
    res.cookies.set(sessionCookie(request), secret, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/api/catan',
      maxAge: 30 * 86400,
    });
  return res;
}
function errorResponse(request: NextRequest, error: unknown) {
  if (error instanceof ServiceError)
    return response(request, { error: error.message }, undefined, error.status);
  console.error('Catan request failed', error);
  return response(
    request,
    { error: 'The server could not complete this request. Please try again.' },
    undefined,
    500,
  );
}
async function readBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError('Missing request body.');
  const parts: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 16_384) {
      await reader.cancel();
      throw new ServiceError('Request is too large.', 413);
    }
    parts.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new ServiceError('Invalid JSON body.');
  }
}
export async function GET(request: NextRequest) {
  try {
    const requested = request.nextUrl.searchParams.get('hosting');
    if (requested && !['server', 'local'].includes(requested))
      throw new ServiceError('Invalid hosting mode.');
    const store = getStore(requested === 'local' || offlineOnly() ? 'local' : 'server');
    const { identity, secret } = await store.session(
      request.cookies.get(sessionCookie(request))?.value,
    );
    const query = request.nextUrl.searchParams;
    if (query.has('leaderboard')) return response(request, await store.leaderboard(), secret);
    if (query.has('profile')) return response(request, await store.profile(identity), secret);
    const code = query.get('room')?.toUpperCase();
    if (code) {
      const room = await store.room(code);
      if (room.status !== 'lobby' && !room.seats.some((s) => owns(identity, s)))
        throw new ServiceError('Only seated players can open this game.', 403);
      if (room.game) after(() => queueEvaluation(room));
      return response(
        request,
        {
          room: roomView(room, identity),
          history: room.seats.some((s) => owns(identity, s)) ? await store.oddsHistory(code) : [],
        },
        secret,
      );
    }
    return response(
      request,
      {
        hosting: store.hosting,
        localAddresses:
          store.hosting === 'local'
            ? Object.values(networkInterfaces())
                .flat()
                .filter((n) => n && n.family === 'IPv4' && !n.internal)
                .map(
                  (n) =>
                    `http://${n!.address}${request.nextUrl.port ? ':' + request.nextUrl.port : ''}/catan?hosting=local`,
                )
            : [],
        user: {
          name: identity.name ?? null,
          registered: !!identity.profileId,
          canRegister: await store.canRegister(identity),
        },
        rooms: (await store.rooms())
          .filter((r) => r.status === 'lobby' || r.seats.some((s) => owns(identity, s)))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 100)
          .map((r) => roomSummary(r, identity)),
      },
      secret,
    );
  } catch (error) {
    return errorResponse(request, error);
  }
}
export async function POST(request: NextRequest) {
  try {
    // All mutations are same-origin JSON requests. Cookies alone cannot authorize cross-site writes.
    const origin = request.headers.get('origin');
    if (
      origin !== `${request.nextUrl.protocol}//${request.headers.get('host')}` ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new ServiceError('Cross-site request rejected.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ServiceError('Use application/json.', 415);
    const body = await readBody(request);
    const requested = request.nextUrl.searchParams.get('hosting');
    if (requested && !['server', 'local'].includes(requested))
      throw new ServiceError('Invalid hosting mode.');
    const store = getStore(requested === 'local' || offlineOnly() ? 'local' : 'server');
    const session = await store.session(request.cookies.get(sessionCookie(request))?.value);
    const { identity } = session;
    await store.rateLimit(`session:${identity.sessionHash}`, 180);
    if (body.command === 'register' || body.command === 'login') {
      const secret =
        body.command === 'register'
          ? await store.register(identity, body.name, body.password as string)
          : await store.login(identity, body.name, body.password as string);
      return response(request, { ok: true }, secret);
    }
    if (body.command === 'logout')
      return response(request, { ok: true }, await store.logout(identity));
    if (body.selfHost === true && store.hosting !== 'local')
      throw new ServiceError('Open the local host before starting a self-hosted table.');
    if (body.command === 'create')
      return response(
        request,
        {
          room: roomView(
            await store.createRoom(
              identity,
              body.name,
              Number(body.capacity),
              body.guestName,
              body.winProbability === undefined ? true : (body.winProbability as boolean),
            ),
            identity,
          ),
        },
        session.secret,
      );
    if (typeof body.code !== 'string') throw new ServiceError('Enter a room code.');
    const code = body.code.toUpperCase();
    if (body.command === 'join')
      return response(
        request,
        { room: roomView(await store.join(identity, code, body.name), identity) },
        session.secret,
      );
    if (
      !['start', 'pause', 'resume', 'leave', 'action', 'end-game'].includes(body.command as string)
    )
      throw new ServiceError('Unknown command.');
    const action = body.command === 'action' ? parseAction(body.action) : undefined;
    const room = await store.change(
      identity,
      code,
      body.revision as number,
      body.command as 'start' | 'pause' | 'resume' | 'leave' | 'action' | 'end-game',
      action,
    );
    if (room?.game) after(() => queueEvaluation(room));
    return response(request, { room: room ? roomView(room, identity) : null }, session.secret);
  } catch (error) {
    return errorResponse(request, error);
  }
}
