import chalk from 'chalk';

import BitId from '../../bit-id/bit-id';

/**
 * schema for forking components
 */
export default function (bitIds: BitId[], remote: string) {
  return {
    properties: {
      shouldFork: {
        required: true,
        description: `bit is about to fork the following components and export them to ${chalk.bold(remote)}.
\t${bitIds.map((id) => chalk.bold(id.toStringWithoutVersion())).join('\n\t')}
also, if they're staged, bit will not change their status to exported unless '--set-current-scope' flag is used.

there are additional flags for the 'export' command to specifically handle forking components:
1. '--include-dependencies' exports all dependencies to the destination alongside the component.
2. '--set-current-scope' sets your workspace to use the destination scope as the main remote for the component.
3. '--rewire' changes all dependencies to point to the new destination.

would you like to proceed with forking the components? (yes/no)`,
        message: 'please type yes or no.',
        type: 'string',
        conform(value: string) {
          return (
            value.toLowerCase() === 'y' ||
            value.toLowerCase() === 'n' ||
            value.toLowerCase() === 'yes' ||
            value.toLowerCase() === 'no'
          );
        },
      },
    },
  };
}
