import { Component } from '@teambit/component';
import { TesterAspect } from '../tester.aspect';

/**
 * detect test files in components
 */
export function detectTestFiles(component: Component) {
  const files = component.filesystem.files
    .filter((file) => {
      const testerConfig = component.config.extensions.findExtension(TesterAspect.id)?.config;
      // should be used as a default value.
      return file.relative.match(testerConfig?.testRegex || '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$');
    })
    .map((file) => file);
  return files;
}
