
import React from 'react';
import { Color } from 'ink';
import {Command, CLIArgs} from '../cli'
import { Flags } from '../paper/command';
import { InsightManager } from './insight-manager';

export default class InsightsCmd implements Command {
  // name = 'insights [insight-name]';
  // description = 'get insights on your components';
  // alias = '';
  // opts = []; // should be of the format: ['j', 'json', 'return diagnoses in json format']
  name = 'insights [...names]';
  description = 'start a dev environment for a workspace or a specific component'
  group = 'development'
  shortDescription = ''
  // @ts-ignore
  options = [['l', 'list', 'list all insights']]

  constructor(
    private insightManager: InsightManager,
  ) {}

  async render([names]: CLIArgs, { list }: Flags) {
    if (list) {
      return <Color green>There are many insights</Color>
    }
    // args - names of insights
    // opts - list
    // if list
    // insightMagnager.list()
    // return list in pretty way
    // if insigtNames
    // insightMagnager.run(insightNames)
    // else
    // insightMagnager.runAll()
    // return in pretty way
    // return div (react element)
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
