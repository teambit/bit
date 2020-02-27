import Insight from './insight';
import InsightAlreadyExists from './exceptions/insight-already-exists';

export default class InsightRegistry {
  constructor(
    /**
     * array of registered insights
     */
    readonly insights: Map<string, Insight> = new Map()
  ) {}
  /**
   * register a new insight
   */
  register(insight: Insight): InsightRegistry {
    const id = insight.name;
    if (this.insights.has(id)) {
      throw new InsightAlreadyExists(id);
    }
    this.insights.set(insight.name, insight);
    this.insights.set(id, insight);
    return this;
  }

  /**
   * gets a specific insight by its name
   */
  getById(insightId: string) {
    return this.insights.get(insightId);
  }

  /**
   * deletes a specific insight by its name
   */
  delete(insightId: string) {
    this.insights.delete(insightId);
    return this;
  }
}
