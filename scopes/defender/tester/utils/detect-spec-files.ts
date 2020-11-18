import { Component } from '@teambit/component';
import { DevFilesMain } from '@teambit/dev-files';
import { TesterAspect } from '../tester.aspect';

/**
 * detect test files in components
 */
export function detectTestFiles(component: Component, devFiles: DevFilesMain) {
  const files = devFiles.getDevFiles(component);
  const testFiles = files.get(TesterAspect.id);
  return component.state.filesystem.files.filter((file) => testFiles.includes(file.relative));
}
