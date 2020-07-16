import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color, Box, Text } from 'ink';
import { Command, CommandOptions } from '../cli';
import { InsightManager } from './insight-manager';
import { InsightResult } from './insight';

export default class InsightsCmd implements Command {
  name = 'insights [...names]';
  description = 'Insights on component graph';
  group = 'development';
  private = true;
  options = [['l', 'list', 'list all insights']] as CommandOptions;
  insightManager: InsightManager;
  constructor(insightManager: InsightManager) {
    this.insightManager = insightManager;
  }

  async render([names]: [string[]], { list }: { list: boolean }) {
    if (list) {
      const results = this.insightManager.listInsights();
      const listItems = results.map(insight => (insight += '\n'));
      return <Color blueBright>{listItems}</Color>;
    }
    if (names) {
      let results: InsightResult[] = [];
      const namesArr = typeof names === 'string' ? [names] : names;
      results = await this.insightManager.run(namesArr);
      return <Color blueBright>{results}</Color>;
    }
    const results = await this.insightManager.runAll();
    return template(results);
  }
}

function template(results) {
  return (
    <div key="help">
      {results.map(function(result) {
        return (
          <div key={result.metaData.name}>
            <div>
              <Text>{'\n'}</Text>
              <Text bold underline>
                {result.metaData.name}
              </Text>
            </div>
            <div>{result.renderedData}</div>
          </div>
        );
      })}
    </div>
  );
}
