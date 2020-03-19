import React from 'react';
import { Color, Box, Text } from 'ink';
import { Command, CLIArgs } from '../cli';
import { Flags } from '../paper/command';
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
    this.description = 'start a dev environment for a workspace or a specific component';
    this.group = 'development';
  }

  async render([names]: CLIArgs, { list }: Flags) {
    if (list) {
      //return <Color green>There are many insights</Color>
      const results = this.insightManager.listInsights();
      const listItems = results.map(insight => (insight += '\n'));
      return <Color blueBright>{listItems}</Color>;
    }
    if (names) {
      let results: InsightResult[] = [];
      if (Array.isArray(names)) {
        results = await this.insightManager.run(names);
      } else {
        results = await this.insightManager.run([names]);
      }
      return <Color blueBright>{results}</Color>;
    }
    const results = await this.insightManager.runAll();
    // console.log('rendering,',results[0].renderedData)
    // return results[1].renderedData
    return (
      <Box flexDirection="column">
        {results.map(function(result) {
          return (
            <Box key={result.metaData.name} marginBottom={1} flexDirection="column">
              <Box>
                <Text bold underline>
                  {result.metaData.name}
                </Text>
              </Box>
              <Box marginTop={1}>{result.renderedData}</Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  // async someRender([components]: CLIArgs, { verbose, noCache }: Flags) {
  //   // @ts-ignore
  //   const compileResults = await this.compile.compile(components, { verbose, noCache });
  //   // eslint-disable-next-line no-console
  //   console.log("compileResults", compileResults)
  //   return <div >Compile has been completed successfully</div>;
  // }

  // async json([components]: CLIArgs, { verbose, noCache }: Flags) {
  //   // @ts-ignore
  //   const compileResults = await this.compile.compile(components, { verbose, noCache });
  //   return {
  //     data: compileResults,
  //     code: 0
  //   }
  // }

  // async someOtheRender([id]: CLIArgs) {
  //   // eslint-disable-next-line no-async-promise-executor
  //   return new Promise(async () => {
  //     // @ts-ignore
  //     const components = id ? await this.workspace.get(id) : await this.workspace.list();
  //     // const components = await this.workspace.get('base/card');
  //     const resolved = await this.pipes.run('build', components);

  //     const data = resolved.reduce((map, component) => {
  //       map[component.component.id.toString()] = component.capsule.wrkDir;
  //       return map;
  //     }, {});

  //     // eslint-disable-next-line no-console
  //     // start(data);

  //     return <Color green>das</Color>
  //   });
  // }

  // async yetAnotherRender([pipeline, components]: CLIArgs, { concurrency }: Flags) {
  //   const concurrencyN = (concurrency && typeof concurrency === 'string') ? Number.parseInt(concurrency) : 5;
  //   const actualComps = typeof components === 'string' ? [components]: components
  //   await this.scripts.run(pipeline as string, actualComps, { concurrency: concurrencyN});

  //   return <div />;
  // }

  //   action(
  //     [insightName]: string[],
  //     {
  //       list = false,
  //       save
  //     }: {
  //       list?: boolean;
  //       save?: string;
  //     }
  //   ): Promise<RunAllInsights | Insight[] | RunOneInsight> {
  //     if (list) {
  //       return listInsights();
  //     }
  //     let filePath = save;
  //     // Happen when used --save without specify the location
  //     // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  //     if (save === true) {
  //       filePath = '.';
  //     }
  //     if (insightName) {
  //       return runOne({ insightName, filePath });
  //     }
  //     return runAll({ filePath });
  //   }

  //   report(res: RunAllInsights | Insight[], args: any, flags: Record<string, any>): string {
  //     if (flags.list) {
  //       return _listReport(res, flags.json);
  //     }
  //     if (args && args[0]) {
  //       return _runOneReport(res, flags.json);
  //     }
  //     return _runAllReport(res, flags.json);
  //   }
}

// function _listReport(res: Insight[], json: boolean): string {
//   if (json) {
//     return JSON.stringify(res, null, 2);
//   }
//   const formatted = formatDiagnosesList(res);
//   return formatted;
// }

// function _runOneReport(res: RunOneInsight, json: boolean): string {
//   const { examineResult, savedFilePath, metaData } = res;
//   if (json) {
//     const fullJson = {
//       savedFilePath,
//       examineResult
//     };
//     return JSON.stringify(fullJson, null, 2);
//   }
//   const formatted = formatDiagnosesResult({ examineResults: [examineResult], savedFilePath, metaData });
//   return formatted;
// }

// function _runAllReport(res: RunAllInsights, json: boolean): string {
//   const { examineResults, savedFilePath, metaData } = res;
//   if (json) {
//     const fullJson = {
//       savedFilePath,
//       examineResults
//     };
//     return JSON.stringify(fullJson, null, 2);
//   }
//   const formatted = formatDiagnosesResult({ examineResults, savedFilePath, metaData });
//   return formatted;
// }
