import { Context } from 'koishi';
import { Config } from '../config';
export interface TokenStore
{
  get(selfId: string): string | undefined;
  set(selfId: string, token: string): void;
  delete(selfId: string): void;
  clear(): void;
}
export function createTokenStore(): TokenStore
{
  const map = new Map<string, string>();
  return {
    get: (selfId) => map.get(selfId),
    set: (selfId, token) => map.set(selfId, token),
    delete: (selfId) => { map.delete(selfId); },
    clear: () => { map.clear(); },
  };
}
export async function loginAndGetMe(ctx: Context, config: Config, internal: import('../bot/api/internal').PbhhInternal, tokenStore: TokenStore)
{
  const selfId = config.username;
  const token = await internal.login(config.username, config.password);
  tokenStore.set(selfId, token);
  const me = await internal.me(token);
  return {
    selfId,
    token,
    me,
  };
}
