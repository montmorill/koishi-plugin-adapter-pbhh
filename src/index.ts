import { Config } from './config';
import { Context, Logger, } from 'koishi';
import { createLogger } from './utils/logger';
import { setupBootWithRetry } from './utils/boot';
export const name = 'adapter-pbhh';
export const reusable = true;
export const filter = false;
export const inject = {
  required: ['logger'],
  optional: ['assets'],
};
export const logger = new Logger('adapter-pbhh');
export * from './config';
export function apply(ctx: Context, config: Config) {
  const log = createLogger(logger, config.debug);
  setupBootWithRetry(ctx, config, log);
}
