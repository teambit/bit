/** @flow */
import dns from 'dns';
import SSH from './ssh';
import { ProtocolNotSupported } from './exceptions';
import { isBitUrl, parseSSHUrl } from '../utils';

function isCurrentScope() {
  
}

export default function connect(host: string) {
  if (!host.startsWith('ssh://')) throw new ProtocolNotSupported();
  const ssh = new SSH(parseSSHUrl(host));
  return ssh.connect();
}
