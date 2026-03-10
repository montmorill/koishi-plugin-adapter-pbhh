import { h } from 'koishi';
import type { Fragment } from 'koishi';
export function decodeMarkdown(markdown: string): Fragment
{
  if (!markdown) return [];
  const elements: (string | h)[] = [];
  let currentText = '';
  const flushText = () =>
  {
    if (currentText)
    {
      elements.push(currentText);
      currentText = '';
    }
  };
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length)
  {
    const line = lines[i];
    if (line.startsWith('```'))
    {
      flushText();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```'))
      {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join('\n');
      elements.push(h('code', code));
      elements.push('\n');
      i++;
      continue;
    }
    if (line.startsWith('>'))
    {
      flushText();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>'))
      {
        quoteLines.push(lines[i].slice(1).trim());
        i++;
      }
      const quoteContent = parseInlineMarkdown(quoteLines.join('\n'));
      elements.push(h('quote', quoteContent));
      continue;
    }
    if (/^#{1,6}\s/.test(line))
    {
      flushText();
      const text = line.replace(/^#{1,6}\s/, '');
      elements.push(h('b', parseInlineMarkdown(text)));
      elements.push('\n');
      i++;
      continue;
    }
    if (/^[-*_]{3,}$/.test(line.trim()))
    {
      flushText();
      elements.push('\n---\n');
      i++;
      continue;
    }
    if (line.trim() === '')
    {
      flushText();
      elements.push('\n');
      i++;
      continue;
    }
    currentText += line;
    i++;
    if (i < lines.length) currentText += '\n';
  }
  if (currentText)
  {
    const inlineElements = parseInlineMarkdown(currentText);
    elements.push(...inlineElements);
  }
  return elements;
}
function parseInlineMarkdown(text: string): (string | h)[]
{
  const elements: (string | h)[] = [];
  let pos = 0;
  while (pos < text.length)
  {
    const rest = text.slice(pos);
    const imgMatch = rest.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch)
    {
      elements.push(h('img', { src: imgMatch[2], alt: imgMatch[1] }));
      pos += imgMatch[0].length;
      continue;
    }
    const linkMatch = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch)
    {
      elements.push(h('a', { href: linkMatch[2] }, linkMatch[1]));
      pos += linkMatch[0].length;
      continue;
    }
    const codeMatch = rest.match(/^`([^`]+)`/);
    if (codeMatch)
    {
      elements.push(h('code', codeMatch[1]));
      pos += codeMatch[0].length;
      continue;
    }
    const boldMatch = rest.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch)
    {
      elements.push(h('b', boldMatch[2]));
      pos += boldMatch[0].length;
      continue;
    }
    const italicMatch = rest.match(/^(\*|_)(.+?)\1/);
    if (italicMatch)
    {
      elements.push(h('i', italicMatch[2]));
      pos += italicMatch[0].length;
      continue;
    }
    const strikeMatch = rest.match(/^~~(.+?)~~/);
    if (strikeMatch)
    {
      elements.push(h('s', strikeMatch[1]));
      pos += strikeMatch[0].length;
      continue;
    }
    const mentionMatch = rest.match(/^@([a-zA-Z0-9_-]+)/);
    if (mentionMatch)
    {
      elements.push(h('at', { id: mentionMatch[1], name: mentionMatch[1] }));
      pos += mentionMatch[0].length;
      continue;
    }
    const issueMatch = rest.match(/^#(\d+)/);
    if (issueMatch)
    {
      elements.push(h('sharp', { id: issueMatch[1], name: issueMatch[1] }));
      pos += issueMatch[0].length;
      continue;
    }
    elements.push(text[pos]);
    pos++;
  }
  return elements;
}
