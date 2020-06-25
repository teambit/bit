import { PaperError } from '../../cli';

export default class NoDataForInsight extends PaperError {
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
