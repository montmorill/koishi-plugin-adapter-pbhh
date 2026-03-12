import { Universal } from 'koishi';
import { PbhhBotWithSse } from '../sse';
import { makeChannelId, parseChannelId, parseGuildId, makeRoomId, parseRoomId, isRoomId } from '../../utils/ids';
export class PbhhBotWithAPI extends PbhhBotWithSse
{
  protected getToken(): string
  {
    const token = this.tokenStore.get(this.selfId);
    if (!token) throw new Error('token 不存在，请检查登录流程');
    return token;
  }
  async getGuildList(): Promise<Universal.List<Universal.Guild>>
  {
    const token = this.getToken();
    const [posts, rooms] = await Promise.all([
      this.internal.listPosts(token).catch(() => []),
      this.internal.listRooms(token).catch(() => []),
    ]);
    return {
      data: [
        ...posts.map((p) => ({
          id: `post:${p.id}`,
          name: p.title ? p.title : `post#${p.id}`,
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
  async getChannelList(guildId: string): Promise<Universal.List<Universal.Channel>>
  {
    if (isRoomId(guildId))
    {
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
        name: `post#${postId}`,
        type: Universal.Channel.Type.TEXT,
      }],
    };
  }
  async getGuild(guildId: string): Promise<Universal.Guild>
  {
    if (isRoomId(guildId))
    {
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
      name: p.title ? p.title : `post#${p.id}`,
      avatar: '',
    };
  }
  async getChannel(channelId: string, guildId?: string): Promise<Universal.Channel>
  {
    if (isRoomId(channelId))
    {
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
    if (postId === null)
    {
      return {
        id: channelId,
        name: channelId,
        type: Universal.Channel.Type.TEXT,
      };
    }
    const p = await this.internal.getPost(this.getToken(), postId);
    return {
      id: makeChannelId(p.id),
      name: p.title ? p.title : `post#${p.id}`,
      type: Universal.Channel.Type.TEXT,
    };
  }
  async getMessageList(channelId: string): Promise<Universal.List<Universal.Message>>
  {
    if (isRoomId(channelId))
    {
      const roomId = parseRoomId(channelId);
      if (roomId === null) throw new Error(`非法 room channelId: ${channelId}`);
      const msgs = await this.internal.getRoomMessages(this.getToken(), roomId);
      return {
        data: msgs.map((m) => ({
          id: String(m.id),
          content: m.content,
          channel: { id: channelId, type: Universal.Channel.Type.TEXT },
          user: {
            id: m.username,
            name: m.nickname || m.username,
            avatar: '',
          },
          timestamp: new Date(m.createdAt).getTime(),
        })),
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
    for (const r of thread)
    {
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
  async getGuildMemberList(guildId: string): Promise<Universal.List<Universal.GuildMember>>
  {
    if (isRoomId(guildId))
    {
      const roomId = parseRoomId(guildId);
      if (roomId === null) return { data: [] };
      const msgs = await this.internal.getRoomMessages(this.getToken(), roomId);
      const users = new Map<string, Universal.User>();
      for (const m of msgs)
      {
        if (!users.has(m.username))
        {
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
    for (const r of thread)
    {
      if (!users.has(r.username))
      {
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
