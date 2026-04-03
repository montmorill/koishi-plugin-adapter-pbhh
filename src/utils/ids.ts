const POST_PREFIX = 'post:';
const ROOM_PREFIX = 'room:';
const DIRECT_PREFIX = 'private:';

export function parseGuildId(guildId: string): number | null {
  if (guildId.startsWith(POST_PREFIX)) {
    const id = Number(guildId.slice(POST_PREFIX.length));
    return Number.isFinite(id) ? id : null;
  }
  if (guildId.startsWith(ROOM_PREFIX)) {
    const id = Number(guildId.slice(ROOM_PREFIX.length));
    return Number.isFinite(id) ? id : null;
  }
  const id = Number(guildId);
  return Number.isFinite(id) ? id : null;
}

export function parseChannelId(channelId: string): number | null {
  if (channelId.startsWith(POST_PREFIX)) {
    const id = Number(channelId.slice(POST_PREFIX.length));
    return Number.isFinite(id) ? id : null;
  }
  if (channelId.startsWith(ROOM_PREFIX)) {
    const id = Number(channelId.slice(ROOM_PREFIX.length));
    return Number.isFinite(id) ? id : null;
  }
  return null;
}

export function makeChannelId(postId: number): string {
  return `${POST_PREFIX}${postId}`;
}

export function makeRoomId(roomId: number): string {
  return `${ROOM_PREFIX}${roomId}`;
}

export function parseRoomId(id: string): number | null {
  if (!id.startsWith(ROOM_PREFIX)) return null;
  const roomId = Number(id.slice(ROOM_PREFIX.length));
  return Number.isFinite(roomId) ? roomId : null;
}

export function isRoomId(id: string): boolean {
  return id.startsWith(ROOM_PREFIX);
}

export function makeDirectId(userId: string): string {
  return `${DIRECT_PREFIX}${userId}`;
}

export function parseDirectId(channelId: string): string | null {
  if (!channelId.startsWith(DIRECT_PREFIX)) return null;
  const userId = channelId.slice(DIRECT_PREFIX.length).trim();
  return userId || null;
}

export function isDirectId(channelId: string): boolean {
  return channelId.startsWith(DIRECT_PREFIX);
}
