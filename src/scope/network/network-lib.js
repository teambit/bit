/** @flow */
import SSH from './ssh';
import Fs from './fs';
import type { Network } from './network';
import { ProtocolNotSupported } from './exceptions';
import { isBitUrl, parseSSHUrl } from '../../utils';

export default function connect(host: string): Promise<Network> {
  if (host.startsWith('ssh://') || host.startsWith('bit://')) {
    return new SSH(parseSSHUrl(host)).connect();
  }

  if (host.startsWith('file://')) {
    return new Fs(host.replace('file://', '')).connect();
  }

  throw new ProtocolNotSupported();
}
