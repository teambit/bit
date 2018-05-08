/** @flow */
import fs from 'fs';
import path from 'path';
import iniBuilder from 'ini-builder';
import userHome from 'user-home';
import { DEFAULT_BINDINGS_PREFIX } from '../constants';

function findrc(pathToNpmrc: string) {
  let userNpmrc = path.join(userHome, '.npmrc');
  if (pathToNpmrc && fs.existsSync(pathToNpmrc)) {
    const stats = fs.statSync(pathToNpmrc);
    if (stats.isFile()) userNpmrc = pathToNpmrc;
    else userNpmrc = path.join(pathToNpmrc, '.npmrc');
  }
  return userNpmrc;
}

function mergeOrCreateConfig(token: string, url: string, config: Array<Object> = []): Array<Object> {
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

export default function npmLogin(token: string, pathToNpmrc: string, url: string): void {
  const npmrcPath = findrc(pathToNpmrc);
  const npmrcConfig = (fs.existsSync(npmrcPath)) ? mergeOrCreateConfig(token, url, iniBuilder.parse(fs.readFileSync(npmrcPath, 'utf-8'))) : mergeOrCreateConfig(token, url);
  fs.writeFileSync(npmrcPath, iniBuilder.serialize(npmrcConfig));
}
