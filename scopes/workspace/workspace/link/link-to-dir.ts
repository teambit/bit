import { LinkToDirResult } from '@teambit/dependency-resolver';
import chalk from 'chalk';
import { LinkRow } from './link-row';

export function linkToDir(links?: LinkToDirResult[]) {
  if (!links || !links.length) return '';
  const title = chalk.bold.cyan('Target Links');
  const linksOutput = links
    .map(({ componentId, linksDetail }) => LinkRow({ title: componentId, target: linksDetail.to }))
    .join('\n');

  return `${title}\n${linksOutput}\n`;
}
