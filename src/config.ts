import { Schema } from 'koishi';
export interface NotificationPrefs
{
  like: boolean;
  reply: boolean;
  post: boolean;
}
export interface Config
{
  baseUrl: string;
  username: string;
  password: string;
  maxRetries: number;
  requestTimeout: number;
  useProxy: boolean;
  proxyUrl?: string;
  notificationPrefs: NotificationPrefs;
  userAgent: string;
  debug: boolean;
}
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: Schema.string().default('http://123.56.89.122').description('平渹网 服务地址').role('link'),
    username: Schema.string().required().description('账号用户名'),
    password: Schema.string().required().description('账号密码').role('secret'),
  }).description('连接设置'),
  Schema.object({
    maxRetries: Schema.number().min(1).max(10).step(1).default(3).description('网络请求失败时最大重试次数'),
    requestTimeout: Schema.number().min(3_000).max(120_000).step(1_000).default(15_000).description('请求超时（毫秒）'),
    userAgent: Schema.string()
      .default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')
      .description('请求使用的 User-Agent').role('textarea', { rows: [2, 4] }),
  }).description('网络 - 请求设置'),
  Schema.object({
    useProxy: Schema.boolean().default(false).description('是否尝试使用代理'),
  }).description('网络 - 代理设置'),
  Schema.union([
    Schema.object({
      useProxy: Schema.const(true).required(),
      proxyUrl: Schema.string().default('http://localhost:7897').description('代理地址（http/https）'),
    }),
    Schema.object({
      useProxy: Schema.const(false),
    }),
  ]),
  Schema.object({
    notificationPrefs: Schema.object({
      like: Schema.boolean().default(true).description('点赞通知'),
      reply: Schema.boolean().default(true).description('回复通知'),
      post: Schema.boolean().default(true).description('关注的人发帖通知'),
    }),
  }).description('订阅设置'),
  Schema.object({
    debug: Schema.boolean().default(false).description('调试日志').experimental(),
  }).description('调试设置'),
]);
