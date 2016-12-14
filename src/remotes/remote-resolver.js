import Remotes from './remotes';
import { REMOTE_ALIAS_SIGN } from '../constants';

export function parseRemoteStr(remoteStr: string) {
  if (!remoteStr.startsWith(REMOTE_ALIAS_SIGN)) return null;
  const [, alias] = remoteStr.split(REMOTE_ALIAS_SIGN);
  return alias; 
} 

export function remoteResolver(name, remotes: Remotes) {
  const parsedRemote = parseRemoteStr(name);
  if (parsedRemote) {
    return remotes.get(parsedRemote); 
  }
  
  // @TODO return community remote
  return null;
}
