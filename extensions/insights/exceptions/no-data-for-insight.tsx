import { BitError } from 'bit-bin/dist/error/bit-error';

export default class NoDataForInsight extends BitError {
  constructor(readonly insightName: string) {
    super(generateMessage(insightName));
  }
  report() {
    return this.message;
  }
}
function generateMessage(insightName: string) {
  return `No data for ${insightName}`;
}
