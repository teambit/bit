/** @flow */
import path from 'path';
import { writeFile, forEach } from '../../utils';
import { SOURCES_JSON } from '../../constants';
import { Source } from './index';
import { BitIds, BitId } from '../../bit-id';

export default class SourcesJson extends Map<BitId, BitIds> {
  sources: Source;

  constructor(sourcesTuples: [string, BitIds][], sources: Source) {
    super(sourcesTuples);
    this.sources = sources;
  }
  
  getPath(): string {
    return path.join(this.sources.getPath(), SOURCES_JSON);
  }

  toPlainObject() {
    const obj = {};

    this.forEach((bitIds, bitId) => {
      obj[bitId.toString()] = bitIds.serialize();
    });

    return obj;
  }

  toJson() {
    return JSON.stringify(this.toPlainObject());
  }

  write() {
    return writeFile(this.getPath(), this.toJson());
  }

  static load(json: {[string]: string[]}, sources: Source) {
    const tuples = [];

    forEach(json, (bitIds, bitId) => {
      tuples.push([BitId.parse(bitId), BitIds.deserialize(bitIds)]);
    });

    return new SourcesJson(tuples, sources);
  }
}
