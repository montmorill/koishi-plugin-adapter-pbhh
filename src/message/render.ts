import { h } from 'koishi';
import { } from '@koishijs/assets';
import { PbhhBot } from '../bot/base';
import type { Fragment } from 'koishi';
import { decodeMarkdown } from './markdown';

function isRoomChannel(channelId?: string): boolean {
  return !!channelId && channelId.startsWith('room:');
}

export async function renderMessage(bot: PbhhBot, content: Fragment, channelId?: string): Promise<string> {
  let result = '';
  const normalizedInput = typeof content === 'string' && !isRoomChannel(channelId)
    ? decodeMarkdown(content)
    : content;
  const elements = h.normalize(normalizedInput);
  for (const element of elements) {
    if (typeof element === 'string') {
      result += element;
      continue;
    }
    const { type, attrs, children } = element;
    switch (type) {
      case 'text':
        result += (attrs.content as string) || '';
        break;
      case 'i18n': {
        const path = (attrs?.path as string) || '';
        try {
          if (path && bot.ctx.i18n) {
            const locales = bot.ctx.i18n.fallback([]);
            const rendered = bot.ctx.i18n.render(locales, [path], attrs || {});
            if (typeof rendered === 'string') {
              result += rendered;
            } else if (Array.isArray(rendered)) {
              result += await renderMessage(bot, rendered, channelId);
            } else {
              result += `[${path || 'i18n'}]`;
            }
          } else {
            result += `[${path || 'i18n'}]`;
          }
        } catch {
          result += `[${path || 'i18n'}]`;
        }
        break;
      }
      case 'at':
        if (attrs.id) {
          result += isRoomChannel(channelId)
            ? `@${attrs.id}@`
            : `@${attrs.name || attrs.id}`;
        }
        break;
      case 'sharp':
        if (attrs.id) {
          result += isRoomChannel(channelId)
            ? `#${attrs.id}#`
            : `#${attrs.name || attrs.id}`;
        }
        break;
      case 'a':
        result += (attrs.href as string) || '';
        break;
      case 'img':
      case 'image':
      case 'audio':
      case 'video':
      case 'file': {
        let url = (attrs.url as string) || (attrs.src as string) || '';
        if (!url) break;
        if (!url.startsWith('http')) {
          if (!bot.ctx.assets) {
            result += '[资源转存失败]';
            break;
          }
          try {
            const transformed = await bot.ctx.assets.transform(h[type === 'img' ? 'image' : type](url).toString());
            const m = transformed.match(/src="([^"]+)"/);
            if (m && m[1]) {
              url = m[1];
            } else {
              result += '[资源转存失败]';
              break;
            }
          } catch {
            result += '[资源转存失败]';
            break;
          }
        }
        if (type === 'audio' || type === 'video' || type === 'file') {
          const name = (attrs.title as string) || (attrs.name as string) || '附件';
          result += `[${name}](${url})`;
        } else {
          const alt = (attrs.alt as string) || '';
          result += `![${alt}](${url})`;
        }
        break;
      }
      case 'b':
      case 'strong':
        result += `**${await renderMessage(bot, children, channelId)}**`;
        break;
      case 'i':
      case 'em':
        result += `*${await renderMessage(bot, children, channelId)}*`;
        break;
      case 'u':
        result += `__${await renderMessage(bot, children, channelId)}__`;
        break;
      case 's':
      case 'del':
        result += `~~${await renderMessage(bot, children, channelId)}~~`;
        break;
      case 'code':
        result += `\`${await renderMessage(bot, children, channelId)}\``;
        break;
      case 'p':
        result += await renderMessage(bot, children, channelId);
        result += '\n\n';
        break;
      case 'br':
        result += '\n';
        break;
      case 'quote': {
        const quoteId = attrs.id as string | undefined;
        if (quoteId && channelId) {
          try {
            const msg = await bot.getMessage(channelId, quoteId);
            if (msg?.content) {
              result += msg.content.split('\n').map((line) => `> ${line}`).join('\n');
              result += '\n\n';
              break;
            }
          } catch {
          }
        }
        const quoteText = await renderMessage(bot, children, channelId);
        if (quoteText) {
          result += quoteText.split('\n').map((line) => `> ${line}`).join('\n');
          result += '\n\n';
        }
        break;
      }
      default:
        if (children && children.length) {
          result += await renderMessage(bot, children, channelId);
        }
        break;
    }
  }
  return result.trim();
}
