// Based on - https://github.com/pnpm/pnpm/blob/acc1782c6f18e1388e333c6fd44ccd378faba553/packages/npm-registry-agent/src/index.ts#L0-L1

import { URL } from 'url';
import createHttpProxyAgent from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { AgentOptions } from '@teambit/toolbox.network.agent';

export function getProxyAgent(uri: string, opts: Omit<AgentOptions, 'noProxy'>) {
  const parsedUri = new URL(uri);
  const isHttps = parsedUri.protocol === 'https:';
  const proxyUri = getProxyUri(uri, opts);
  if (!proxyUri) {
    return undefined;
  }
  const proxy = getProxy(proxyUri, opts, isHttps);
  return proxy;
}

function getProxyUri(
  uri: string,
  opts: {
    httpProxy?: string;
    httpsProxy?: string;
    noProxy?: boolean | string;
  }
) {
  const { protocol } = new URL(uri);

  let proxy: string | undefined;
  switch (protocol) {
    case 'http:': {
      proxy = opts.httpProxy;
      break;
    }
    case 'https:': {
      proxy = opts.httpsProxy;
      break;
    }
    default:
  }

  if (!proxy) {
    return null;
  }

  if (!proxy.startsWith('http')) {
    proxy = `${protocol}//${proxy}`;
  }

  const parsedProxy = typeof proxy === 'string' ? new URL(proxy) : proxy;

  return parsedProxy;
}

function getProxy(
  proxyUrl: URL,
  opts: {
    ca?: string;
    cert?: string;
    key?: string;
    timeout?: number;
    localAddress?: string;
    maxSockets?: number;
    strictSSL?: boolean;
  },
  isHttps: boolean
) {
  const props = {
    auth: getAuth(proxyUrl),
    ca: opts.ca,
    cert: opts.cert,
    host: proxyUrl.hostname,
    key: opts.key,
    localAddress: opts.localAddress,
    maxSockets: opts.maxSockets ?? 15,
    path: proxyUrl.pathname,
    port: proxyUrl.port,
    protocol: proxyUrl.protocol,
    rejectUnauthorized: opts.strictSSL,
    timeout: typeof opts.timeout !== 'number' || opts.timeout === 0 ? 0 : opts.timeout + 1,
  };

  if (proxyUrl.protocol === 'http:' || proxyUrl.protocol === 'https:') {
    if (!isHttps) {
      return createHttpProxyAgent(props);
    }
    return new HttpsProxyAgent(props);
  }
  if (proxyUrl.protocol?.startsWith('socks')) {
    return new SocksProxyAgent(props);
  }
  throw new Error(`${proxyUrl.toString()} does not match a valid protocol`);
}

function getAuth(proxyUrl: URL): string | undefined {
  if (!proxyUrl.username) {
    return undefined;
  }
  if (!proxyUrl.password) {
    return proxyUrl.username;
  }
  return `${proxyUrl.username}:${proxyUrl.password}`;
}
