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

interface PendingEntry
{
  content: string;
  resolve: (id: string) => void;
  reject: (err: Error) => void;
  cancelTimeout: () => void;
}

interface RoomConnection
{
  ws: InstanceType<typeof WebSocket>;
  roomId: number;
  token: string;
  closing: boolean;
  stopPing: (() => void) | null;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;

function toWsUrl(baseUrl: string, path: string): string
{
  const wsBase = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  const base = wsBase.endsWith('/') ? wsBase.slice(0, -1) : wsBase;
  return `${base}${path}`;
}

export class RoomWsManager
{
  private connections = new Map<number, RoomConnection>();
  private desiredRooms = new Map<number, string>();
  private reconnectTimers = new Map<number, () => void>();
  private userCache = new Map<number, Map<string, RoomUserInfo>>();
  private pendingMessages = new Map<number, PendingEntry[]>();

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
    return !!conn && conn.ws.readyState === WS_OPEN;
  }

  joinRoom(roomId: number, token: string): void
  {
    this.desiredRooms.set(roomId, token);
    const conn = this.connections.get(roomId);
    if (conn)
    {
      conn.token = token;
      if (conn.ws.readyState === WS_OPEN || conn.ws.readyState === WS_CONNECTING)
      {
        this.log.debug('RoomWs: 已存在活动连接 roomId=%d，跳过重复加入', roomId);
        return;
      }
      this.log.debug('RoomWs: 检测到失效连接，准备重建 roomId=%d', roomId);
      this._closeConn(conn);
      this.connections.delete(roomId);
    }
    this._clearReconnectTimer(roomId);
    this._connectPersistent(roomId, token);
  }

  leaveRoom(roomId: number): void
  {
    this.desiredRooms.delete(roomId);
    this._clearReconnectTimer(roomId);
    const conn = this.connections.get(roomId);
    if (!conn) return;
    this._closeConn(conn);
    this.connections.delete(roomId);
    this.userCache.delete(roomId);
    this.log.debug('RoomWs: 已退出聊天室 roomId=%d', roomId);
  }

  restoreRooms(token: string): void
  {
    for (const roomId of this.desiredRooms.keys())
    {
      const conn = this.connections.get(roomId);
      if (conn)
      {
        conn.token = token;
        if (conn.ws.readyState === WS_OPEN)
        {
          continue;
        }
        this._closeConn(conn);
        this.connections.delete(roomId);
      }
      this.desiredRooms.set(roomId, token);
      this._clearReconnectTimer(roomId);
      this.log.debug('RoomWs: 恢复聊天室连接 roomId=%d', roomId);
      this._connectPersistent(roomId, token);
    }
  }

  async sendMessage(roomId: number, token: string, content: string): Promise<string[]>
  {
    const conn = this.connections.get(roomId);
    if (conn && conn.ws.readyState === WS_OPEN)
    {
      return new Promise<string[]>((resolve, reject) =>
      {
        let queue = this.pendingMessages.get(roomId);
        if (!queue)
        {
          queue = [];
          this.pendingMessages.set(roomId, queue);
        }
        const cancelTimeout = this.ctx.setTimeout(() =>
        {
          const q = this.pendingMessages.get(roomId);
          if (q)
          {
            const idx = q.findIndex(p => p.content === content);
            if (idx >= 0) q.splice(idx, 1);
          }
          reject(new Error(`RoomWs: 发送消息后等待服务端回显超时 roomId=${roomId}`));
        }, 5_000);
        queue.push({ content, resolve: (id) => resolve([id]), reject, cancelTimeout });
        conn.ws.send(JSON.stringify({ type: 'message', content }));
      });
    }
    const id = await this._sendTemp(roomId, token, content);
    return [id];
  }

  disposeAll(): void
  {
    for (const dispose of this.reconnectTimers.values())
    {
      dispose();
    }
    this.reconnectTimers.clear();
    this.desiredRooms.clear();
    for (const queue of this.pendingMessages.values())
    {
      for (const entry of queue)
      {
        entry.cancelTimeout();
        entry.reject(new Error('RoomWs: 插件销毁，消息发送已取消'));
      }
    }
    this.pendingMessages.clear();
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
    const conn: RoomConnection = { ws, roomId, token, closing: false, stopPing: null };
    this.connections.set(roomId, conn);

    ws.onopen = () =>
    {
      this._clearReconnectTimer(roomId);
      this.log.debug('RoomWs: 连接已建立 roomId=%d', roomId);
      conn.stopPing = this.ctx.setInterval(() =>
      {
        if (ws.readyState === WS_OPEN)
        {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25_000);
    };

    ws.onmessage = (event) =>
    {
      const raw = String((event as { data: unknown; }).data);
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

      if (this.debug)
      {
        this.log.debug('RoomWs recv roomId=%d: %s', roomId, raw.slice(0, 200));
      }

      if (type === 'roster')
      {
        const rawUsers = Array.isArray(parsed.users) ? parsed.users as Array<Record<string, unknown>> : [];
        const cache = new Map<string, RoomUserInfo>();
        for (const u of rawUsers)
        {
          const username = String(u.username || '');
          if (!username) continue;
          cache.set(username, {
            username,
            nickname: String(u.nickname || username),
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
        if (!cache)
        {
          cache = new Map();
          this.userCache.set(roomId, cache);
        }
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
        if (username === this.selfUsername)
        {
          const echoId = String(parsed.id || '');
          const echoContent = String(parsed.content || '');
          const queue = this.pendingMessages.get(roomId);
          if (queue)
          {
            const idx = queue.findIndex(p => p.content === echoContent);
            if (idx >= 0)
            {
              const [entry] = queue.splice(idx, 1);
              entry.cancelTimeout();
              if (echoId)
              {
                entry.resolve(echoId);
              } else
              {
                entry.reject(new Error(`RoomWs: 服务端回显缺少消息 ID roomId=${roomId}`));
              }
            }
          }
          return;
        }

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
      conn.stopPing?.();
      conn.stopPing = null;
      this.connections.delete(roomId);
      this.userCache.delete(roomId);

      if (conn.closing)
      {
        this.log.debug('RoomWs: 连接已主动关闭 roomId=%d', roomId);
        return;
      }
      if (!this.desiredRooms.has(roomId))
      {
        this.log.debug('RoomWs: roomId=%d 已不在目标入房列表，跳过重连', roomId);
        return;
      }

      this.log.warn('RoomWs: 连接意外断开 roomId=%d，5s 后重连…', roomId);
      this._scheduleReconnect(roomId, conn.token);
    };

    ws.onerror = () =>
    {
      this.log.warn('RoomWs: 连接错误 roomId=%d', roomId);
    };
  }

  private _sendTemp(roomId: number, token: string, content: string): Promise<string>
  {
    return new Promise<string>((resolve, reject) =>
    {
      const url = toWsUrl(this.baseUrl, `/api/rooms/ws/${roomId}?token=${encodeURIComponent(token)}`);
      const ws = new WebSocket(url);
      let done = false;

      const finish = (result: string | Error) =>
      {
        if (done) return;
        done = true;
        if (ws.readyState === WS_CONNECTING || ws.readyState === WS_OPEN)
        {
          ws.close();
        }
        if (result instanceof Error)
        {
          reject(result);
        } else
        {
          resolve(result);
        }
      };

      const disposeTimeout = this.ctx.setTimeout(() =>
      {
        this.log.warn('RoomWs: 临时连接回显超时 roomId=%d', roomId);
        finish(new Error(`RoomWs: 发送消息后等待服务端回显超时 roomId=${roomId}`));
      }, 5_000);

      ws.onopen = () =>
      {
        ws.send(JSON.stringify({ type: 'message', content }));
      };

      ws.onerror = () =>
      {
        disposeTimeout();
        finish(new Error(`RoomWs: 临时连接发生错误 roomId=${roomId}`));
      };

      ws.onmessage = (event) =>
      {
        try
        {
          const raw = JSON.parse(String((event as { data: unknown; }).data)) as Record<string, unknown>;
          if (raw.type === 'ping')
          {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          if (
            raw.type === 'message' &&
            String(raw.username || '') === this.selfUsername &&
            String(raw.content || '') === content
          )
          {
            const echoId = String(raw.id || '');
            disposeTimeout();
            if (echoId)
            {
              finish(echoId);
            } else
            {
              finish(new Error(`RoomWs: 服务端回显缺少消息 ID roomId=${roomId}`));
            }
          }
        } catch
        {
        }
      };
    });
  }

  private _closeConn(conn: RoomConnection): void
  {
    conn.closing = true;
    conn.stopPing?.();
    conn.stopPing = null;
    const state = conn.ws.readyState;
    if (state === WS_CONNECTING || state === WS_OPEN)
    {
      conn.ws.close();
    }
  }

  private _scheduleReconnect(roomId: number, token: string): void
  {
    this._clearReconnectTimer(roomId);
    const dispose = this.ctx.setTimeout(() =>
    {
      this.reconnectTimers.delete(roomId);
      if (!this.desiredRooms.has(roomId) || this.connections.has(roomId)) return;
      this._connectPersistent(roomId, token);
    }, 5_000);
    this.reconnectTimers.set(roomId, dispose);
  }

  private _clearReconnectTimer(roomId: number): void
  {
    const dispose = this.reconnectTimers.get(roomId);
    if (!dispose) return;
    dispose();
    this.reconnectTimers.delete(roomId);
  }
}
