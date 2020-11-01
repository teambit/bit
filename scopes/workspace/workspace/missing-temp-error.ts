export class TempDirMissing extends Error {
  get message() {
    return 'Cannot get temporary directory - cannot find node_modules, or is not writeable';
  }
}
