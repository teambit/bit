import type { EnvContext, EnvHandler } from '@teambit/envs';
import { findIndex } from 'lodash';
import type { ConfigWriterEntry } from './config-writer-entry';

export type ConfigWriterHandler = {
  handler: EnvHandler<ConfigWriterEntry>;
  name: string;
};

/**
 * create and maintain config writer list for component dev environments.
 */
export class ConfigWriterList {
  constructor(private _writers: ConfigWriterHandler[]) {}

  /**
   * list all congig writer handlers in the list.
   */
  get writers() {
    return this._writers;
  }

  private initiateWriters(writers: ConfigWriterHandler[], context: EnvContext): ConfigWriterEntry[] {
    return writers.map((task) => {
      return task.handler(context);
    });
  }

  /**
   * add writers to the list.
   */
  add(writers: ConfigWriterHandler[]) {
    this._writers = this._writers.concat(writers);
    return this;
  }

  /**
   * remove writers from the list.
   */
  remove(writerNames: string[]) {
    this._writers = this._writers.filter((writer) => {
      return !writerNames.includes(writer.name);
    });
    return this;
  }

  /**
   * replace writers in the list.
   */
  replace(writers: ConfigWriterHandler[]) {
    writers.forEach((writer) => {
      // Find Writer index using _.findIndex
      const matchIndex = findIndex(this._writers, (origWriter) => {
        return origWriter.name === writer.name;
      });
      if (matchIndex !== -1) {
        // Replace Writer at index using native splice
        this._writers.splice(matchIndex, 1, writer);
      }
    });
    return this;
  }

  /**
   * return a new list with the writers from the args added.
   * @param pipeline
   * @returns
   */
  concat(writerList: ConfigWriterList) {
    return new ConfigWriterList(this._writers.concat(writerList.writers));
  }

  /**
   * compute the list.
   */
  compute(context: EnvContext): ConfigWriterEntry[] {
    const writerEntries = this.initiateWriters(this._writers, context);
    return writerEntries;
  }

  static from(writersHandlers: ConfigWriterHandler[]): ConfigWriterList {
    return new ConfigWriterList(writersHandlers);
  }
}
