import { Config } from '../config';
import { FetchClient } from './http';
import { PbhhBotWithSse } from './sse';
import { PbhhLogger } from '../utils/logger';
import { PbhhInternal, type Room } from './api/internal';
import { TokenStore } from '../utils/session';
import { renderMessage } from '../message/render';
import { resolveAvatarUrl } from '../utils/avatar';
import { RoomWsManager, type RoomWsMessage, type RoomWsEvent } from './rooms';
import type { SendOptions } from '@satorijs/protocol';
import { Bot, Context, Universal, Fragment } from 'koishi';
export class PbhhBot extends Bot<Context, Config>
{
  static inject = [];
  public readonly platform = 'pbhh';
  private tokenValue: string | null = null;
  public readonly internal: PbhhInternal;
  protected readonly roomManager: RoomWsManager;
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
    this.roomManager = new RoomWsManager(
      ctx,
      config.baseUrl,
      log,
      (roomId, msg) => this.dispatchRoomMessage(roomId, msg),
      (roomId, event) => this.dispatchRoomEvent(roomId, event),
      config.username,
      config.debug,
    );
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
    this.roomManager.disposeAll();
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
    if (channelId.startsWith('room:'))
    {
      const roomId = Number(channelId.slice('room:'.length));
      if (!Number.isFinite(roomId)) throw new Error(`非法 room channelId: ${channelId}`);
      return this.roomManager.sendMessage(roomId, this.token, text);
    }
    await this.internal.createPost(this.token, { content: text });
    return [];
  }
  joinRoom(roomId: number): void
  {
    this.roomManager.joinRoom(roomId, this.token);
  }
  leaveRoom(roomId: number): void
  {
    this.roomManager.leaveRoom(roomId);
  }
  async sendRoomMessage(roomId: number, content: string): Promise<string[]>
  {
    return this.roomManager.sendMessage(roomId, this.token, content);
  }

  async createRoom(name: string): Promise<Room>
  {
    const room = await this.internal.createRoom(this.token, name);
    const guildId = `room:${room.id}`;
    const channelId = `room:${room.id}`;

    this.dispatch(this.session({
      type: 'guild-added',
      guild: { id: guildId, name: room.name },
    }));

    this.dispatch(this.session({
      type: 'channel-added',
      guild: { id: guildId, name: room.name },
      channel: { id: channelId, name: room.name, type: Universal.Channel.Type.TEXT },
    }));
    if (this.config.debug)
    {
      this.log.debug('createRoom: 已创建并下发事件 roomId=%d name=%s', room.id, room.name);
    }
    return room;
  }

  private async dispatchRoomMessage(roomId: number, msg: RoomWsMessage): Promise<void>
  {
    const channelId = `room:${roomId}`;
    const guildId = `room:${roomId}`;
    const avatar = await resolveAvatarUrl(msg.avatar, this.config.baseUrl);
    const session = this.session({
      type: 'message',
      timestamp: new Date(msg.createdAt).getTime(),
      selfId: this.selfId,
      platform: this.platform,
      user: { id: msg.username, name: msg.nickname, avatar },
      guild: { id: guildId },
      channel: { id: channelId, type: Universal.Channel.Type.TEXT },
      message: { id: String(msg.id), content: msg.content },
    });
    session.messageId = String(msg.id);
    session.content = msg.content;
    if (this.config.debug)
    {
      this.log.debug('RoomWs dispatch roomId=%d msgId=%d user=%s', roomId, msg.id, msg.username);
    }
    this.dispatch(session);
  }

  private async dispatchRoomEvent(roomId: number, event: RoomWsEvent): Promise<void>
  {
    const guildId = `room:${roomId}`;
    if (event.type === 'join')
    {
      const avatar = await resolveAvatarUrl(event.userInfo.avatar, this.config.baseUrl);
      const user = { id: event.username, name: event.userInfo.nickname, avatar };
      this.dispatch(this.session({
        type: 'guild-member-added',
        guild: { id: guildId },

        member: { user },
        user,
      }));
      if (this.config.debug)
      {
        this.log.debug('RoomWs guild-member-added roomId=%d user=%s', roomId, event.username);
      }
    }
    else if (event.type === 'leave')
    {
      const avatar = await resolveAvatarUrl(event.userInfo.avatar, this.config.baseUrl);
      const user = { id: event.username, name: event.userInfo.nickname, avatar };
      this.dispatch(this.session({
        type: 'guild-member-removed',
        guild: { id: guildId },

        member: { user },
        user,
      }));
      if (this.config.debug)
      {
        this.log.debug('RoomWs guild-member-removed roomId=%d user=%s', roomId, event.username);
      }
    }

  }
}
