import SSH from './ssh';
import Fs from './fs';
import { Network } from './network';
import { ProtocolNotSupported } from './exceptions';
import { parseSSHUrl } from '../../utils';
import logger from '../../logger/logger';
import { SSHConnectionStrategyName } from './ssh/ssh';

export default function connect(host: string, strategiesNames?: SSHConnectionStrategyName[]): Promise<Network> {
  if (host.startsWith('ssh://') || host.startsWith('bit://')) {
    logger.debug(`Establishing a new SSH connection to ${host}`);
    const sshProps = parseSSHUrl(host);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new SSH(sshProps).connect(strategiesNames);
  }

  if (host.startsWith('file://')) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new Fs(host.replace('file://', '')).connect();
  }

  throw new ProtocolNotSupported();
}
