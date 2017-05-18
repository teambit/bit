/** @flow */
export default class DependencyNotFound extends Error {
  id: string;
  code: number;
  bitJsonPath: string;

  constructor(id: string, bitJsonPath: string) {
    super();
    this.code = 127;
    this.id = id;
    this.bitJsonPath = bitJsonPath;
  }
}
