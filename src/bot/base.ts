import { Bot, Context, Universal, Fragment } from 'koishi';
import type { SendOptions } from '@satorijs/protocol';
import { renderMessage } from '../message/render';
import { Config } from '../config';
import { PbhhInternal } from './api/internal';
import { FetchClient } from './http';
import { PbhhLogger } from '../utils/logger';
import { TokenStore } from '../utils/session';
import { resolveAvatarUrl } from '../utils/avatar';
import { PbhhBotWithSse } from './sse';
export class PbhhBot extends Bot<Context, Config>
{
  static inject = [];
  public readonly platform = 'pbhh';
  private tokenValue: string | null = null;
  public readonly internal: PbhhInternal;
  constructor(
    ctx: Context,
    config: Config,
    protected http: FetchClient,
    protected tokenStore: TokenStore,
    protected log: PbhhLogger,
    selfId: string = config.username,
  )
  {
    super(ctx, config, 'pbhh');
    this.internal = new PbhhInternal(this.http, this.log);
    this.selfId = selfId;
    this.user = {
      id: selfId,
      name: selfId,
      avatar: '',
    };
  }
  protected get token(): string
  {
    if (this.tokenValue) return this.tokenValue;
    const t = this.tokenStore.get(this.selfId);
    if (!t) throw new Error('token 不存在，请检查登录流程');
    return t;
  }
  async start(): Promise<void>
  {

    const token = await this.internal.login(this.config.username, this.config.password);
    this.tokenValue = token;
    this.tokenStore.set(this.selfId, token);
    if (this instanceof PbhhBotWithSse)
    {
      this.startSse();
    }
    try
    {
      await this.internal.setNotificationPrefs(token, this.config.notificationPrefs);
    } catch (err)
    {
      this.log.warn('同步订阅设置失败（已忽略）：%o', err);
    }
    const me = await this.internal.me(token);
    this.user.name = me.nickname || me.username;
    const avatarUrl = await resolveAvatarUrl(me.avatar, this.config.baseUrl);
    this.user.avatar = avatarUrl;
    await super.start();
    this.online();
  }
  async stop(): Promise<void>
  {
    this.tokenValue = null;
    if (this instanceof PbhhBotWithSse)
    {
      this.stopSse();
    }
    await super.stop();
    this.status = Universal.Status.OFFLINE;
    this.dispatch(this.session({
      type: 'login-removed',
      platform: this.platform,
      selfId: this.selfId,
    }));
  }
  async getUser(userId: string): Promise<Universal.User>
  {
    const u = await this.internal.getUser(this.token, userId);
    return {
      id: u.username,
      name: u.nickname || u.username,
      avatar: await resolveAvatarUrl(u.avatar, this.config.baseUrl),
    };
  }
  async sendMessage(channelId: string, content: Fragment, guildId?: string, options?: SendOptions): Promise<string[]>
  {
    const text = await renderMessage(this, content, channelId);
    if (channelId === 'posts')
    {
      await this.internal.createPost(this.token, { content: text });
      return [];
    }
    if (channelId.startsWith('post:'))
    {
      const id = Number(channelId.slice('post:'.length));
      if (!Number.isFinite(id)) throw new Error(`非法 channelId: ${channelId}`);
      const newId = await this.internal.reply(this.token, id, text);
      return newId ? [String(newId)] : [];
    }
    await this.internal.createPost(this.token, { content: text });
    return [];
  }
}
