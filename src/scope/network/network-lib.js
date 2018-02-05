/** @flow */
import SSH from './ssh';
import Fs from './fs';
import type { Network } from './network';
import { ProtocolNotSupported } from './exceptions';
import { parseSSHUrl } from '../../utils';
import logger from '../../logger/logger';

export default function connect(host: string): Promise<Network> {
  if (host.startsWith('ssh://') || host.startsWith('bit://')) {
    logger.debug(`Establishing a new SSH connection to ${host}`);
    const sshProps = parseSSHUrl(host);
    return new SSH(sshProps).connect();
  }

  if (host.startsWith('file://')) {
    return new Fs(host.replace('file://', '')).connect();
  }

  throw new ProtocolNotSupported();
}
