import { Insight, InsightResult } from './insight';
import InsightAlreadyExists from './exceptions/insight-already-exists';
import InsightNotFound from './exceptions/insight-not-found';

export class InsightManager {
  /** insights is an insight registry */
  readonly insights: Map<string, Insight> = new Map();
  constructor(
    /**
     * array of registered insights
     */
    insights: Insight[]
  ) {
    insights.forEach(insight => {
      this.register(insight);
    });
  }

  /**
   * registers a new insight and returns the updated insight registry map
   */
  register(insight: Insight) {
    const name = insight.name;
    if (this.insights.has(name)) {
      throw new InsightAlreadyExists(name);
    }
    this.insights.set(name, insight);
  }
  /**
   * list of all registered insights
   */
  get listInsights(): string[] {
    return [...this.insights.keys()];
  }

  /**
   * gets a specific insight by its name or undefined if doesn't exist
   */
  getById(insightName: string): Insight | undefined {
    return this.insights.get(insightName);
  }

  /**
   * deletes a specific insight by its name if exists
   */
  delete(insightName: string) {
    if (!this.insights.has(insightName)) {
      throw new InsightNotFound(insightName);
    }
    this.insights.delete(insightName);
  }

  /**
   * execute an array of insights
   *
   */
  async run(insights: Insight[]): Promise<InsightResult[]> {
    const res: InsightResult[] = [];
    insights.forEach(async insight => {
      const insightRes: InsightResult = await insight.run();
      res.push(insightRes);
    });
    return res;
  }

  /**
   * execute all insights in the registry
   *
   */
  async runAll() {
    const res: InsightResult[] = [];
    for (let [name, insight] of this.insights) {
      const insightRes: InsightResult = await insight.run();
      res.push(insightRes);
    }
    return res;
  }
}
