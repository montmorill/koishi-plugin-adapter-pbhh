import { createHash } from 'node:crypto';
import type { GravatarMirror } from '../config';
export type AvatarSpec = string;
const GRAVATAR_MIRRORS: Record<GravatarMirror, string> = {
  cravatar: 'https://cravatar.cn/avatar/',
  loli: 'https://gravatar.loli.net/avatar/',
};
export function getDefaultAvatarUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/default-avatar.svg`;
}
function getGravatarUrl(emailOrHash: string, mirror: GravatarMirror): string {
  const trimmed = emailOrHash.trim().toLowerCase();
  const isHash = /^[0-9a-f]{32}$/.test(trimmed);
  const hash = isHash ? trimmed : createHash('md5').update(trimmed).digest('hex');
  const base = GRAVATAR_MIRRORS[mirror];
  return `${base}${hash}?d=404`;
}
export async function resolveAvatarUrl(
  avatar: AvatarSpec | undefined | null,
  baseUrl: string,
  gravatarMirror: GravatarMirror,
): Promise<string> {
  if (!avatar) return getDefaultAvatarUrl(baseUrl);
  if (avatar.startsWith('qq:')) {
    const id = avatar.slice('qq:'.length).trim();
    if (!id) return getDefaultAvatarUrl(baseUrl);
    return `https://q.qlogo.cn/g?b=qq&s=640&nk=${encodeURIComponent(id)}`;
  }
  if (avatar.startsWith('gravatar:')) {
    const payload = avatar.slice('gravatar:'.length).trim();
    if (!payload) {
      return getDefaultAvatarUrl(baseUrl);
    }
    return getGravatarUrl(payload, gravatarMirror);
  }
  return getDefaultAvatarUrl(baseUrl);
}
