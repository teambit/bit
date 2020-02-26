import Insight from './insight';
import InsightAlreadyExists from './exceptions/insight-already-exists';

export default class InsightRegistry {
  constructor(
    /**
     * array of registered insights
     */
    readonly insights: { [k: string]: Insight }
  ) {}

  /**
   * register a new insight
   */
  register(insight: Insight) {
    const key = InsightRegistry.getID(insight);
    if (this.insights[key]) {
      throw new InsightAlreadyExists(key);
    }
    this.insights[key] = insight;
    return this;
  }

  /**
   * return an insight unique ID.
   */
  static getID(insight: Insight): string {
    return getID(insight.name);
  }
}

export function getID(key: string) {
  return key.split(' ')[0].trim();
}
