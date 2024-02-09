export class PathToNpmrcNotExist extends Error {
  constructor(path = '') {
    super(`Path ${path} to .npmrc does not exist`);
  }
}
