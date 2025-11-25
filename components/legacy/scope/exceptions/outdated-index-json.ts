import chalk from 'chalk';

export default class OutdatedIndexJson extends Error {
  constructor(missingObjects: string[]) {
    super(`Error: The following object IDs were found in the index.json file but are missing from the filesystem.
The index has been updated to remove these objects. Please re-run the command to proceed.
${missingObjects.map((id) => chalk.bold(id)).join('\n')}`);
  }
}
