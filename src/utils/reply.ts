import type { SendOptions } from '@satorijs/protocol';
import { h, type Fragment } from 'koishi';

function parseReplyTargetId(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const id = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function extractQuoteReplyTargetId(content: Fragment): number | null {
  for (const node of h.normalize(content)) {
    if (typeof node === 'string') continue;
    if (node.type === 'quote') {
      const quoteId = parseReplyTargetId(node.attrs.id as string | number | undefined);
      if (quoteId !== null) return quoteId;
    }
    if (!node.children?.length) continue;
    const childQuoteId = extractQuoteReplyTargetId(node.children);
    if (childQuoteId !== null) return childQuoteId;
  }
  return null;
}

function extractSessionReplyTargetId(session: SendOptions['session'] | undefined): number | null {
  const messageId = parseReplyTargetId(session?.messageId);
  if (messageId !== null) return messageId;
  return parseReplyTargetId(session?.quote?.id);
}

export function resolveReplyTargetId(content: Fragment, fallbackId: number, options?: SendOptions): number {
  const quoteId = extractQuoteReplyTargetId(content);
  if (quoteId !== null) return quoteId;
  const sessionId = extractSessionReplyTargetId(options?.session);
  if (sessionId !== null) return sessionId;
  return fallbackId;
}
