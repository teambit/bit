import InsightAlreadyExists from './exceptions/insight-already-exists';
import InsightNotFound from './exceptions/insight-not-found';
import { Insight, InsightResult } from './insight';

export type RunInsightOptions = {
  renderData: boolean;
};
export class InsightManager {
  /** insights is an insight registry */
  readonly insights: Map<string, Insight> = new Map();
  constructor(
    /**
     * array of registered insights
     */
    insights: Insight[]
  ) {
    insights.forEach((insight) => {
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
  listInsights(): string[] {
    return [...this.insights.keys()];
  }

  /**
   * gets a specific insight by its name or undefined if doesn't exist
   */
  getByName(insightName: string): Insight | undefined {
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
  async run(insightNames: string[], opts: RunInsightOptions): Promise<InsightResult[]> {
    const res: InsightResult[] = [];
    await Promise.all(
      insightNames.map(async (insightName) => {
        const insight = this.getByName(insightName);
        if (insight) {
          const insightRes: InsightResult = await insight.run();
          if (!opts.renderData) {
            delete insightRes.renderedData;
          }
          res.push(insightRes);
        }
      })
    );
    return res;
  }

  /**
   * execute all insights in the registry
   *
   */
  async runAll(opts: RunInsightOptions): Promise<InsightResult[]> {
    const allInsightNames = this.listInsights();
    return this.run(allInsightNames, opts);
  }
}
