import { PaperError } from '../../cli';

export default class InsightAlreadyExists extends PaperError {
  constructor(readonly insightName: string) {
    super(generateMessage(insightName));
  }
  report() {
    return this.message;
  }
}
function generateMessage(insightName: string) {
  return `Insight ${insightName} already exists`;
}
