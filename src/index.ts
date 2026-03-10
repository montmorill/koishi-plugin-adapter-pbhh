import { Context, Logger, Universal } from 'koishi';
import { Config } from './config';
import { createLogger } from './utils/logger';
import { createTokenStore } from './utils/session';
import { createFetchClient } from './bot/http';
import { PbhhBotWithSse } from './bot/sse';
export const name = 'adapter-pbhh';
export const reusable = true;
export const filter = false;
export const inject = {
  required: ['logger'],
  optional: ['assets'],
};
export const logger = new Logger('adapter-pbhh');
export * from './config';
export function apply(ctx: Context, config: Config)
{
  const log = createLogger(logger, config.debug);
  const tokenStore = createTokenStore();
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
    const botCtx = ctx.guild();
    try
    {
      const http = await createFetchClient(ctx, config, log);
      const bot = new PbhhBotWithSse(botCtx, config, http, tokenStore, log);
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
      log.error('启动失败', err);
      started = false;
      if (!abortController.signal.aborted) ctx.scope.dispose();
    }
  });
}
