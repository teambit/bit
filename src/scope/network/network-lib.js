/** @flow */
import SSH from './ssh';
import Fs from './fs';
import type { Network } from './network';
import { ProtocolNotSupported } from './exceptions';
import { parseSSHUrl } from '../../utils';
import logger from '../../logger/logger';
import { FILE_PROTOCOL_PREFIX, BIT_PROTOCOL_PREFIX } from '../../constants';

export default function connect(host: string): Promise<Network> {
  if (host.startsWith(SSH_PROTOCOL_PREFIX) || host.startsWith(BIT_PROTOCOL_PREFIX)) {
    logger.debug(`Establishing a new SSH connection to ${host}`);
    const sshProps = parseSSHUrl(host);
    return new SSH(sshProps).connect();
  }

  if (host.startsWith(FILE_PROTOCOL_PREFIX)) {
    return new Fs(host.replace(FILE_PROTOCOL_PREFIX, '')).connect();
  }

  throw new ProtocolNotSupported();
}
