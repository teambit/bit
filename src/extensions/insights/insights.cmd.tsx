/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color, Box, Text } from 'ink';
import { Command, CLIArgs } from '../cli';
import { Flags } from '../paper';
import { InsightManager } from './insight-manager';
import { InsightResult } from './insight';

export default class InsightsCmd implements Command {
  name: string;
  description: string;
  group: string;
  opts: string[][];
  insightManager: InsightManager;
  constructor(insightManager: InsightManager) {
    this.insightManager = insightManager;
    this.opts = [['l', 'list', 'list all insights']];
    this.name = 'insights [...names]';
    this.description = 'Insights on component graph';
    this.group = 'development';
  }

  async render([names]: CLIArgs, { list }: Flags) {
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
