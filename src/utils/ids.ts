export function parseGuildId(guildId: string): number | null
{
  if (guildId.startsWith('post:'))
  {
    const id = Number(guildId.slice('post:'.length));
    return Number.isFinite(id) ? id : null;
  }
  if (guildId.startsWith('room:'))
  {
    const id = Number(guildId.slice('room:'.length));
    return Number.isFinite(id) ? id : null;
  }
  const id = Number(guildId);
  return Number.isFinite(id) ? id : null;
}
export function parseChannelId(channelId: string): number | null
{
  if (channelId.startsWith('post:'))
  {
    const id = Number(channelId.slice('post:'.length));
    return Number.isFinite(id) ? id : null;
  }
  if (channelId.startsWith('room:'))
  {
    const id = Number(channelId.slice('room:'.length));
    return Number.isFinite(id) ? id : null;
  }
  return null;
}
export function makeChannelId(postId: number): string
{
  return `post:${postId}`;
}
export function makeRoomId(roomId: number): string
{
  return `room:${roomId}`;
}
export function parseRoomId(id: string): number | null
{
  if (!id.startsWith('room:')) return null;
  const n = Number(id.slice('room:'.length));
  return Number.isFinite(n) ? n : null;
}
export function isRoomId(id: string): boolean
{
  return id.startsWith('room:');
}
