import type { FetchClient } from '../http';
import type { PbhhLogger } from '../../utils/logger';
export interface LoginResponse
{
  token: string;
}
export interface MeResponse
{
  username: string;
  nickname: string;
  avatar: string;
  capabilities: string[];
}
export interface UserResponse
{
  username: string;
  nickname: string;
  avatar: string;
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
}
export interface Post
{
  id: number;
  title?: string;
  content: string;
  username: string;
  nickname: string;
  avatar: string;
  createdAt: number;
  likeCount: number;
  replyCount: number;
  liked: boolean;
  rootId?: number;
}
export interface ThreadReply
{
  id: number;
  parentId: number;
  content: string;
  username: string;
  nickname: string;
  avatar: string;
  createdAt: number;
  likeCount: number;
  liked: boolean;
  parentUsername: string;
  parentNickname: string;
  parentContent: string;
}
export interface LikeResponse
{
  liked: boolean;
}
export interface Notification
{
  id: number;
  type: 'reply' | 'like' | 'post';
  actorUsername: string;
  actorNickname: string;
  actorAvatar: string;
  postId: number;
  postContent: string;
  replyId?: number;
  replyContent?: string;
  read: boolean;
  createdAt: number;
}
export interface Room
{
  id: number;
  name: string;
  createdBy: string;
  createdAt: string;
}
export interface RoomMessage
{
  id: number;
  content: string;
  createdAt: string;
  username: string;
  nickname: string;
  avatar: string;
}
function authHeaders(token: string): HeadersInit
{
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}
export class PbhhInternal
{
  constructor(private http: FetchClient, private logger: PbhhLogger) { }
  async login(username: string, password: string): Promise<string>
  {
    const res = await this.http.fetchJson<LoginResponse>('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res?.token) throw new Error('登录失败：未返回 token');
    return res.token;
  }
  async me(token: string): Promise<MeResponse>
  {
    return this.http.fetchJson<MeResponse>('/api/me', {
      method: 'GET',
      headers: authHeaders(token),
    });
  }
  async patchMe(token: string, payload: { nickname?: string; avatar?: string; }): Promise<MeResponse>
  {
    return this.http.fetchJson<MeResponse>('/api/me', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
  }
  async setNotificationPrefs(token: string, prefs: { like: boolean; reply: boolean; post: boolean; }): Promise<{ like: boolean; reply: boolean; post: boolean; }>
  {
    return this.http.fetchJson('/api/me/notification-prefs', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(prefs),
    });
  }
  async getUser(token: string, username: string): Promise<UserResponse>
  {
    return this.http.fetchJson<UserResponse>(`/api/users/${encodeURIComponent(username)}`, {
      method: 'GET',
      headers: authHeaders(token),
    });
  }
  async listPosts(token: string, username?: string): Promise<Post[]>
  {
    const qs = username ? `?username=${encodeURIComponent(username)}` : '';
    return this.http.fetchJson<Post[]>(`/api/posts${qs}`, {
      method: 'GET',
      headers: authHeaders(token),
    });
  }
  async getPost(token: string, postId: number): Promise<Post>
  {
    return this.http.fetchJson<Post>(`/api/posts/${postId}`, {
      method: 'GET',
      headers: authHeaders(token),
    });
  }
  async getThread(token: string, postId: number): Promise<ThreadReply[]>
  {
    return this.http.fetchJson<ThreadReply[]>(`/api/posts/${postId}/thread`, {
      method: 'GET',
      headers: authHeaders(token),
    });
  }
  async createPost(token: string, payload: { title?: string; content: string; }): Promise<Post>
  {
    return this.http.fetchJson<Post>('/api/posts', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
  }
  async deletePost(token: string, postId: number): Promise<void>
  {
    await this.http.fetchJson<{}>(`/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
  }
  async reply(token: string, replyToId: number, content: string): Promise<number>
  {
    await this.http.fetchRaw(`/api/posts/${replyToId}/reply`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ content }),
    });
    let rootId = replyToId;
    try
    {
      const p = await this.getPost(token, replyToId);
      rootId = Number(p.rootId || p.id || replyToId);
    } catch
    {
    }
    try
    {
      const thread = await this.getThread(token, rootId);
      const self = await this.me(token);
      const selfUsername = self.username;
      for (let i = thread.length - 1; i >= 0; i--)
      {
        const r = thread[i];
        if (r.username !== selfUsername) continue;
        if (r.parentId !== replyToId) continue;
        if (r.content !== content) continue;
        return r.id;
      }
    } catch
    {
    }
    return 0;
  }
  async like(token: string, postId: number): Promise<LikeResponse>
  {
    return this.http.fetchJson<LikeResponse>(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  }
  async notifications(token: string): Promise<Notification[]>
  {
    return this.http.fetchJson<Notification[]>('/api/notifications', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
  }
  async listRooms(token: string): Promise<Room[]>
  {
    return this.http.fetchJson<Room[]>('/api/rooms', {
      method: 'GET',
      headers: authHeaders(token),
    });
  }
  async getRoomMessages(token: string, roomId: number): Promise<RoomMessage[]>
  {
    return this.http.fetchJson<RoomMessage[]>(`/api/rooms/${roomId}/messages`, {
      method: 'GET',
      headers: authHeaders(token),
    });
  }
  async createRoom(token: string, name: string): Promise<Room>
  {
    return this.http.fetchJson<Room>('/api/rooms', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name }),
    });
  }
}
