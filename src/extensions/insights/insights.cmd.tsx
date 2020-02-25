
import runAll, { listDiagnoses, runOne } from './run-insights';
import formatDiagnosesList from '../../templates/diagnosis-list-template'; // use Ink instead!!
import formatDiagnosesResult from '../../templates/doctor-results-template'; // use Ink instead!!
import { RunAllInsights, RunOneInsight } from './run-insights';
import Insight from './insight';
import {Command, CLIArgs} from '../cli'
import { Flags } from '../paper/command';
import React from 'react';

export default class Insights implements Command {
  name = 'insights [insight-name]';
  description = 'get insights on your components';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    // ['j', 'json', 'return diagnoses in json format'],
    // ['', 'list', 'list all available diagnoses'],
    // ['s', 'save [filePath]', 'save diagnoses to a file']
  ];
  migration = false;

  async render([components]: CLIArgs, { verbose, noCache }: Flags) {
    // @ts-ignore
    const compileResults = await this.compile.compile(components, { verbose, noCache });
    // eslint-disable-next-line no-console
    console.log("compileResults", compileResults)
    return <div>Compile has been completed successfully</div>;
  }

  action(
    [insightName]: string[],
    {
      list = false,
      save
    }: {
      list?: boolean;
      save?: string;
    }
  ): Promise<RunAllInsights | Insight[] | RunOneInsight> {
    if (list) {
      return listDiagnoses();
    }
    let filePath = save;
    // Happen when used --save without specify the location
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (save === true) {
      filePath = '.';
    }
    if (insightName) {
      return runOne({ insightName, filePath });
    }
    return runAll({ filePath });
  }

  report(res: RunAllInsights | Insight[], args: any, flags: Record<string, any>): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (flags.list) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return _listReport(res, flags.json);
    }
    if (args && args[0]) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return _runOneReport(res, flags.json);
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return _runAllReport(res, flags.json);
  }
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
