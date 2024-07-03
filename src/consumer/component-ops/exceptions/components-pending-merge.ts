import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

type DivergeData = { id: string; snapsLocal: number; snapsRemote: number };

export default class ComponentsPendingMerge extends BitError {
  divergeData: DivergeData[];
  constructor(divergeData: DivergeData[]) {
    const componentsStr = divergeData
      .map(
        (d) =>
          `${chalk.bold(d.id)} has ${chalk.bold(d.snapsLocal.toString())} snaps locally only and ${chalk.bold(
            d.snapsRemote.toString()
          )} snaps remotely only`
      )
      .join('\n');
    super(
      `the local and remote history of the following component(s) have diverged\n${componentsStr}\nPlease use --merge to merge them`
    );
    this.divergeData = divergeData;
  }
}
