import R from 'ramda';
import chalk from 'chalk';
import { BitIds } from '../bit-id';

export class RemovedObjects {
  bitIds: BitIds;
  missingComponents: BitIds;
  dependentBits: BitIds;
  removedDependencies: BitIds;
  constructor(
    bitIds: BitIds = [],
    missingComponents: BitIds = [],
    removedDependencies: BitIds = [],
    dependentBits: BitIds = []
  ) {
    this.bitIds = bitIds;
    this.missingComponents = missingComponents;
    this.dependentBits = dependentBits;
    this.removedDependencies = removedDependencies;
  }

  paintMissingComponents = () =>
    (!R.isEmpty(this.missingComponents)
      ? chalk.red.underline('missing components:') +
        chalk(
          ` ${this.missingComponents.map(
            id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString())
          )}\n`
        )
      : '');
  paintRemoved = () =>
    (!R.isEmpty(this.bitIds)
      ? chalk.green.underline('successfully removed components:') +
        chalk(` ${this.bitIds.map(id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}\n`)
      : '');
  paintSingle() {
    return this.paintUnRemovedComponents() + this.paintRemoved() + this.paintMissingComponents();
  }

  paintUnRemovedComponents() {
    if (!R.isEmpty(this.dependentBits)) {
      return Object.keys(this.dependentBits)
        .map((key) => {
          const header = chalk.underline.red(
            `error: unable to delete ${key}, because the following components depend on it:`
          );
          const body = this.dependentBits[key].join('\n');
          return `${header}\n${body}`;
        })
        .join('\n\n');
    }
    return '';
  }
}
export class RemovedLocalObjects extends RemovedObjects {
  modifiedComponents: BitIds;
  constructor(
    bitIds: BitIds,
    missingComponents: BitIds,
    modifiedComponents: BitIds = [],
    dependentBits: BitIds,
    removedDependencies: BitIds
  ) {
    super(bitIds, missingComponents, dependentBits, removedDependencies);
    this.modifiedComponents = modifiedComponents;
  }

  paintModifiedComponents = () =>
    (!R.isEmpty(this.modifiedComponents)
      ? chalk.red.underline('error: can`t remove modified components:') +
        chalk(
          ` ${this.modifiedComponents.map(
            id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString())
          )}\n`
        )
      : '');

  paintSingle() {
    return super.paintSingle() + this.paintModifiedComponents();
  }
}
