/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color } from 'ink';
import { PaperError } from '../../paper';

export default class InsightAlreadyExists extends PaperError {
  constructor(readonly insightName: string) {
    super(generateMessage(insightName));
  }
  render() {
    return <Color red>{this.message}</Color>;
  }
}
function generateMessage(insightName: string) {
  return `Insight ${insightName} already exists`;
}
