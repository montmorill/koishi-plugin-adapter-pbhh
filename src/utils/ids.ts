export function parseGuildId(guildId: string): number | null
{
  if (guildId.startsWith('post:'))
  {
    const id = Number(guildId.slice('post:'.length));
    return Number.isFinite(id) ? id : null;
  }
  const id = Number(guildId);
  return Number.isFinite(id) ? id : null;
}
export function parseChannelId(channelId: string): number | null
{
  if (!channelId.startsWith('post:')) return null;
  const id = Number(channelId.slice('post:'.length));
  return Number.isFinite(id) ? id : null;
}
export function makeChannelId(postId: number): string
{
  return `post:${postId}`;
}
