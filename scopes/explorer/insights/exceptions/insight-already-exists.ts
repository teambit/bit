import { BitError } from '@teambit/bit-error';

export default class InsightAlreadyExists extends BitError {
  constructor(readonly insightName: string) {
    super(`Insight ${insightName} already exists`);
  }
}
