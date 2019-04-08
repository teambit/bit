/** @flow */

import { table } from 'table';
import chalk from 'chalk';
import type { ExamineResult } from '../../doctor/Diagnosis';

// const NAME_COLUMN_WIDTH = 100;
// const DESCRIPTION_COLUMN_WIDTH = 30;

const summeryTableColumnConfig = {
  columnDefault: {
    alignment: 'left'
  }
};

type SummeryRow = [string, string, string, string];

function _formatStatusCell(status: boolean): string {
  if (status) {
    return chalk.green('pass');
  }
  return chalk.red('failed');
}

function _createSummeryRow(examineResult: ExamineResult): SummeryRow {
  const meta = examineResult.diagnosisMetaData;
  const status = _formatStatusCell(examineResult.bareResult.valid);
  return [meta.category, meta.name, meta.description, status];
}

function _createSummeryTable(examineResult: ExamineResult[]): string {
  const rows = examineResult.map(_createSummeryRow);
  const output = table(rows, summeryTableColumnConfig);
  return output;
}

function _createSummerySection(examineResult: ExamineResult[]): string {
  // A placeholder if we will decide we want a title
  const title = chalk.underline('');
  const summeryTable = _createSummeryTable(examineResult);
  return `${title}\n${summeryTable}`;
}

function _createFullReportForDiagnosis(examineResult: ExamineResult): string {
  if (examineResult.bareResult.valid) {
    return '';
  }
  const title = chalk.underline(examineResult.diagnosisMetaData.name);
  const symptomsTitle = chalk.underline('symptoms');
  const symptomsText = examineResult.formattedSymptoms;
  const cureTitle = chalk.underline('cure');
  const cureText = examineResult.formattedManualTreat;
  return `${title}
  ${symptomsTitle}
  ${symptomsText}
  ${cureTitle}
  ${cureText}\n`;
}

function _createFullReportForDiagnoses(examineResult: ExamineResult[]): string {
  const fullDiagnosesReport = examineResult.map(_createFullReportForDiagnosis).join('\n');
  return fullDiagnosesReport;
}

function _createFullReportSection(examineResult: ExamineResult[]): string {
  const title = chalk.underline('Full errors report');
  const fullDiagnosesReport = _createFullReportForDiagnoses(examineResult);
  if (fullDiagnosesReport.trim() === '') {
    return '';
  }
  return `${title}
${fullDiagnosesReport}`;
}

export default function render(examineResult: ExamineResult[]): string {
  const summerySection = _createSummerySection(examineResult);
  const fullReportSection = _createFullReportSection(examineResult);
  const output = `${summerySection}
${fullReportSection}`;
  return output;
}
