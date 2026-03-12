import type { Config } from '../config';
import type { PbhhLogger } from './logger';
import { Context, Universal } from 'koishi';
import { PbhhBotWithUnsupported } from '../bot/api/unsupported';
import { createFetchClient } from '../bot/http';
import { createTokenStore, type TokenStore } from './session';
const RETRY_DELAYS = [5_000, 30_000, 60_000, 300_000];
export function setupBootWithRetry(ctx: Context, config: Config, log: PbhhLogger): void
{
  const tokenStore: TokenStore = createTokenStore();
  let isDisposing = false;
  let started = false;
  const abortController = new AbortController();
  ctx.on('dispose', () =>
  {
    isDisposing = true;
    abortController.abort();
    tokenStore.clear();
  });
  ctx.on('ready', async () =>
  {
    if (isDisposing || started) return;
    started = true;
    let attempt = 0;
    const run = async (): Promise<void> =>
    {
      if (isDisposing) return;
      const botCtx = ctx.guild();
      try
      {
        const http = await createFetchClient(ctx, config, log);
        const bot = new PbhhBotWithUnsupported(botCtx, config, http, tokenStore, log);
        bot.dispatch(bot.session({
          type: 'login-added',
          platform: bot.platform,
          selfId: bot.selfId,
        }));
        await bot.start();
        bot.dispatch(bot.session({
          type: 'login-updated',
          platform: bot.platform,
          selfId: bot.selfId,
        }));
        log.debug(`机器人已上线：${bot.selfId}`);
        botCtx.on('dispose', async () =>
        {
          try
          {
            await bot.stop();
          } catch (err)
          {
            log.error('stop 失败', err);
          }
        });
        void (Universal.Status.ONLINE);
      } catch (err)
      {
        attempt += 1;
        const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
        log.error(`启动失败（第 ${attempt} 次），将在 ${delay}ms 后重试：`, err);
        if (isDisposing || abortController.signal.aborted) return;
        ctx.setTimeout(() =>
        {
          void run();
        }, delay);
      }
    };
    void run();
  });
}
