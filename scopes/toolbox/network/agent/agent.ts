import { getAgent as getPnpmAgent, AgentOptions as PnpmAgentOptions } from '@pnpm/network.agent';
import { readCAFileSync } from '@pnpm/network.ca-file';
import memoize from 'memoizee';

const readCAFileSyncCached = memoize(readCAFileSync);

export interface AgentOptions extends Omit<PnpmAgentOptions, 'strictSsl'> {
  cafile?: string;
  strictSSL?: boolean;
}

export function getAgent(uri: string, opts: AgentOptions): any {
  if (!opts.ca && opts.cafile) {
    opts = {
      ...opts,
      ca: readCAFileSyncCached(opts.cafile),
    };
  }
  return getPnpmAgent(uri, {
    strictSsl: opts.strictSSL,
    ...opts,
  }) as any;
}
