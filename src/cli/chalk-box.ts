import c from 'chalk';
import { ComponentLog } from '../scope/models/model-component';

export const formatNewBit = ({ name }: any): string => c.white('     > ') + c.cyan(name);

export const formatBit = ({ scope, name, version }: any) =>
  c.white('     > ') + c.cyan(`${scope ? `${scope}/` : ''}${name} - ${version ? version.toString() : 'latest'}`);

export const formatPlainComponentItem = ({ scope, name, version, deprecated }: any) =>
  c.cyan(
    `- ${scope ? `${scope}/` : ''}${name}@${version ? version.toString() : 'latest'}  ${
      deprecated ? c.yellow('[deprecated]') : ''
    }`
  );

export const formatBitString = (bit: string): string => c.white('     > ') + c.cyan(`${bit}`);

export const paintBitProp = (key: string, value: string) => {
  if (!value) return '';
  return `${c.magenta(key)} -> ${value}\n`;
};

export const paintHeader = (value: string) => {
  if (!value) return '';
  return `${c.underline(value)}\n`;
};

const paintAuthor = (email: string | null | undefined, username: string | null | undefined) => {
  if (email && username) {
    return c.white(`author: ${username} <${email}>\n`);
  }
  if (email && !username) {
    return c.white(`author: <${email}>\n`);
  }
  if (!email && username) {
    return c.white(`author: ${username}\n`);
  }

  return '';
};

export const paintLog = (log: ComponentLog): string => {
  const { message, date, tag, hash, username, email } = log;
  const title = tag ? `tag ${tag} (${hash})\n` : `snap ${hash}\n`;
  return (
    c.yellow(title) +
    paintAuthor(email, username) +
    (date ? c.white(`date: ${date}\n`) : '') +
    (message ? c.white(`\n      ${message}\n`) : '')
  );
};
