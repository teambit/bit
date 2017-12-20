import R from 'ramda';
import chalk from 'chalk';
import { BitIds } from '../bit-id';

export class RemovedObjects {
  removedComponentIds: BitIds;
  missingComponents: BitIds;
  dependentBits: Object;
  removedDependencies: BitIds;
  constructor(
    bitIds: BitIds = [],
    missingComponents: BitIds = [],
    removedDependencies: BitIds = [],
    dependentBits: Object = {}
  ) {
    this.removedComponentIds = bitIds;
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
    (!R.isEmpty(this.removedComponentIds)
      ? chalk.green.underline('successfully removed components:') +
        chalk(
          ` ${this.removedComponentIds.map(
            id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString())
          )}\n`
        )
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
    dependentBits: Object,
    removedDependencies: BitIds
  ) {
    super(bitIds, missingComponents, removedDependencies, dependentBits);
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
