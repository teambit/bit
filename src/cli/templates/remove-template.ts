import chalk from 'chalk';
import R from 'ramda';

import { BitId, BitIds } from '../../bit-id';

export default (
  { dependentBits, modifiedComponents = [], removedComponentIds, missingComponents, removedFromLane },
  isRemote
) => {
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
  const paintRemoved = () => {
    if (R.isEmpty(removedComponentIds) && R.isEmpty(removedFromLane)) return '';
    const compToStr = (comps: BitIds) =>
      chalk(` ${comps.map((id) => (id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()))}\n`);
    const getMsg = (isLane = false) => {
      const removedFrom = isLane ? 'lane' : 'scope';
      const msg = isRemote
        ? `successfully removed components from the remote ${removedFrom}:`
        : `successfully removed components from the local ${removedFrom}:`;
      return chalk.green(msg);
    };
    const newLine = '\n';
    const compOutput = R.isEmpty(removedComponentIds) ? '' : getMsg(false) + compToStr(removedComponentIds) + newLine;
    const laneOutput = R.isEmpty(removedFromLane) ? '' : getMsg(true) + compToStr(removedFromLane);

    return `${compOutput}${laneOutput}`;
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

  const paintModifiedComponents = () => {
    if (R.isEmpty(modifiedComponents)) return '';
    const modifiedStr = modifiedComponents.map((id: BitId) =>
      id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()
    );
    return `${
      chalk.red('error: unable to remove modified components (please use --force to remove modified components)\n') +
      chalk(`- ${modifiedStr}`)
    }`;
  };

  return (
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    paintUnRemovedComponents(dependentBits) +
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    paintRemoved(removedComponentIds) +
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    paintMissingComponents(missingComponents) +
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    paintModifiedComponents(modifiedComponents)
  );
};
