
import { RunAllInsights, RunOneInsight } from './run-insights';
import Insight from './insight';
import {Command, CLIArgs} from '../cli'
import { Flags } from '../paper/command';
import React from 'react';
import { InsightManager } from './insight-manager';

export default class InsightsCmd implements Command {
  // name = 'insights [insight-name]';
  // description = 'get insights on your components';
  // alias = '';
  // opts = []; // should be of the format: ['j', 'json', 'return diagnoses in json format']
  name = 'start [id]';
  description = 'start a dev environment for a workspace or a specific component'
  group = 'development'
  shortDescription = ''
  options = []

  constructor(
    private insightManager: InsightManager,
  ) {}

  async render([insightNames]: CLIArgs, { list }: Flags) {
    // args - names of insights
    // options - list
    // if list
    // insightMagnager.list()
    // return list in pretty way
    // if insigtNames
    // insightMagnager.runMany(insightNames)
    // else
    // insightMagnager.runAll()
    // return in pretty way
  }

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

function _listReport(res: Insight[], json: boolean): string {
  if (json) {
    return JSON.stringify(res, null, 2);
  }
  const formatted = formatDiagnosesList(res);
  return formatted;
}

function _runOneReport(res: RunOneInsight, json: boolean): string {
  const { examineResult, savedFilePath, metaData } = res;
  if (json) {
    const fullJson = {
      savedFilePath,
      examineResult
    };
    return JSON.stringify(fullJson, null, 2);
  }
  const formatted = formatDiagnosesResult({ examineResults: [examineResult], savedFilePath, metaData });
  return formatted;
}

function _runAllReport(res: RunAllInsights, json: boolean): string {
  const { examineResults, savedFilePath, metaData } = res;
  if (json) {
    const fullJson = {
      savedFilePath,
      examineResults
    };
    return JSON.stringify(fullJson, null, 2);
  }
  const formatted = formatDiagnosesResult({ examineResults, savedFilePath, metaData });
  return formatted;
}
