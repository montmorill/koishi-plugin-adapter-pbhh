import { PbhhBot } from './base';
import { Universal } from 'koishi';
import type { ReadableStreamDefaultReader } from 'node:stream/web';
import type { Message } from '@satorijs/protocol';
import { getPostDisplayName } from '../utils/post';

export interface SseEvent {
  topic: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export class PbhhBotWithSse extends PbhhBot {
  private abortController: AbortController | null = null;
  private running = false;
  private disposeReconnect: (() => void) | null = null;
  private sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private reconnectDelay = 2000;

  startSse() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stopSse() {
    this.running = false;
    this.cleanup();
  }

  private cleanup() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.sseReader) {
      void this.sseReader.cancel().catch(() => undefined);
      this.sseReader = null;
    }
    if (this.disposeReconnect) {
      this.disposeReconnect();
      this.disposeReconnect = null;
    }
  }

  private async loop() {
    while (this.running) {
      this.abortController = new AbortController();
      try {
        const res = await this.http.fetchRaw('/api/events/sse', {
          method: 'GET',
          headers: {
            accept: 'text/event-stream',
            authorization: `Bearer ${this.token}`,
            'cache-control': 'no-cache',
          },
          signal: this.abortController.signal,
        });
        if (!res.ok || !res.body) {
          this.log.warn('SSE 连接失败：HTTP %s', res.status);
          throw new Error(`SSE HTTP ${res.status}`);
        }
        this.roomManager.restoreRooms(this.token);
        const reader = res.body.getReader();
        this.sseReader = reader;
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (this.running) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line || line.startsWith(':')) continue;
            if (!line.startsWith('data:')) continue;
            const json = line.slice('data:'.length).trim();
            if (!json) continue;
            try {
              const evt = JSON.parse(json) as SseEvent;
              if (this.config.debug) {
                this.log.debug('SSE raw event: %o', evt);
              }
              await this.handleEvent(evt);
            } catch {
              if (this.config.debug) {
                this.log.debug('SSE JSON 解析失败：%s', json);
              }
            }
          }
        }
        this.log.warn('SSE 连接已断开，准备重连');
      } catch (err) {
        if (!this.running) return;
        if (this.abortController?.signal.aborted) return;
        this.log.warn('SSE 异常，准备重连：%o', err);
      } finally {
        if (this.sseReader) {
          await this.sseReader.cancel().catch(() => undefined);
          this.sseReader = null;
        }
        this.abortController = null;
      }
      await new Promise<void>((resolve) => {
        this.disposeReconnect = this.ctx.setTimeout(() => {
          this.disposeReconnect = null;
          resolve();
        }, this.reconnectDelay);
      });
    }
  }

  private async handleLikedEvent(evt: SseEvent) {
    const p = evt.payload as Record<string, unknown>;
    const postId = Number(p.postId);
    const actorUsername = String(p.actorUsername || '');
    const liked = Boolean(p.liked);
    const timestamp = Number(evt.timestamp || Date.now());
    if (!liked) return;
    if (!Number.isFinite(postId) || !actorUsername) return;
    let rootId = postId;
    let postTitle = getPostDisplayName(rootId);
    try {
      const post = await this.internal.getPost(this.token, postId);
      rootId = Number(post.rootId || post.id || postId);
      postTitle = getPostDisplayName(rootId, post.title);
    } catch {
    }
    const eventData = {
      type: 'post.liked',
      timestamp,
      platform: this.platform,
      botId: this.selfId,
      actorUsername,
      postId,
      rootId,
      title: postTitle,
      liked,
    };
    (this.ctx.emit as unknown as (name: string, data: unknown) => void)('pbhh/like', eventData);
    (this.ctx.emit as unknown as (name: string, data: unknown) => void)('pbhh/like-created', eventData);
    if (this.config.debug) {
      this.log.debug('emit pbhh/like: %o', eventData);
    }
  }

  private async handleEvent(evt: SseEvent) {
    if (!evt || !evt.topic) return;
    if (evt.topic === 'post.liked') {
      await this.handleLikedEvent(evt);
      return;
    }
    if (evt.topic === 'notify.post.replied') {
      if (this.config.replyOnlyToBot) {
        await this.handleNotifyPostReplied(evt);
      }
      return;
    }
    if (evt.topic === 'post.replied') {
      if (!this.config.replyOnlyToBot) {
        await this.handlePostReplied(evt);
      }
      return;
    }
    if (evt.topic === 'notify.mail.received') {
      await this.handleNotifyMailReceived(evt);
      return;
    }
    if (this.config.debug) {
      this.log.debug('SSE topic=%s', evt.topic);
    }
  }

  private async handleNotifyMailReceived(evt: SseEvent) {
    const payload = evt.payload as Record<string, unknown>;
    const recipientUsername = String(payload.recipientUsername || '');
    const emailId = Number(payload.emailId);
    const timestamp = Number(evt.timestamp || Date.now());
    if (recipientUsername && recipientUsername !== this.selfId) return;
    if (!Number.isFinite(emailId)) return;
    try {
      const mail = await this.internal.getMail(this.token, emailId);
      await this.dispatchMailSession(mail, timestamp);
    } catch (err) {
      this.log.warn('处理邮件事件失败：%o', err);
    }
  }

  private async handleNotifyPostReplied(evt: SseEvent) {
    const p = evt.payload as Record<string, unknown>;
    const actorUsername = String(p.actorUsername || '');
    const actorNickname = String(p.actorNickname || actorUsername);
    const postId = Number(p.postId);
    const replyId = Number(p.replyId);
    const replyContent = String(p.replyContent || '');
    const timestamp = Number(evt.timestamp || Date.now());
    if (!Number.isFinite(postId) || !Number.isFinite(replyId)) return;
    let userAvatar = '';
    let userName = actorNickname;
    try {
      const u = await this.getUser(actorUsername);
      userName = u.name || actorNickname;
      userAvatar = u.avatar || '';
    } catch {
    }
    let rootId = postId;
    let postTitle = getPostDisplayName(postId);
    try {
      const post = await this.internal.getPost(this.token, postId);
      rootId = Number(post.rootId || post.id || postId);
      postTitle = getPostDisplayName(rootId, post.title);
    } catch {
    }
    const guildId = String(rootId);
    const channelId = `post:${rootId}`;
    let quote: Message | undefined;
    try {
      const thread = await this.internal.getThread(this.token, rootId);
      const current = thread.find((r) => r.id === replyId);
      if (this.config.debug) {
        this.log.debug('quote probe: rootId=%s replyId=%s thread=%d current=%s', rootId, replyId, thread.length, Boolean(current));
      }
      if (current) {
        const parentId = Number(current.parentId);
        if (this.config.debug) {
          this.log.debug('quote probe: current.id=%s parentId=%s current.parentContent.len=%d', current.id, parentId, String(current.parentContent || '').length);
        }
        if (Number.isFinite(parentId) && parentId > 0) {
          const parent = thread.find((r) => r.id === parentId);
          if (this.config.debug) {
            this.log.debug('quote probe: parentFound=%s', Boolean(parent));
          }
          if (parent) {
            const parentContent = String(parent.content || '');
            const parentUsername = String(parent.username || '');
            if (parentContent) {
              quote = {
                id: String(parentId),
                content: parentContent,
                user: parentUsername ? { id: parentUsername } : undefined,
                channel: { id: channelId, type: Universal.Channel.Type.TEXT },
                guild: { id: guildId },
                createdAt: timestamp,
                updatedAt: timestamp,
              };
            }
          } else {
            const parentContent = String(current.parentContent || '');
            const parentUsername = String(current.parentUsername || '');
            if (parentContent) {
              quote = {
                id: String(parentId),
                content: parentContent,
                user: parentUsername ? { id: parentUsername } : undefined,
                channel: { id: channelId, type: Universal.Channel.Type.TEXT },
                guild: { id: guildId },
                createdAt: timestamp,
                updatedAt: timestamp,
              };
            }
          }
        }
      }
    } catch (err) {
      if (this.config.debug) {
        this.log.debug('quote probe: getThread failed: %o', err);
      }
    }
    if (!quote) {
      const postContent = typeof p.postContent === 'string' ? p.postContent : '';
      if (postContent) {
        quote = {
          id: String(rootId),
          content: postContent,
          channel: { id: channelId, type: Universal.Channel.Type.TEXT },
          guild: { id: guildId },
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      } else {
        try {
          const post = await this.internal.getPost(this.token, rootId);
          quote = {
            id: String(rootId),
            content: post.content || '',
            user: post.username ? { id: String(post.username) } : undefined,
            channel: { id: channelId, type: Universal.Channel.Type.TEXT },
            guild: { id: guildId },
            createdAt: timestamp,
            updatedAt: timestamp,
          };
        } catch {
          quote = undefined;
        }
      }
    }
    const session = this.session({
      type: 'message',
      timestamp,
      selfId: this.selfId,
      platform: this.platform,
      user: {
        id: actorUsername,
        name: userName,
        avatar: userAvatar,
      },
      guild: { id: guildId, name: postTitle },
      channel: { id: channelId, name: postTitle, type: Universal.Channel.Type.TEXT },
      message: {
        id: String(replyId),
        content: replyContent,
        quote,
      },
    });
    (session.event as unknown as Record<string, unknown>).quote = quote;
    session.messageId = String(replyId);
    session.content = replyContent;
    session.quote = quote;
    if (this.config.debug) {
      this.log.debug('SSE dispatch session: %o', session.toJSON());
    }
    this.dispatch(session);
    this.log.debug('已 dispatch notify.post.replied：post=%s reply=%s', postId, replyId);
  }

  private async handlePostReplied(evt: SseEvent) {
    const p = evt.payload as Record<string, unknown>;
    const actorUsername = String(p.actorUsername || '');
    const parentId = Number(p.parentId);
    const replyId = Number(p.replyId);
    const timestamp = Number(evt.timestamp || Date.now());
    if (!Number.isFinite(parentId) || !Number.isFinite(replyId)) return;
    if (actorUsername === this.selfId) return;
    if (this.config.debug) {
      this.log.debug('SSE post.replied: parentId=%s replyId=%s actor=%s', parentId, replyId, actorUsername);
    }
    let userAvatar = '';
    let userName = actorUsername;
    try {
      const u = await this.getUser(actorUsername);
      userName = u.name || actorUsername;
      userAvatar = u.avatar || '';
    } catch { }
    let rootId = parentId;
    let postTitle = getPostDisplayName(parentId);
    try {
      const post = await this.internal.getPost(this.token, parentId);
      rootId = Number(post.rootId || post.id || parentId);
      postTitle = getPostDisplayName(rootId, post.title);
    } catch { }
    const guildId = String(rootId);
    const channelId = `post:${rootId}`;
    let replyContent = '';
    let quote: Message | undefined;
    try {
      const thread = await this.internal.getThread(this.token, rootId);
      const current = thread.find((r) => r.id === replyId);
      if (this.config.debug) {
        this.log.debug('post.replied quote probe: replyId=%s found=%s', replyId, Boolean(current));
      }
      if (current) {
        replyContent = current.content;
        const qParentId = Number(current.parentId);
        if (Number.isFinite(qParentId) && qParentId > 0) {
          const parent = thread.find((r) => r.id === qParentId);
          const qContent = parent ? String(parent.content || '') : String(current.parentContent || '');
          const qUsername = parent ? String(parent.username || '') : String(current.parentUsername || '');
          if (qContent) {
            quote = {
              id: String(qParentId),
              content: qContent,
              user: qUsername ? { id: qUsername } : undefined,
              channel: { id: channelId, type: Universal.Channel.Type.TEXT },
              guild: { id: guildId },
              createdAt: timestamp,
              updatedAt: timestamp,
            };
          }
        }
      }
    } catch (err) {
      if (this.config.debug) this.log.debug('post.replied getThread failed: %o', err);
    }
    if (!replyContent) return;
    const session = this.session({
      type: 'message',
      timestamp,
      selfId: this.selfId,
      platform: this.platform,
      user: { id: actorUsername, name: userName, avatar: userAvatar },
      guild: { id: guildId, name: postTitle },
      channel: { id: channelId, name: postTitle, type: Universal.Channel.Type.TEXT },
      message: { id: String(replyId), content: replyContent, quote },
    });
    (session.event as unknown as Record<string, unknown>).quote = quote;
    session.messageId = String(replyId);
    session.content = replyContent;
    session.quote = quote;
    if (this.config.debug) {
      this.log.debug('SSE dispatch post.replied session: %o', session.toJSON());
    }
    this.dispatch(session);
    this.log.debug('已 dispatch post.replied：parentId=%s replyId=%s', parentId, replyId);
  }
}
