/** @flow */
import c from 'chalk';
import { formatter } from '../jsdoc';

export const formatInlineBit = ({ box, name, version }: any): string => 
c.white('     > ') + c.cyan(`${box}/${name} - ${version}`);

export const formatBit = ({ scope = '@this', box, name, version }: any): string => 
c.white('     > ') + c.cyan(`${scope}/${box}/${name} - ${version}`);

export const paintBitProp = (key: string, value: string): string => {
  if (!value) return '';
  return `${c.magenta(key)} -> ${value}\n`;
};

export const paintHeader = (value: string): string => {
  if (!value) return '';
  return `${c.underline(value)}\n`;
};

export const paintLog = ({ message, date, hash }: any): string => {
  return c.yellow(`commit ${hash}\n`) + c.white(`Date: ${date}\n`) + c.white(`\n      ${message}\n`);
};

export const paintDoc = (value: string): string => {
  if (!value) return '';
  return formatter(value);
};
