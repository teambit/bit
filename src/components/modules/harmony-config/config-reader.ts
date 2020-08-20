import { parse } from 'comment-json';
import { readFileSync, existsSync } from 'fs-extra';
import { ReadConfigError } from './exceptions/read-config-error';

export function readConfigFile(path: string, mustExist = true) {
  if (!mustExist && !existsSync(path)) {
    return {};
  }

  try {
    const json = parse(readFileSync(path, 'utf8'));
    delete json.$schema;
    return json;
  } catch (err) {
    throw new ReadConfigError(path, err);
  }
}
