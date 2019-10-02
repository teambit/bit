import R from 'ramda';
import chalk from 'chalk';
import { BitId } from '../../bit-id';

export default ({ dependentBits, modifiedComponents = [], removedComponentIds, missingComponents }, isRemote) => {
  const paintMissingComponents = () => {
    if (R.isEmpty(missingComponents)) return '';
    return (
      chalk.red('missing components (try to `bit untrack` them instead):') +
      chalk(
        ` ${missingComponents.map((id) => {
          if (!(id instanceof BitId)) id = new BitId(id); // when the id was received from a remote it's not an instance of BitId
          return id.version === 'latest' ? id.toStringWithoutVersion() : id.toString();
        })}\n`
      )
    );
  };
  const paintRemoved = () => {
    if (R.isEmpty(removedComponentIds)) return '';
    const msg = isRemote
      ? 'successfully removed components from the remote scope:'
      : 'successfully removed components from the local scope (to remove from the remote scope, please re-run the command with --remote flag):';
    return (
      chalk.green(msg) +
      chalk(
        ` ${removedComponentIds.map(id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}\n`
      )
    );
  };

  const paintUnRemovedComponents = () => {
    if (R.isEmpty(dependentBits)) return '';
    return Object.keys(dependentBits)
      .map((key) => {
        const header = chalk.underline.red(
          `error: unable to delete ${key}, because the following components depend on it:`
        );
        const body = dependentBits[key].join('\n');
        return `${header}\n${body}`;
      })
      .join('\n\n');
  };

  const paintModifiedComponents = () =>
    (!R.isEmpty(modifiedComponents)
      ? `${chalk.red(
        'error: unable to remove modified components (please use --force to remove modified components)\n'
      ) +
          chalk(
            `- ${modifiedComponents.map(id => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}`
          )}`
      : '');

  return (
    paintUnRemovedComponents(dependentBits) +
    paintRemoved(removedComponentIds) +
    paintMissingComponents(missingComponents) +
    paintModifiedComponents(modifiedComponents)
  );
};
