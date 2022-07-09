import c from 'chalk';
import { ImportDetails, ImportStatus } from '../consumer/component-ops/import-components';
import Component from '../consumer/component/consumer-component';
import { FileStatus } from '../consumer/versions-ops/merge-version/merge-version';
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

export const formatPlainComponentItemWithVersions = (component: Component, importDetails: ImportDetails) => {
  const status: ImportStatus = importDetails.status;
  const id = component.id.toStringWithoutVersion();
  const versions = importDetails.versions.length ? `new versions: ${importDetails.versions.join(', ')}` : '';
  // $FlowFixMe component.version should be set here
  const usedVersion = status === 'added' ? `, currently used version ${component.version}` : '';
  const getConflictMessage = () => {
    if (!importDetails.filesStatus) return '';
    const conflictedFiles = Object.keys(importDetails.filesStatus) // $FlowFixMe file is set
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .filter((file) => importDetails.filesStatus[file] === FileStatus.manual);
    if (!conflictedFiles.length) return '';
    return `(the following files were saved with conflicts ${conflictedFiles.map((file) => c.bold(file)).join(', ')}) `;
  };
  const deprecated = importDetails.deprecated ? c.yellow('deprecated') : '';
  const missingDeps = importDetails.missingDeps.length
    ? c.red(`missing dependencies: ${importDetails.missingDeps.map((d) => d.toString()).join(', ')}`)
    : '';
  return `- ${c.green(status)} ${c.cyan(
    id
  )} ${versions}${usedVersion} ${getConflictMessage()}${deprecated} ${missingDeps}`;
};

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
