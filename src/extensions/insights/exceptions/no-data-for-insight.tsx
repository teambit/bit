/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color } from 'ink';
import { PaperError } from '../../paper';

export default class NoDataForInsight extends PaperError {
  constructor(readonly insightName: string) {
    super(generateMessage(insightName));
  }
  render() {
    return <Color red>{this.message}</Color>;
  }
}
function generateMessage(insightName: string) {
  return `No data for ${insightName}`;
}
