import R from 'ramda';
import chalk from 'chalk';
import { RemovedObjects, RemovedLocalObjects } from '../../scope/component-remove';

export default ({ dependentBits, modifiedComponents = [], removedComponentIds, missingComponents }) => {
  const paintMissingComponents = (missingComponents) => {
    return !R.isEmpty(missingComponents)
      ? chalk.red.underline('missing components:') +
          chalk(
            ` ${missingComponents.map(id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}\n`
          )
      : '';
  };
  const paintRemoved = removedComponentIds =>
    (!R.isEmpty(removedComponentIds)
      ? chalk.green.underline('successfully removed components:') +
        chalk(
          ` ${removedComponentIds.map(id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}\n`
        )
      : '');

  const paintUnRemovedComponents = (dependentBits) => {
    if (!R.isEmpty(dependentBits)) {
      return Object.keys(dependentBits)
        .map((key) => {
          const header = chalk.underline.red(
            `error: unable to delete ${key}, because the following components depend on it:`
          );
          const body = dependentBits[key].join('\n');
          return `${header}\n${body}`;
        })
        .join('\n\n');
    }
    return '';
  };

  const paintModifiedComponents = modifiedComponents =>
    (!R.isEmpty(modifiedComponents)
      ? `${chalk.red.underline('error: unable to remove modified components:') +
          chalk(
            ` ${modifiedComponents.map(id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}`
          )},${chalk.red(' please use --force flag')}`
      : '');

  return (
    paintUnRemovedComponents(dependentBits) +
    paintRemoved(removedComponentIds) +
    paintMissingComponents(missingComponents) +
    paintModifiedComponents(modifiedComponents)
  );
};
