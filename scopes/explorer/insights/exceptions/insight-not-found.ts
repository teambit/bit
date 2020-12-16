import { BitError } from '@teambit/bit-error';

export default class InsightNotFound extends BitError {
  constructor(readonly insightName: string) {
    super(`Insight ${insightName} not found`);
  }
}
