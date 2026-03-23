import { Config } from '../config';
import { FetchClient } from './http';
import { PbhhBotWithSse } from './sse';
import { PbhhLogger } from '../utils/logger';
import { PbhhInternal, type MailDetail, type Room } from './api/internal';
import { TokenStore } from '../utils/session';
import { renderMessage } from '../message/render';
import { resolveAvatarUrl } from '../utils/avatar';
import { RoomWsManager, type RoomWsMessage, type RoomWsEvent } from './rooms';
import { isDirectId, makeDirectId, parseDirectId } from '../utils/ids';
import { makeMailReplySubject, makePrivateMailSubject, parseMailAddress } from '../utils/mail';
import type { SendOptions } from '@satorijs/protocol';
import { Bot, Context, Universal, Fragment } from 'koishi';
export class PbhhBot extends Bot<Context, Config>
{
  static inject = [];
  public readonly platform = 'pbhh';
  private _started = false;
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
    if (this._started) return;
    this._started = true;
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
    const avatarUrl = await resolveAvatarUrl(me.avatar, this.config.baseUrl, this.config.gravatarMirror);
    this.user.avatar = avatarUrl;
    await super.start();
    this.online();
    if (this.config.autoJoinRoom != null)
    {
      try
      {
        const rooms = await this.internal.listRooms(this.token);
        const matched = rooms
          .filter((r) => r.name === this.config.autoJoinRoom)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (matched.length === 0)
        {
          this.log.warn('未找到名称为 "%s" 的聊天室，跳过自动加入', this.config.autoJoinRoom);
        } else
        {
          const room = matched[0];
          this.joinRoom(room.id);
          this.log.info('已自动加入聊天室 "%s" (id=%d)', room.name, room.id);
        }
      } catch (err)
      {
        this.log.warn('自动加入聊天室 "%s" 失败：%o', this.config.autoJoinRoom, err);
      }
    }
  }
  async stop(): Promise<void>
  {
    this._started = false;
    this.roomManager.disposeAll();
    this.tokenValue = null;
    if (this instanceof PbhhBotWithSse)
    {
      this.stopSse();
    }
    await super.stop();
  }
  async createMessage(
    channelId: string,
    content: Fragment,
    guildId?: string,
    options?: SendOptions,
  ): Promise<Universal.Message[]>
  {
    const ids = await this.sendMessage(channelId, content, guildId, options);
    return ids.map((id) => ({ id }));
  }
  async getUser(userId: string): Promise<Universal.User>
  {
    const u = await this.internal.getUser(this.token, userId);
    return {
      id: u.username,
      name: u.nickname || u.username,
      avatar: await resolveAvatarUrl(u.avatar, this.config.baseUrl, this.config.gravatarMirror),
    };
  }
  async createDirectChannel(userId: string, guildId?: string): Promise<Universal.Channel>
  {
    const peer = parseMailAddress(userId);
    const user = await this.getDirectUser(peer.userId || userId);
    return {
      id: makeDirectId(user.id),
      name: user.name || user.id,
      type: Universal.Channel.Type.DIRECT,
    };
  }
  async sendMessage(channelId: string, content: Fragment, guildId?: string, options?: SendOptions): Promise<string[]>
  {
    const text = await renderMessage(this, content, channelId);
    if (isDirectId(channelId))
    {
      const userId = parseDirectId(channelId);
      if (!userId) throw new Error(`非法 private channelId: ${channelId}`);
      return this.sendDirectMail(userId, text, options);
    }
    if (channelId === 'posts')
    {
      const post = await this.internal.createPost(this.token, { content: text });
      const id = post?.id ? String(post.id) : `post-${Date.now()}`;
      return [id];
    }
    if (channelId.startsWith('post:'))
    {
      const id = Number(channelId.slice('post:'.length));
      if (!Number.isFinite(id)) throw new Error(`非法 channelId: ${channelId}`);
      const newId = await this.internal.reply(this.token, id, text);
      return [newId ? String(newId) : `reply-${id}-${Date.now()}`];
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
  protected async getDirectUser(userIdOrAddress: string): Promise<Universal.User>
  {
    const peer = parseMailAddress(userIdOrAddress);
    if (!peer.userId)
    {
      return {
        id: userIdOrAddress,
        name: userIdOrAddress,
        avatar: '',
      };
    }
    if (!peer.isInternal)
    {
      return {
        id: peer.userId,
        name: peer.userId,
        avatar: '',
      };
    }
    try
    {
      return await this.getUser(peer.userId);
    } catch
    {
      return {
        id: peer.userId,
        name: peer.userId,
        avatar: '',
      };
    }
  }
  protected buildDirectMessageContent(subject: string, text: string, html = ''): string
  {
    /* 指令匹配只看正文，主题放到 mail 元数据里保留。 */
    return text.trim() || html.trim();
  }
  protected async dispatchMailSession(mail: MailDetail, timestamp: number): Promise<void>
  {
    const peer = parseMailAddress(mail.fromAddress);
    const user = await this.getDirectUser(mail.fromAddress);
    const userId = user.id || peer.userId || peer.address || mail.fromAddress;
    const channelId = makeDirectId(userId);
    const content = this.buildDirectMessageContent(mail.subject, mail.text, mail.html);
    const session = this.session({
      type: 'message',
      timestamp,
      selfId: this.selfId,
      platform: this.platform,
      user: {
        id: userId,
        name: user.name || userId,
        avatar: user.avatar || '',
      },
      channel: {
        id: channelId,
        name: user.name || userId,
        type: Universal.Channel.Type.DIRECT,
      },
      message: {
        id: `mail:${mail.id}`,
        content,
      },
    });
    (session.event as unknown as Record<string, unknown>).mail = {
      id: mail.id,
      subject: mail.subject,
      fromAddress: mail.fromAddress,
    };
    session.messageId = `mail:${mail.id}`;
    session.content = content;
    if (this.config.debug)
    {
      this.log.debug('Mail dispatch session: %o', session.toJSON());
    }
    this.dispatch(session);
  }
  protected getDirectMailSubject(options?: SendOptions): string
  {
    const fallback = makePrivateMailSubject(this.selfId);
    const event = options?.session?.event as unknown as Record<string, unknown> | undefined;
    const mail = event?.mail;
    if (!mail || typeof mail !== 'object') return fallback;
    const subject = (mail as Record<string, unknown>).subject;
    if (typeof subject !== 'string' || !subject.trim()) return fallback;
    return makeMailReplySubject(subject);
  }
  protected async sendDirectMail(userIdOrAddress: string, text: string, options?: SendOptions): Promise<string[]>
  {
    const peer = parseMailAddress(userIdOrAddress);
    if (!peer.address) throw new Error(`非法私聊对象: ${userIdOrAddress}`);
    /* 如果是回信，优先沿用原邮件主题。 */
    const subject = this.getDirectMailSubject(options);
    await this.internal.sendMail(this.token, peer.address, subject, text);
    const messageId = `mail:${Date.now()}`;
    if (this.config.debug)
    {
      this.log.debug('sendDirectMail: to=%s subject=%s', peer.address, subject);
    }
    return [messageId];
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
    const avatar = await resolveAvatarUrl(msg.avatar, this.config.baseUrl, this.config.gravatarMirror);
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
      const avatar = await resolveAvatarUrl(event.userInfo.avatar, this.config.baseUrl, this.config.gravatarMirror);
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
      const avatar = await resolveAvatarUrl(event.userInfo.avatar, this.config.baseUrl, this.config.gravatarMirror);
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
