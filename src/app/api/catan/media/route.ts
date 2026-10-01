import { NextRequest, NextResponse } from 'next/server';
import { getStore, offlineOnly } from '@/lib/catan/server';
import { ServiceError } from '@/lib/catan/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie',
};
async function context(request: NextRequest) {
  const local = request.nextUrl.searchParams.get('hosting') === 'local' || offlineOnly();
  const store = getStore(local ? 'local' : 'server');
  const session = await store.session(
    request.cookies.get(local ? 'catan_local_session' : 'catan_session')?.value,
  );
  return { store, identity: session.identity };
}
function failure(error: unknown) {
  if (!(error instanceof ServiceError)) console.error('Catan media request failed', error);
  return NextResponse.json(
    {
      error:
        error instanceof ServiceError ? error.message : 'Could not save this media. Try again.',
    },
    { status: error instanceof ServiceError ? error.status : 500, headers },
  );
}
export async function GET(request: NextRequest) {
  try {
    const { store, identity } = await context(request);
    const media = await store.media(identity, request.nextUrl.searchParams.get('id') ?? '');
    return new NextResponse(new Uint8Array(media.data), {
      headers: {
        ...headers,
        'Content-Type': media.mime,
        'Content-Length': String(media.data.length),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    if (
      request.headers.get('origin') !==
        `${request.nextUrl.protocol}//${request.headers.get('host')}` ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new ServiceError('Cross-site request rejected.', 403);
    const { store, identity } = await context(request);
    if (!identity.profileId) throw new ServiceError('Sign in to save media.', 401);
    const reader = request.body?.getReader();
    if (!reader) throw new ServiceError('Missing media.');
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) {
        await reader.cancel();
        throw new ServiceError('Keep recordings and images below 256 KB.', 413);
      }
      parts.push(value);
    }
    const kind = request.nextUrl.searchParams.get('kind');
    if (kind !== 'avatar' && kind !== 'sound')
      throw new ServiceError('Choose an image or recording.');
    const result = await store.saveMedia(
      identity,
      kind,
      request.headers.get('content-type') ?? '',
      Buffer.concat(parts),
      request.nextUrl.searchParams.get('name'),
      request.nextUrl.searchParams.get('emoji'),
    );
    return NextResponse.json(result, { headers });
  } catch (error) {
    return failure(error);
  }
}
