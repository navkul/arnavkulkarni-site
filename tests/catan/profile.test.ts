import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatanStore } from '../../src/lib/catan/store.ts';
import { roomView } from '../../src/lib/catan/view.ts';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6AAAAAElFTkSuQmCC',
  'base64',
);
const recording = Buffer.from([26, 69, 223, 163, 1, 2, 3, 4]);
async function fixture(fn: (store: CatanStore) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'catan-profile-'));
  const store = new CatanStore(join(dir, 'profiles.sqlite'), 'local');
  try {
    await fn(store);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
test('profiles can register before a game; display names and avatars update seats without changing usernames', () =>
  fixture(async (store) => {
    const guest = (await store.session()).identity;
    const secret = await store.register(guest, 'HarborAccount', 'a unique long password');
    let identity = (await store.session(secret)).identity;
    assert.equal((await store.profile(identity)).games, 0);
    const room = await store.createRoom(identity, 'Friends', 3, 'ignored');
    await store.updateProfile(identity, 'Captain Sheep');
    identity = (await store.session(secret)).identity;
    assert.equal(identity.name, 'Captain Sheep');
    assert.equal(identity.username, 'HarborAccount');
    const avatar = await store.saveMedia(identity, 'avatar', 'image/png', png, '', '');
    identity = (await store.session(secret)).identity;
    assert.equal(identity.avatarUrl, avatar.url);
    assert.equal(roomView(await store.room(room.code), identity).seats[0].avatarUrl, avatar.url);
    assert.equal((await store.media(guest, avatar.id)).mime, 'image/png');
    const login = await store.login(
      (await store.session()).identity,
      'harboraccount',
      'a unique long password',
    );
    assert.equal((await store.session(login)).identity.name, 'Captain Sheep');
    await assert.rejects(
      store.login(guest, 'Captain Sheep', 'a unique long password'),
      /Incorrect/,
    );
    await assert.rejects(
      store.saveMedia(identity, 'avatar', 'image/svg+xml', Buffer.from('<svg/>'), '', ''),
      /JPEG/,
    );
    await assert.rejects(
      store.saveMedia(identity, 'sound', 'audio/webm', Buffer.alloc(262145), 'Long', '🎉'),
      /256 KB/,
    );
  }));
test('recordings enforce ten saved and three active, ownership, seat visibility and sound cooldown', () =>
  fixture(async (store) => {
    const identity = (
      await store.session(
        await store.register(
          (await store.session()).identity,
          'SoundPerson',
          'another unique password',
        ),
      )
    ).identity;
    let room = await store.createRoom(identity, 'Sound table', 3, 'ignored');
    const listener = (await store.session()).identity;
    room = await store.join(listener, room.code, 'Listener');
    const stranger = (await store.session()).identity;
    const clips = [];
    for (let n = 0; n < 10; n++)
      clips.push(
        await store.saveMedia(
          identity,
          'sound',
          'audio/webm;codecs=opus',
          recording,
          `Sound ${n}`,
          '🐑',
        ),
      );
    let profile = await store.profile(identity);
    assert.equal(profile.sounds.length, 10);
    assert.equal(profile.sounds.filter((sound) => sound.active).length, 3);
    await assert.rejects(
      store.saveMedia(identity, 'sound', 'audio/webm', recording, 'Extra', '🎉'),
      /10 sounds/,
    );
    await assert.rejects(store.updateSound(identity, clips[3].id, true), /3 sounds/);
    await store.updateSound(identity, clips[0].id, false);
    await store.updateSound(identity, clips[3].id, true);
    room = await store.room(room.code);
    const revision = room.revision;
    await store.playSound(identity, room.code, clips[3].id);
    const after = await store.room(room.code);
    assert.equal(after.revision, revision);
    const view = roomView(after, identity);
    assert.equal(view.mySounds.length, 3);
    assert.equal(view.soundEvents[0].soundId, clips[3].id);
    assert.match(view.soundEvents[0].playerId, /^seat-/);
    assert.equal(roomView(after, listener).mySounds.length, 0);
    assert.equal(roomView(after, stranger).soundEvents.length, 0);
    assert.equal((await store.media(listener, clips[3].id)).mime, 'audio/webm');
    await assert.rejects(store.media(stranger, clips[3].id), /another table/);
    await assert.rejects(store.playSound(identity, room.code, clips[3].id), /Too many/);
    await assert.rejects(store.updateSound(stranger, clips[3].id, true), /Sign in/);
    await store.updateSound(identity, clips[3].id, false, true);
    profile = await store.profile(identity);
    assert.equal(profile.sounds.length, 9);
    await assert.rejects(store.media(identity, clips[3].id), /not found/);
  }));
test('concurrent profile edits retain table state and concurrent activation cannot exceed the limit', () =>
  fixture(async (store) => {
    const identity = (
      await store.session(
        await store.register(
          (await store.session()).identity,
          'Concurrent',
          'another unique password',
        ),
      )
    ).identity;
    let room = await store.createRoom(identity, 'Busy table', 3, 'ignored');
    const clips = [];
    for (let n = 0; n < 4; n++)
      clips.push(
        await store.saveMedia(identity, 'sound', 'audio/webm', recording, `Clip ${n}`, '👏'),
      );
    await store.updateSound(identity, clips[0].id, false);
    const result = await Promise.allSettled([
      store.updateSound(identity, clips[0].id, true),
      store.updateSound(identity, clips[3].id, true),
    ]);
    assert.equal(result.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal((await store.profile(identity)).sounds.filter((sound) => sound.active).length, 3);
    const listener = (await store.session()).identity;
    await Promise.all([
      store.updateProfile(identity, 'New Name'),
      store.join(listener, room.code, 'Friend'),
    ]);
    room = await store.room(room.code);
    assert.equal(room.seats.length, 2);
    assert.equal(room.seats[0].name, 'New Name');
  }));
