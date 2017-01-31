/** @flow */
import c from 'chalk';
import { formatter } from '../jsdoc';

export const formatInlineBit = ({ box, name }: any): string => 
c.white('     > ') + c.cyan(`${box}/${name}`);

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

const paintAuthor = (email: ?string, username: ?string): string => {
  if (email && username) {
    return c.white(`Author: ${username} <${email}>\n`);
  } else if (email && !username) {
    return c.white(`Author: <${email}>\n`);
  } else if (!email && username) {
    return c.white(`Author: ${username}\n`);
  }
  
  return '';
};

export const paintLog = ({ message, date, hash, username, email }:
{ message: string, hash: string, date: string, username: ?string, email: ?string }): string => {
  return c.yellow(`commit ${hash}\n`) +
  paintAuthor(email, username) +
  c.white(`Date: ${date}\n`) +
  c.white(`\n      ${message}\n`);
};

export const paintDoc = (value: string): string => {
  if (!value) return '';
  return formatter(value);
};
