import { BitError } from 'bit-bin/dist/error/bit-error';

export default class NoDataForInsight extends BitError {
  constructor(readonly insightName: string) {
    super(`No data for ${insightName}`);
  }
}
