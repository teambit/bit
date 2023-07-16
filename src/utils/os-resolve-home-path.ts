import { homedir } from 'os';

const HOME_SIGN = '~';

export default function resolveHomePath(relPath: string) {
  if (relPath.startsWith(HOME_SIGN)) {
    return relPath.replace(HOME_SIGN, homedir());
  }

  return relPath;
}
