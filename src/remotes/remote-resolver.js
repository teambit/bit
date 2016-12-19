import Remotes from './remotes';
import { REMOTE_ALIAS_SIGN, LOCAL_SCOPE_NOTATION } from '../constants';
import LocalScope from './local-scope';
import { Scope } from '../scope';

export function parseRemoteStr(remoteStr: string) {
  if (!remoteStr.startsWith(REMOTE_ALIAS_SIGN)) return null;
  const [, alias] = remoteStr.split(REMOTE_ALIAS_SIGN);
  return alias; 
} 

export function remoteResolver(name, remotes: Remotes, localScope: Scope) {
  if (name === LOCAL_SCOPE_NOTATION) return new LocalScope(localScope);
  const parsedRemote = parseRemoteStr(name);
  if (parsedRemote) {
    return remotes.get(parsedRemote); 
  }
  
  // @TODO return community remote
  return null;
}
