import logger from '../../logger/logger';
import { parseSSHUrl } from '../../utils';
import { ProtocolNotSupported } from './exceptions';
import Fs from './fs';
import { Network } from './network';
import SSH from './ssh';
import { SSHConnectionStrategyName } from './ssh/ssh';
import { Http } from './http';

export default function connect(
  host: string,
  name: string,
  strategiesNames?: SSHConnectionStrategyName[],
  localScopeName?: string
): Promise<Network> {
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

  if (host.startsWith('http://') || host.startsWith('https://')) {
    return Http.connect(host, name, localScopeName);
  }

  throw new ProtocolNotSupported();
}
