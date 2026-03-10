import { readFile } from 'node:fs/promises';
export type AvatarSpec = string;
let cachedDefaultAvatarDataUrl: string | null = null;
function svgToDataUrl(svg: string): string
{
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
export async function getDefaultAvatarDataUrl(): Promise<string>
{
  if (cachedDefaultAvatarDataUrl) return cachedDefaultAvatarDataUrl;
  const svg = await readFile(new URL('../../data/avatar.svg', import.meta.url), 'utf8');
  cachedDefaultAvatarDataUrl = svgToDataUrl(svg);
  return cachedDefaultAvatarDataUrl;
}
export async function resolveAvatarUrl(avatar: AvatarSpec | undefined | null): Promise<string>
{
  if (!avatar) return getDefaultAvatarDataUrl();
  if (avatar.startsWith('qq:'))
  {
    const id = avatar.slice('qq:'.length).trim();
    if (!id) return getDefaultAvatarDataUrl();
    return `https://q.qlogo.cn/g?b=qq&s=640&nk=${encodeURIComponent(id)}`;
  }
  if (avatar.startsWith('gravatar:'))
  {
    return getDefaultAvatarDataUrl();
  }
  return getDefaultAvatarDataUrl();
}
