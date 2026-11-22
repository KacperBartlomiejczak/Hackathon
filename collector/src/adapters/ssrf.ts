import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Private, loopback, link-local, CGNAT and unspecified ranges; compose service names resolve into these.
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

function isBlockedIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mapped) return blocked.check(mapped, 'ipv4');
  return blocked.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

// shortcut: checks DNS before Chromium resolves again (DNS rebinding window); pin IPs via a proxy if this matters.
export async function isBlockedUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address));
  } catch {
    return true;
  }
}
