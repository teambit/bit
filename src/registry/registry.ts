/** @flow */
import fs from 'fs';
import iniBuilder from 'ini-builder';
import path from 'path';
import userHome from 'user-home';

import { DEFAULT_BINDINGS_PREFIX } from '../constants';
import { PathToNpmrcNotExist, WriteToNpmrcError } from './exceptions';

function findrc(pathToNpmrc: string) {
  let userNpmrc = path.join(userHome, '.npmrc');
  if (pathToNpmrc) {
    if (!fs.existsSync(pathToNpmrc)) throw new PathToNpmrcNotExist(pathToNpmrc);
    const stats = fs.statSync(pathToNpmrc);
    if (stats.isFile()) userNpmrc = pathToNpmrc;
    else userNpmrc = path.join(pathToNpmrc, '.npmrc');
  }
  return userNpmrc;
}

function mergeOrCreateConfig(
  token: string,
  url: string,
  config: Array<Record<string, any>> = []
): Array<Record<string, any>> {
  const strippedUrl = url.replace(/(^\w+:|^)\/\//, '');
  const iniReg = iniBuilder.find(config, `${DEFAULT_BINDINGS_PREFIX}:registry`);
  const iniToken = iniBuilder.find(config, `//${strippedUrl}/:_authToken`);
  if (!iniReg) {
    config.push({
      path: [`${DEFAULT_BINDINGS_PREFIX}:registry`],
      value: url,
    });
  } else {
    iniReg.value = url;
  }
  if (!iniToken) {
    config.push({
      path: [`//${strippedUrl}/:_authToken`],
      value: token,
    });
  } else {
    iniToken.value = token;
  }
  return config;
}

export default function npmLogin(token: string, pathToNpmrc: string, url: string): string {
  const npmrcPath = findrc(pathToNpmrc);
  const npmrcConfig = fs.existsSync(npmrcPath)
    ? mergeOrCreateConfig(token, url, iniBuilder.parse(fs.readFileSync(npmrcPath, 'utf-8')))
    : mergeOrCreateConfig(token, url);
  try {
    fs.writeFileSync(npmrcPath, iniBuilder.serialize(npmrcConfig));
  } catch (err) {
    throw new WriteToNpmrcError(npmrcPath);
  }
  return npmrcPath;
}
