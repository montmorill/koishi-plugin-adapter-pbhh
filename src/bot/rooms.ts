import { WebSocket } from 'undici';
import type { Context } from 'koishi';
import type { PbhhLogger } from '../utils/logger';
export interface RoomWsMessage
{
  type: 'message';
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  content: string;
  createdAt: string;
}
export interface RoomUserInfo
{
  username: string;
  nickname: string;
  avatar: string;
}
export interface RoomWsRosterEvent
{
  type: 'roster';
  users: RoomUserInfo[];
  observers: number;
}
export interface RoomWsJoinEvent
{
  type: 'join';
  username: string;

  userInfo: RoomUserInfo;
}
export interface RoomWsLeaveEvent
{
  type: 'leave';
  username: string;

  userInfo: RoomUserInfo;
}
export type RoomWsEvent = RoomWsRosterEvent | RoomWsJoinEvent | RoomWsLeaveEvent;
export type OnRoomMessage = (roomId: number, msg: RoomWsMessage) => Promise<void>;
export type OnRoomEvent = (roomId: number, event: RoomWsEvent) => Promise<void>;
interface RoomConnection
{
  ws: InstanceType<typeof WebSocket>;
  roomId: number;
  stopPing: (() => void) | null;
}
function toWsUrl(baseUrl: string, path: string): string
{
  const wsBase = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  const base = wsBase.endsWith('/') ? wsBase.slice(0, -1) : wsBase;
  return `${base}${path}`;
}
export class RoomWsManager
{
  private connections = new Map<number, RoomConnection>();

  private userCache = new Map<number, Map<string, RoomUserInfo>>();
  constructor(
    private ctx: Context,
    private baseUrl: string,
    private log: PbhhLogger,
    private onMessage: OnRoomMessage,
    private onRoomEvent: OnRoomEvent,
    private selfUsername: string,
    private debug: boolean,
  ) { }
  isJoined(roomId: number): boolean
  {
    const conn = this.connections.get(roomId);
    return !!conn && conn.ws.readyState === 1;
  }
  joinRoom(roomId: number, token: string): void
  {
    if (this.connections.has(roomId))
    {
      this.log.debug('RoomWs: 已连接 roomId=%d，跳过重复加入', roomId);
      return;
    }
    this._connectPersistent(roomId, token);
  }
  leaveRoom(roomId: number): void
  {
    const conn = this.connections.get(roomId);
    if (!conn) return;
    this._closeConn(conn);
    this.connections.delete(roomId);
    this.userCache.delete(roomId);
    this.log.debug('RoomWs: 已退出 roomId=%d', roomId);
  }
  async sendMessage(roomId: number, token: string, content: string): Promise<string[]>
  {
    const conn = this.connections.get(roomId);
    if (conn && conn.ws.readyState === 1)
    {
      conn.ws.send(JSON.stringify({ type: 'message', content }));
      return [];
    }
    await this._sendTemp(roomId, token, content);
    return [];
  }
  disposeAll(): void
  {
    for (const conn of this.connections.values())
    {
      this._closeConn(conn);
    }
    this.connections.clear();
    this.userCache.clear();
    this.log.debug('RoomWs: 已清理所有连接');
  }
  private _connectPersistent(roomId: number, token: string): void
  {
    const url = toWsUrl(this.baseUrl, `/api/rooms/ws/${roomId}?token=${encodeURIComponent(token)}`);
    const ws = new WebSocket(url);
    const conn: RoomConnection = { ws, roomId, stopPing: null };
    this.connections.set(roomId, conn);
    ws.onopen = () =>
    {
      this.log.debug('RoomWs: 连接已打开 roomId=%d', roomId);
      conn.stopPing = this.ctx.setInterval(() =>
      {
        if (ws.readyState === 1)
        {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25_000);
    };
    ws.onmessage = (event) =>
    {
      const raw = String((event as { data: unknown; }).data);
      if (this.debug)
      {
        this.log.debug('RoomWs recv roomId=%d: %s', roomId, raw.slice(0, 200));
      }
      let parsed: Record<string, unknown>;
      try
      {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch
      {
        return;
      }
      const type = String(parsed.type || '');
      if (type === 'ping')
      {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (type === 'pong') return;

      if (type === 'roster')
      {
        const rawUsers = Array.isArray(parsed.users) ? (parsed.users as Array<Record<string, unknown>>) : [];
        const cache = new Map<string, RoomUserInfo>();
        for (const u of rawUsers)
        {
          const uname = String(u.username || '');
          if (!uname) continue;
          cache.set(uname, {
            username: uname,
            nickname: String(u.nickname || uname),
            avatar: String(u.avatar || ''),
          });
        }
        this.userCache.set(roomId, cache);
        void this.onRoomEvent(roomId, {
          type: 'roster',
          users: [...cache.values()],
          observers: Number(parsed.observers || 0),
        });
        return;
      }

      if (type === 'join')
      {
        const username = String(parsed.username || '');
        if (!username) return;
        let cache = this.userCache.get(roomId);
        if (!cache) { cache = new Map(); this.userCache.set(roomId, cache); }
        const userInfo: RoomUserInfo = cache.get(username) ?? { username, nickname: username, avatar: '' };
        cache.set(username, userInfo);
        void this.onRoomEvent(roomId, { type: 'join', username, userInfo });
        return;
      }

      if (type === 'leave')
      {
        const username = String(parsed.username || '');
        if (!username) return;
        const cache = this.userCache.get(roomId);
        const userInfo: RoomUserInfo = cache?.get(username) ?? { username, nickname: username, avatar: '' };
        cache?.delete(username);
        void this.onRoomEvent(roomId, { type: 'leave', username, userInfo });
        return;
      }
      if (type === 'message')
      {
        const username = String(parsed.username || '');
        if (username === this.selfUsername) return;
        const msg: RoomWsMessage = {
          type: 'message',
          id: Number(parsed.id),
          username,
          nickname: String(parsed.nickname || username),
          avatar: String(parsed.avatar || ''),
          content: String(parsed.content || ''),
          createdAt: String(parsed.createdAt || new Date().toISOString()),
        };
        void this.onMessage(roomId, msg);
      }
    };
    ws.onclose = () =>
    {
      this.log.debug('RoomWs: 连接关闭 roomId=%d', roomId);
      conn.stopPing?.();
      conn.stopPing = null;
      this.connections.delete(roomId);

      this.userCache.delete(roomId);
    };
    ws.onerror = () =>
    {
      this.log.warn('RoomWs: 连接错误 roomId=%d', roomId);
    };
  }
  private _sendTemp(roomId: number, token: string, content: string): Promise<void>
  {
    return new Promise<void>((resolve) =>
    {
      const url = toWsUrl(this.baseUrl, `/api/rooms/ws/${roomId}?token=${encodeURIComponent(token)}`);
      const ws = new WebSocket(url);
      let done = false;
      const finish = () =>
      {
        if (!done)
        {
          done = true;
          if (ws.readyState === 0 || ws.readyState === 1) ws.close();
          resolve();
        }
      };
      const disposeTimeout = this.ctx.setTimeout(finish, 5_000);
      ws.onopen = () =>
      {
        ws.send(JSON.stringify({ type: 'message', content }));
        this.ctx.setTimeout(() =>
        {
          disposeTimeout();
          finish();
        }, 1_500);
      };
      ws.onerror = () =>
      {
        disposeTimeout();
        finish();
      };
      ws.onmessage = (event) =>
      {
        try
        {
          const msg = JSON.parse(String((event as { data: unknown; }).data)) as { type: string; };
          if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch
        {
        }
      };
    });
  }
  private _closeConn(conn: RoomConnection): void
  {
    conn.stopPing?.();
    conn.stopPing = null;
    const state = conn.ws.readyState;
    if (state === 0 || state === 1)
    {
      conn.ws.close();
    }
  }
}
