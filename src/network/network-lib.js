/** @flow */
import SSH from './ssh';
import { ProtocolNotSupported } from './exceptions';
import { isBitUrl, parseSSHUrl } from '../utils';

export default function connect(host: string) {
  if (!host.startsWith('ssh://')) throw new ProtocolNotSupported();
  const ssh = new SSH(parseSSHUrl(host));
  return ssh.connect();
}
