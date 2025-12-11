import { ProtocolNotSupported } from './exceptions';
import Fs from './fs';
import type { Network } from './network';
import { Http } from './http';

export default function connect(host: string, name: string, localScopeName?: string): Promise<Network> {
  if (host.startsWith('ssh://') || host.startsWith('bit://')) {
    throw new Error('ssh protocol is not supported anymore, please use http or fs protocols');
  }

  if (host.startsWith('file://')) {
    return new Fs(host.replace('file://', '')).connect();
  }

  if (host.startsWith('http://') || host.startsWith('https://')) {
    return Http.connect(host, name, localScopeName);
  }

  throw new ProtocolNotSupported();
}
