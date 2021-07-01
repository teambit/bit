/**
 * manual steps once done.
 * 1. go to ext/ext.*.runtime.ts and remove the `static id` line.
 * 2. go to ext/ext.*.runtime.ts and rename the class to have the prefix of Main, UI or Preview.
 * 3. search for ExtnameExtension in the code and replace with ExtAspect or ExtMain (or ExtUI)
 */
const fs = require('fs-extra');
const path = require('path');
const camelcase = require('camelcase');
const { execSync } = require('child_process');

const extDir = path.resolve(__dirname, '..', 'src/extensions');
const extensions = fs.readdirSync(extDir);

extensions.forEach((extName) => {
  console.log('working on extension ', extName);
  // writeAspectFile(extName);
  // moveExtensionToMainRuntime(extName);
  // moveManifestToMainRuntime(extName);
  // moveUiTsxToUIRuntime(extName);
  // movePreviewToPreviewRuntime(extName);
  // addExportsToIndexTs(extName);
  addRunTimeToMain(extName);
});

console.log('script ended successfully!');

function addRunTimeToMain(extName) {
  const extNameCamelCase = getExtNameCamelCase(extName);
  const mainRuntimePath = path.join(extDir, extName, `${extName}.main.runtime.ts`);
  if (!fs.existsSync(mainRuntimePath)) return;
  const content = fs.readFileSync(mainRuntimePath).toString();
  const contentChanged = `import { ${extNameCamelCase}Aspect } from './${extName}.aspect';
import { MainRuntime } from '../cli';
${content.replace(
  '  static dependencies =',
  `  static runtime = MainRuntime;
  static dependencies =`
)}
${extNameCamelCase}Aspect.addRuntime(${extNameCamelCase}Main);`;
  fs.writeFileSync(mainRuntimePath, contentChanged);
}

function addExportsToIndexTs(extName) {
  const indexFilePath = path.join(extDir, extName, 'index.ts');
  const indexFile = getIndexFileContent(extName);
  const extNameCamelCase = camelcase(extName, { pascalCase: true });
  const indexFileChanged =
    indexFile + getExportMandatory(extName) + getExportTypeForUI(extName) + getExportTypeForPreview(extName);

  fs.writeFileSync(getIndexFilePath(extName), indexFileChanged);
}

function getIndexFileContent(extName) {
  try {
    return fs.readFileSync(getIndexFilePath(extName)).toString();
  } catch (err) {
    return '';
  }
}

function getExtNameCamelCase(extName) {
  return camelcase(extName, { pascalCase: true });
}

function getExportMandatory(extName) {
  const extNameCamelCase = getExtNameCamelCase(extName);
  return `export type { ${extNameCamelCase}Main } from './${extName}.main.runtime';
`;
}

function getExportTypeForUI(extName) {
  const extNameCamelCase = camelcase(extName, { pascalCase: true });
  if (fs.existsSync(path.join(extDir, extName, `${extName}.ui.runtime.tsx`))) {
    return `export type { ${extNameCamelCase}UI } from './${extName}.ui.runtime';
`;
  }
  return '';
}

function getExportTypeForPreview(extName) {
  const extNameCamelCase = camelcase(extName, { pascalCase: true });
  if (fs.existsSync(path.join(extDir, extName, `${extName}.preview.runtime.tsx`))) {
    return `export type { ${extNameCamelCase}Preview } from './${extName}.preview.runtime';
`;
  }
  return '';
}

function getIndexFilePath(extName) {
  return path.join(extDir, extName, 'index.ts');
}

function moveExtensionToMainRuntime(extName) {
  const from = path.join(extDir, extName, `${extName}.extension.ts`);
  const to = path.join(extDir, extName, `${extName}.main.runtime.ts`);
  runGitMove(from, to);
}

function moveManifestToMainRuntime(extName) {
  const from = path.join(extDir, extName, `${extName}.manifest.ts`);
  const to = path.join(extDir, extName, `${extName}.main.runtime.ts`);
  runGitMove(from, to);
}

function moveUiTsxToUIRuntime(extName) {
  const from = path.join(extDir, extName, `${extName}.ui.tsx`);
  const to = path.join(extDir, extName, `${extName}.ui.runtime.tsx`);
  runGitMove(from, to);
}

function movePreviewToPreviewRuntime(extName) {
  const from = path.join(extDir, extName, `${extName}.preview.tsx`);
  const to = path.join(extDir, extName, `${extName}.preview.runtime.tsx`);
  runGitMove(from, to);
}

function runGitMove(from, to) {
  try {
    execSync(`git mv ${from} ${to}`);
  } catch (err) {
    // console.log('err ', err.toString());
  }
}

function writeAspectFile(extName) {
  const aspectFile = getAspectFile(extName);
  const aspectDir = path.join(extDir, extName, `${extName}.aspect.ts`);
  fs.writeFileSync(aspectDir, aspectFile);
}

function getAspectFile(extName) {
  const extNameCamelCase = camelcase(extName, { pascalCase: true });
  return `import { Aspect } from '@teambit/harmony';

export const ${extNameCamelCase}Aspect = Aspect.create({
  id: '@teambit/${extName}',
  dependencies: [],
  defaultConfig: {},
});`;
}
