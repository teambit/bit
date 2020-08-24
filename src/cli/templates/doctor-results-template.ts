import chalk from 'chalk';
import { table } from 'table';

import { DoctorRunAllResults } from '../../api/consumer/lib/doctor';
import { ExamineResult } from '../../doctor/diagnosis';

// const NAME_COLUMN_WIDTH = 100;
// const DESCRIPTION_COLUMN_WIDTH = 30;

const summeryTableColumnConfig = {
  columnDefault: {
    alignment: 'left',
  },
};

type SummeryRow = [string, string, string, string];

function _formatStatusCell(status: boolean): string {
  if (status) {
    return chalk.green('passed');
  }
  return chalk.red('failed');
}

function _createSummeryRow(examineResult: ExamineResult): SummeryRow {
  const meta = examineResult.diagnosisMetaData;
  const status = _formatStatusCell(examineResult.bareResult.valid);
  return [meta.category, meta.name, meta.description, status];
}

function _createSummeryTable(examineResult: ExamineResult[]): string {
  const header = [chalk.bold('category'), chalk.bold('name'), chalk.bold('description'), chalk.bold('status')];
  const rows = examineResult.map(_createSummeryRow);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  rows.unshift(header);
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
  const title = chalk.underline('Error report');
  const fullDiagnosesReport = _createFullReportForDiagnoses(examineResult);
  if (fullDiagnosesReport.trim() === '') {
    return '';
  }
  return `${title}
${fullDiagnosesReport}`;
}

function _createWrittenFileSection(savedFilePath) {
  if (!savedFilePath) {
    return '';
  }
  return `File written to ${savedFilePath}`;
}

function _createMetaSection(metaData) {
  return `
  bit version   : ${metaData.bitVersion}
  node version  : ${metaData.nodeVersion}
  npm version   : ${metaData.npmVersion || 'NA'}
  yarn version  : ${metaData.yarnVersion || 'NA'}
  platform      : ${metaData.platform}
  user details  : ${metaData.userDetails}
`;
}

export default function render({ examineResults, savedFilePath, metaData }: DoctorRunAllResults): string {
  const meatSection = _createMetaSection(metaData);
  const summerySection = _createSummerySection(examineResults);
  const fullReportSection = _createFullReportSection(examineResults);
  const writtenFileSection = _createWrittenFileSection(savedFilePath);
  const output = `${meatSection}
${summerySection}
${fullReportSection}
${writtenFileSection}`;
  return output;
}
