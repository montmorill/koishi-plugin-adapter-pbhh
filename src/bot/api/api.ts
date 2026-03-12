import { Universal } from 'koishi';
import { PbhhBot } from '../base';
import { makeChannelId, parseChannelId, parseGuildId } from '../../utils/ids';
export class PbhhBotWithAPI extends PbhhBot
{
  protected getToken(): string
  {
    const token = this.tokenStore.get(this.selfId);
    if (!token) throw new Error('token 不存在，请检查登录流程');
    return token;
  }
  async getGuildList(): Promise<Universal.List<Universal.Guild>>
  {
    const posts = await this.internal.listPosts(this.getToken());
    return {
      data: posts.map((p) => ({
        id: `post:${p.id}`,
        name: p.title ? p.title : `post#${p.id}`,
        avatar: '',
      })),
    };
  }
  async getChannelList(guildId: string): Promise<Universal.List<Universal.Channel>>
  {
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
