// Requests Edict sends to URLs that admins type in: webhook deliveries. A
// webhook could otherwise point at the instance's own network, like a cloud
// metadata service or the database, and the delivery log would show the
// answer. So deliveries go only to public addresses, checked where the name
// resolves at the moment of sending, unless the instance allows private
// targets (PRIVATE_WEBHOOK_TARGETS=allow) for agent runners on its own network.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

// One list per family: a BlockList also matches IPv4 addresses against its
// IPv4-mapped IPv6 rules, so ::ffff:0:0/96 in a shared list blocks all of IPv4.
const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  // IPv4-mapped (::ffff:7f00:1), however the URL spelled it.
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

// Whether an IP address is on the public internet.
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, "ipv4");
  if (family === 6) {
    // DNS can answer an IPv4-mapped address; judge the IPv4 address in it.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
    if (mapped) return isPublicAddress(mapped);
    return !blockedV6.check(address, "ipv6");
  }
  return false;
}

export class PrivateTargetError extends Error {}

function privateTarget(host: string): PrivateTargetError {
  return new PrivateTargetError(
    `${host} is a private address. Webhooks go to public addresses unless the instance sets PRIVATE_WEBHOOK_TARGETS=allow.`,
  );
}

// The URL's host without IPv6 brackets.
function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

// Refuses a webhook URL whose host is, or resolves now to, a private address.
// A name that does not resolve yet is let through: the send checks again.
export async function checkWebhookUrl(raw: string, options: { allowPrivate: boolean }): Promise<void> {
  if (options.allowPrivate) return;
  const host = hostOf(new URL(raw));
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw privateTarget(host);
    return;
  }
  const addresses = await new Promise<LookupAddress[]>((resolve) =>
    dnsLookup(host, { all: true }, (error, found) => resolve(error ? [] : found)),
  );
  if (addresses.some((entry) => !isPublicAddress(entry.address))) throw privateTarget(host);
}

// Resolves a name for a connection and refuses it if any address is private,
// so a name cannot pass a check and then point somewhere else.
function publicLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true, order: "ipv4first" }, (error, found) => {
      if (error) return callback(error, "", 4);
      const addresses = found as unknown as LookupAddress[];
      if (!allowPrivate && addresses.some((entry) => !isPublicAddress(entry.address))) {
        return callback(privateTarget(hostname), "", 4);
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

export interface Sent {
  status: number;
  // The response body, cut to `maxBody` characters.
  body: string;
}

// POSTs a webhook body. Redirects are not followed. Throws on a private
// target, a network error or the timeout.
export function sendWebhook(
  raw: string,
  headers: Record<string, string>,
  body: string,
  options: { allowPrivate: boolean; timeoutMs?: number; maxBody?: number },
): Promise<Sent> {
  const url = new URL(raw);
  const host = hostOf(url);
  if (!options.allowPrivate && isIP(host) && !isPublicAddress(host)) {
    return Promise.reject(privateTarget(host));
  }
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const maxBody = options.maxBody ?? 2048;
  return new Promise<Sent>((resolve, reject) => {
    const req = send(
      url,
      {
        method: "POST",
        headers: { ...headers, "content-length": String(Buffer.byteLength(body)) },
        lookup: publicLookup(options.allowPrivate),
        timeout: options.timeoutMs ?? 10_000,
      },
      (res: IncomingMessage) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          if (text.length < maxBody) text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text.slice(0, maxBody) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("No answer within the timeout.")));
    req.on("error", reject);
    req.end(body);
  });
}
