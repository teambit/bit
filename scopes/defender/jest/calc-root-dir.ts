import { compact } from 'lodash';
import { join, sep } from 'path';

export function getRootDirFromConfigPath(configPath: string): string {
  const splitted = configPath.split('node_modules');
  const last = splitted[splitted.length - 1];
  const lastSplitted = compact(last.split(sep));
  let lastModule = lastSplitted[0];
  if (lastSplitted[0].startsWith('@')) {
    lastModule = join(lastSplitted[0], lastSplitted[1]);
  }
  splitted[splitted.length - 1] = `${sep}${lastModule}`;
  const final = splitted.join('node_modules');
  return final;
}
