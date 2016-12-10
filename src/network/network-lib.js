/** @flow */
import SSH from './ssh';
import { ProtocolNotSupported } from './exceptions';
import { isBitUrl } from '../utils';

export default function connect(host: string) {
  if (!isBitUrl(host)) throw new ProtocolNotSupported();
  return SSH.connect(host);
}
