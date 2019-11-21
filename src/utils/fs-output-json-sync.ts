import fs from 'fs-extra';

export default function outputJsonFile(file: string, data: Record<string, any>): void {
  try {
    fs.ensureFileSync(file);
    return fs.outputJsonSync(file, data);
  } catch (e) {
    console.error(`failed to write output to file:${e}`); // eslint-disable-line no-console
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return file;
}
