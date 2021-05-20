// Based on - https://github.com/pnpm/pnpm/blob/acc1782c6f18e1388e333c6fd44ccd378faba553/packages/npm-registry-agent/src/index.ts#L0-L1

import { URL } from 'url';
import HttpAgent from 'agentkeepalive';
import { getProxyAgent } from '@teambit/toolbox.network.proxy-agent';

const HttpsAgent = HttpAgent.HttpsAgent;

export interface AgentOptions {
  ca?: string;
  cert?: string;
  httpProxy?: string;
  httpsProxy?: string;
  key?: string;
  localAddress?: string;
  maxSockets?: number;
  noProxy?: boolean | string;
  strictSSL?: boolean;
  timeout?: number;
}

export function getAgent(uri: string, opts: AgentOptions) {
  const noProxy = checkNoProxy(uri, opts);
  if (!noProxy && (opts.httpProxy || opts.httpsProxy)) {
    const proxy = getProxyAgent(uri, opts);
    if (proxy) {
      return proxy;
    }
  }
  const parsedUri = new URL(uri);
  const isHttps = parsedUri.protocol === 'https:';
  const agentTimeout = typeof opts.timeout !== 'number' || opts.timeout === 0 ? 0 : opts.timeout;

  const agent = isHttps
    ? new HttpsAgent({
        ca: opts.ca,
        cert: opts.cert,
        key: opts.key,
        maxSockets: opts.maxSockets ?? 15,
        rejectUnauthorized: opts.strictSSL,
        timeout: agentTimeout,
      }) // eslint-disable-line @typescript-eslint/no-explicit-any
    : new HttpAgent({
        maxSockets: opts.maxSockets ?? 15,
        timeout: agentTimeout,
      }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return agent;
}

function checkNoProxy(uri: string, opts: { noProxy?: boolean | string }) {
  const host = new URL(uri).hostname
    .split('.')
    .filter((x) => x)
    .reverse();
  if (typeof opts.noProxy === 'string') {
    const noproxyArr = opts.noProxy.split(/\s*,\s*/g);
    return noproxyArr.some((no) => {
      const noParts = no
        .split('.')
        .filter((x) => x)
        .reverse();
      if (!noParts.length) {
        return false;
      }
      for (let i = 0; i < noParts.length; i += 1) {
        if (host[i] !== noParts[i]) {
          return false;
        }
      }
      return true;
    });
  }
  return opts.noProxy;
}
