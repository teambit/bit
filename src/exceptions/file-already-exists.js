export default class FileAlreadyExists extends Error {
  constructor(file) {
    super(`The "${file}" already exists
    `);
    this.name = 'FILEALREADYEXISTS';
    this.code = 'FILEEX';
  }
}
