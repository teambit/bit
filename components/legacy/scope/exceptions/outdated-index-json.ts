import chalk from 'chalk';

export default class OutdatedIndexJson extends Error {
  id: string;
  indexJsonPath: string;
  showDoctorMessage: boolean;

  constructor(id: string, indexJsonPath: string) {
    super(`error: ${chalk.bold(id)} found in the index.json file, however, is missing from the scope.
the cache is deleted and will be rebuilt on the next command. please re-run the command.`);
    this.id = id;
    this.indexJsonPath = indexJsonPath;
    this.showDoctorMessage = true;
  }
}
