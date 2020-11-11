import { flatten } from 'lodash';

export class DevFiles {
  constructor(private raw: { [key: string]: string[] }) {}

  /**
   * get all dev files of an aspect (for example: teambit.defender/tester)
   */
  get(aspectId: string): string[] {
    return this.raw[aspectId] || [];
  }

  toTupleArray() {
    return flatten(
      Object.entries(this.raw).map(([aspectId, files]) => {
        return files.map((file) => [file, aspectId]);
      })
    );
  }

  /**
   * list all dev files.
   */
  list(): string[] {
    return flatten(Object.values(this.raw));
  }

  /**
   * determine whether a file is included in the dev files.
   * @param filePath
   */
  includes(filePath: string) {
    return this.list().includes(filePath);
  }

  /**
   * return a plain object with all dev files.
   */
  toObject() {
    return this.raw;
  }

  /**
   * serialize all dev files into a JSON string.
   */
  toString(pretty = false) {
    return JSON.stringify(this.toObject(), null, pretty ? 2 : 0);
  }
}
