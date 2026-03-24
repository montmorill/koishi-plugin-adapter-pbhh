const PBHH_MAIL_DOMAIN = 'pbhh.net';

export interface ParsedMailAddress
{
  raw: string;
  address: string;
  userId: string;
  isInternal: boolean;
}

export function extractMailAddress(input: string): string
{
  const trimmed = input.trim();
  const matched = /<([^<>]+)>/.exec(trimmed);
  return (matched?.[1] || trimmed).trim();
}

export function parseMailAddress(input: string): ParsedMailAddress
{
  const raw = input.trim();
  const address = extractMailAddress(raw);
  if (!address)
  {
    return {
      raw,
      address: '',
      userId: '',
      isInternal: false,
    };
  }
  if (!address.includes('@'))
  {
    return {
      raw,
      address: `${address}@${PBHH_MAIL_DOMAIN}`,
      userId: address,
      isInternal: true,
    };
  }
  const atIndex = address.lastIndexOf('@');
  const local = address.slice(0, atIndex).trim();
  const domain = address.slice(atIndex + 1).trim().toLowerCase();
  if (local && domain === PBHH_MAIL_DOMAIN)
  {
    return {
      raw,
      address: `${local}@${PBHH_MAIL_DOMAIN}`,
      userId: local,
      isInternal: true,
    };
  }
  return {
    raw,
    address,
    userId: address,
    isInternal: false,
  };
}

export function isSameMailPeer(left: string, right: string): boolean
{
  return parseMailAddress(left).address.toLowerCase() === parseMailAddress(right).address.toLowerCase();
}

export function makeMailReplySubject(subject: string): string
{
  const trimmed = subject.trim();
  if (!trimmed) return '私信';
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export function makePrivateMailSubject(selfId: string): string
{
  return `来自 ${selfId} 的私信`;
}
