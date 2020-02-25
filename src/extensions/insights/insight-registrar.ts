import Insight from './insight';

/*
 * Setting up block level variable to store class state
 * set's to null by default.
 */
let instance = null;

const _checkName = name => (insight: Insight) => {
  return insight.name === name;
};

export default class InsightRegistrar {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  insights: Insight[];

  constructor() {
    if (!instance) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      instance = this;
    }

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return instance;
  }

  /**
   * Initialize the default insights
   */
  static init(insights: Insight[] = []) {
    const self = new InsightRegistrar();
    self.insights = insights;
  }

  /**
   * Get the instance of the InsightRegistrar
   * @return {InsightRegistrar} instance of the InsightRegistrar
   *
   */
  static getInstance(): InsightRegistrar {
    if (!instance) {
      InsightRegistrar.init();
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return instance;
  }

  /**
   * Register a new insight
   * @param {Insight} insight
   */
  registerInsight(insight: Insight) {
    this.insights.push(insight);
  }

  getInsightByName(name: string) {
    return this.insights.find(_checkName(name));
  }
}
