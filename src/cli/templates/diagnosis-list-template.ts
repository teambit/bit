import chalk from 'chalk';
import { table } from 'table';

import Diagnosis from '../../doctor/diagnosis';

// const NAME_COLUMN_WIDTH = 100;
// const DESCRIPTION_COLUMN_WIDTH = 30;

const tableColumnConfig = {
  columnDefault: {
    alignment: 'left',
  },
};

type DiagnosisRow = [string, string, string];

function createRow(diagnosis: Diagnosis): DiagnosisRow {
  return [diagnosis.category, diagnosis.name, diagnosis.description];
}

export default function formatDiagnosesList(diagnosesList: Diagnosis[]): string {
  const header = [chalk.bold('category'), chalk.bold('name'), chalk.bold('description')];
  const rows = diagnosesList.map(createRow);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  rows.unshift(header);
  const output = table(rows, tableColumnConfig);
  return output;
}
