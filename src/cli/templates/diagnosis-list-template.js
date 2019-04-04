/** @flow */

import { table } from 'table';
import Diagnosis from '../../doctor/Diagnosis';

// const NAME_COLUMN_WIDTH = 100;
// const DESCRIPTION_COLUMN_WIDTH = 30;

const tableColumnConfig = {
  columns: {
    // $FlowFixMe
    1: {
      alignment: 'left'
      // width: NAME_COLUMN_WIDTH
    },
    // $FlowFixMe
    2: {
      alignment: 'left'
      // width: DESCRIPTION_COLUMN_WIDTH
    },
    // $FlowFixMe
    3: {
      alignment: 'left'
      // width: DESCRIPTION_COLUMN_WIDTH
    }
  }
};

type DiagnosisRow = [string, string, string];

function createRow(diagnosis: Diagnosis): DiagnosisRow {
  return [diagnosis.category, diagnosis.name, diagnosis.description];
}

export default function formatDiagnosesList(diagnosesList: Diagnosis[]): string {
  const rows = diagnosesList.map(createRow);
  const output = table(rows, tableColumnConfig);
  return output;
}
