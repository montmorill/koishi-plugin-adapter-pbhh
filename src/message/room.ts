import type { Message } from '@satorijs/protocol';
import { h, Universal } from 'koishi';

export interface RoomReplyPreview {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  content: string;
}

export interface RoomEntityLookup {
  getUser(userId: string): Promise<{ name?: string; }>;
  getChannel(channelId: string): Promise<{ name?: string; }>;
}

export interface RoomEntityResolver {
  resolveUserName(userId: string): Promise<string>;
  resolveChannelName(channelId: string): Promise<string>;
}

function escapeRoomText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function adaptRoomMessageContent(content: string, resolver?: RoomEntityResolver): Promise<string> {
  let result = '';
  let textStart = 0;
  let index = 0;

  while (index < content.length) {
    const rest = content.slice(index);
    const mentionMatch = rest.match(/^@([a-zA-Z0-9_-]+)@/);
    if (mentionMatch) {
      const userId = mentionMatch[1];
      result += escapeRoomText(content.slice(textStart, index));
      const userName = resolver ? await resolver.resolveUserName(userId) : userId;
      result += h.at(userId, { name: userName }).toString();
      index += mentionMatch[0].length;
      textStart = index;
      continue;
    }

    const sharpMatch = rest.match(/^#(\d+)#/);
    if (sharpMatch) {
      const channelId = sharpMatch[1];
      result += escapeRoomText(content.slice(textStart, index));
      const channelName = resolver ? await resolver.resolveChannelName(channelId) : channelId;
      result += h('sharp', { id: channelId, name: channelName }).toString();
      index += sharpMatch[0].length;
      textStart = index;
      continue;
    }

    index++;
  }

  result += escapeRoomText(content.slice(textStart));
  return result;
}

export async function createRoomQuote(roomId: number, replyTo: RoomReplyPreview, timestamp: number, resolver?: RoomEntityResolver): Promise<Message> {
  const content = await adaptRoomMessageContent(replyTo.content, resolver);
  return {
    id: String(replyTo.id),
    content,
    elements: h.parse(content),
    user: {
      id: replyTo.username,
      name: replyTo.nickname || replyTo.username,
      avatar: replyTo.avatar || '',
    },
    guild: { id: `room:${roomId}` },
    channel: { id: `room:${roomId}`, type: Universal.Channel.Type.TEXT },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
