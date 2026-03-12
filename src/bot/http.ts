import { Config } from '../config';
import { ProxyAgent } from 'undici';
import { Context, sleep } from 'koishi';
import { PbhhLogger } from '../utils/logger';
export interface FetchClient
{
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
  fetchRaw(path: string, init?: RequestInit): Promise<Response>;
  getProxyStatus(): { enabled: boolean; reason?: string; };
}
function joinUrl(baseUrl: string, path: string): string
{
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
function withTimeout(ctx: Context, init: RequestInit | undefined, timeout: number): { init: RequestInit; dispose: () => void; }
{
  const controller = new AbortController();
  const merged: RequestInit = {
    ...init,
    signal: controller.signal,
  };
  const disposeTimer = ctx.setTimeout(() =>
  {
    controller.abort();
  }, timeout);
  return {
    init: merged,
    dispose: () => disposeTimer(),
  };
}
function getRetryDelay(attempt: number): number
{
  return Math.min((attempt + 1) * 1000, 10_000);
}
async function probeProxy(ctx: Context, proxyUrl: string, baseUrl: string, ua: string, timeout: number): Promise<boolean>
{
  try
  {
    const dispatcher = new ProxyAgent(proxyUrl);
    const { init, dispose } = withTimeout(ctx, {
      method: 'GET',
      headers: {
        accept: '*/*',
        'user-agent': ua,
      },
      dispatcher,
    } as RequestInit, timeout);
    const res = await fetch(joinUrl(baseUrl, '/api/me'), init);
    dispose();
    return res.status > 0;
  } catch
  {
    return false;
  }
}
export async function createFetchClient(ctx: Context, config: Config, logger: PbhhLogger): Promise<FetchClient>
{
  let proxyEnabled = false;
  let proxyReason: string | undefined;
  let dispatcher: ProxyAgent | undefined;
  if (config.useProxy && config.proxyUrl)
  {
    const ok = await probeProxy(ctx, config.proxyUrl, config.baseUrl, config.userAgent, config.requestTimeout);
    if (ok)
    {
      proxyEnabled = true;
      dispatcher = new ProxyAgent(config.proxyUrl);
      logger.debug('代理探测成功，启用代理：%s', config.proxyUrl);
    } else
    {
      proxyReason = '代理不可用，已禁用';
      logger.warn('代理探测失败，禁用代理：%s', config.proxyUrl);
    }
  }
  async function fetchRaw(path: string, init?: RequestInit): Promise<Response>
  {
    const url = joinUrl(config.baseUrl, path);
    const headers = new Headers(init?.headers);
    headers.set('accept', headers.get('accept') || '*/*');
    headers.set('user-agent', headers.get('user-agent') || config.userAgent);
    const { init: init2, dispose: disposeTimeout } = withTimeout(ctx, { ...init, headers }, config.requestTimeout);
    const finalInit: RequestInit = proxyEnabled && dispatcher
      ? ({ ...init2, dispatcher } as RequestInit)
      : init2;
    let attempt = 0;
    while (true)
    {
      try
      {
        const res = await fetch(url, finalInit);
        disposeTimeout();
        return res;
      } catch (err)
      {
        disposeTimeout();
        if (attempt
          >= config.maxRetries - 1) throw err;
        const delay = getRetryDelay(attempt);
        logger.warn('请求失败，%dms 后重试（%d/%d）：%s', delay, attempt + 1, config.maxRetries, url);
        await sleep(delay);
        attempt++;
      }
    }
  }
  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T>
  {
    const res = await fetchRaw(path, init);
    if (!res.ok)
    {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
  return {
    fetchJson,
    fetchRaw,
    getProxyStatus: () => ({ enabled: proxyEnabled, reason: proxyReason }),
  };
}
