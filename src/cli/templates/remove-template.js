import R from 'ramda';
import chalk from 'chalk';
import { BitId } from '../../bit-id';

export default ({ dependentBits, modifiedComponents = [], removedComponentIds, missingComponents }) => {
  const paintMissingComponents = () => {
    if (R.isEmpty(missingComponents)) return '';
    return (
      chalk.red('missing components:') +
      chalk(
        ` ${missingComponents.map((id) => {
          if (!(id instanceof BitId)) id = new BitId(id); // when the id was received from a remote it's not an instance of BitId
          return id.version === 'latest' ? id.toStringWithoutVersion() : id.toString();
        })}\n`
      )
    );
  };
  const paintRemoved = () =>
    (!R.isEmpty(removedComponentIds)
      ? chalk.green('successfully removed components:') +
        chalk(
          ` ${removedComponentIds.map(id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}\n`
        )
      : '');

  const paintUnRemovedComponents = () => {
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

  const paintModifiedComponents = () =>
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
