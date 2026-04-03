import { Universal } from 'koishi';
import { PbhhBotWithSse } from '../sse';
import { isDirectId, isRoomId, makeChannelId, makeDirectId, makeRoomId, parseChannelId, parseDirectId, parseGuildId, parseRoomId } from '../../utils/ids';
import { isSameMailPeer } from '../../utils/mail';
import { getPostDisplayName } from '../../utils/post';
import { adaptRoomMessageContent, createRoomQuote, type RoomEntityLookup, type RoomEntityResolver } from '../../message/room';
export class PbhhBotWithAPI extends PbhhBotWithSse {
  protected getToken(): string {
    const token = this.tokenStore.get(this.selfId);
    if (!token) throw new Error('token 不存在，请检查登录流程');
    return token;
  }
  async getGuildList(): Promise<Universal.List<Universal.Guild>> {
    const token = this.getToken();
    const [posts, rooms] = await Promise.all([
      this.internal.listPosts(token).catch(() => []),
      this.internal.listRooms(token).catch(() => []),
    ]);
    return {
      data: [
        ...posts.map((p) => ({
          id: `post:${p.id}`,
          name: getPostDisplayName(p.id, p.title),
          avatar: '',
        })),
        ...rooms.map((r) => ({
          id: makeRoomId(r.id),
          name: r.name,
          avatar: '',
        })),
      ],
    };
  }
  async getChannelList(guildId: string): Promise<Universal.List<Universal.Channel>> {
    if (isRoomId(guildId)) {
      const roomId = parseRoomId(guildId);
      if (roomId === null) throw new Error(`非法 room guildId: ${guildId}`);
      const rooms = await this.internal.listRooms(this.getToken());
      const room = rooms.find((r) => r.id === roomId);
      return {
        data: [{
          id: makeRoomId(roomId),
          name: room ? room.name : `room#${roomId}`,
          type: Universal.Channel.Type.TEXT,
        }],
      };
    }
    const postId = parseGuildId(guildId);
    if (postId === null) throw new Error(`非法 guildId: ${guildId}`);
    return {
      data: [{
        id: makeChannelId(postId),
        name: getPostDisplayName(postId),
        type: Universal.Channel.Type.TEXT,
      }],
    };
  }
  async getGuild(guildId: string): Promise<Universal.Guild> {
    if (isRoomId(guildId)) {
      const roomId = parseRoomId(guildId);
      if (roomId === null) return { id: guildId, name: guildId };
      const rooms = await this.internal.listRooms(this.getToken());
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return { id: guildId, name: guildId };
      return { id: makeRoomId(room.id), name: room.name, avatar: '' };
    }
    const postId = parseGuildId(guildId);
    if (postId === null) return { id: guildId, name: guildId };
    const p = await this.internal.getPost(this.getToken(), postId);
    return {
      id: String(p.id),
      name: getPostDisplayName(p.id, p.title),
      avatar: '',
    };
  }
  async getChannel(channelId: string, guildId?: string): Promise<Universal.Channel> {
    if (isDirectId(channelId)) {
      const userId = parseDirectId(channelId);
      if (userId === null) return { id: channelId, name: channelId, type: Universal.Channel.Type.DIRECT };
      const user = await this.getDirectUser(userId);
      return {
        id: makeDirectId(user.id),
        name: user.name || user.id,
        type: Universal.Channel.Type.DIRECT,
      };
    }
    if (isRoomId(channelId)) {
      const roomId = parseRoomId(channelId);
      if (roomId === null) return { id: channelId, name: channelId, type: Universal.Channel.Type.TEXT };
      const rooms = await this.internal.listRooms(this.getToken());
      const room = rooms.find((r) => r.id === roomId);
      return {
        id: channelId,
        name: room ? room.name : `room#${roomId}`,
        type: Universal.Channel.Type.TEXT,
      };
    }
    const postId = parseChannelId(channelId);
    if (postId === null) {
      return {
        id: channelId,
        name: channelId,
        type: Universal.Channel.Type.TEXT,
      };
    }
    const p = await this.internal.getPost(this.getToken(), postId);
    return {
      id: makeChannelId(p.id),
      name: getPostDisplayName(p.id, p.title),
      type: Universal.Channel.Type.TEXT,
    };
  }
  async getMessageList(channelId: string): Promise<Universal.List<Universal.Message>> {
    if (isDirectId(channelId)) {
      const userId = parseDirectId(channelId);
      if (userId === null) throw new Error(`非法 private channelId: ${channelId}`);
      const mails = await this.internal.getMailInbox(this.getToken());
      const related = mails.filter((mail) => isSameMailPeer(mail.fromAddress, userId));
      related.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const messages: Universal.Message[] = [];
      for (const mail of related) {
        try {
          const detail = await this.internal.getMail(this.getToken(), mail.id);
          const user = await this.getDirectUser(detail.fromAddress);
          messages.push({
            id: `mail:${detail.id}`,
            content: this.buildDirectMessageContent(detail.subject, detail.text, detail.html),
            channel: { id: channelId, type: Universal.Channel.Type.DIRECT },
            user,
            timestamp: new Date(detail.createdAt).getTime(),
          });
        } catch (err) {
          if (this.config.debug) {
            this.log.debug('getMessageList mail detail failed: %o', err);
          }
        }
      }
      return { data: messages };
    }
    if (isRoomId(channelId)) {
      const roomId = parseRoomId(channelId);
      if (roomId === null) throw new Error(`非法 room channelId: ${channelId}`);
      const msgs = await this.internal.getRoomMessages(this.getToken(), roomId);
      const resolver = createRoomEntityResolver(this);
      const data: Universal.Message[] = [];
      for (const m of msgs) {
        const timestamp = new Date(m.createdAt).getTime();
        data.push({
          id: String(m.id),
          content: await adaptRoomMessageContent(m.content, resolver),
          channel: { id: channelId, type: Universal.Channel.Type.TEXT },
          user: {
            id: m.username,
            name: m.nickname || m.username,
            avatar: '',
          },
          timestamp,
          quote: m.replyTo ? await createRoomQuote(roomId, m.replyTo, timestamp, resolver) : undefined,
        });
      }
      return {
        data,
      };
    }
    const postId = parseChannelId(channelId);
    if (postId === null) throw new Error(`非法 channelId: ${channelId}`);
    const token = this.getToken();
    const post = await this.internal.getPost(token, postId);
    const thread = await this.internal.getThread(token, postId);
    const messages: Universal.Message[] = [];
    messages.push({
      id: String(post.id),
      content: post.content,
      channel: { id: makeChannelId(postId), type: Universal.Channel.Type.TEXT },
      user: {
        id: post.username,
        name: post.nickname || post.username,
        avatar: '',
      },
      timestamp: post.createdAt,
    });
    for (const r of thread) {
      messages.push({
        id: String(r.id),
        content: r.content,
        channel: { id: makeChannelId(postId), type: Universal.Channel.Type.TEXT },
        user: {
          id: r.username,
          name: r.nickname || r.username,
          avatar: '',
        },
        timestamp: r.createdAt,
      });
    }
    return { data: messages };
  }
  async getGuildMemberList(guildId: string): Promise<Universal.List<Universal.GuildMember>> {
    if (isRoomId(guildId)) {
      const roomId = parseRoomId(guildId);
      if (roomId === null) return { data: [] };
      const msgs = await this.internal.getRoomMessages(this.getToken(), roomId);
      const users = new Map<string, Universal.User>();
      for (const m of msgs) {
        if (!users.has(m.username)) {
          users.set(m.username, {
            id: m.username,
            name: m.nickname || m.username,
            avatar: '',
          });
        }
      }
      return { data: [...users.values()].map((u) => ({ user: u })) };
    }
    const postId = parseGuildId(guildId);
    if (postId === null) throw new Error(`非法 guildId: ${guildId}`);
    const token = this.getToken();
    const post = await this.internal.getPost(token, postId);
    const thread = await this.internal.getThread(token, postId);
    const users = new Map<string, Universal.User>();
    users.set(post.username, {
      id: post.username,
      name: post.nickname || post.username,
      avatar: '',
    });
    for (const r of thread) {
      if (!users.has(r.username)) {
        users.set(r.username, {
          id: r.username,
          name: r.nickname || r.username,
          avatar: '',
        });
      }
    }
    return {
      data: [...users.values()].map((u) => ({ user: u })),
    };
  }
}

function createRoomEntityResolver(lookup: RoomEntityLookup): RoomEntityResolver {
  const userCache = new Map<string, Promise<string>>();
  const channelCache = new Map<string, Promise<string>>();
  return {
    resolveUserName(userId) {
      let task = userCache.get(userId);
      if (!task) {
        task = lookup.getUser(userId)
          .then((user) => user.name || userId)
          .catch(() => userId);
        userCache.set(userId, task);
      }
      return task;
    },
    resolveChannelName(channelId) {
      let task = channelCache.get(channelId);
      if (!task) {
        task = lookup.getChannel(`room:${channelId}`)
          .then((channel) => channel.name || channelId)
          .catch(() => channelId);
        channelCache.set(channelId, task);
      }
      return task;
    },
  };
}
