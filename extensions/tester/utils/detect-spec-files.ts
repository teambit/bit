import { Component } from '@teambit/component';
import { TesterAspect } from '../tester.aspect';

/**
 * detect test files in components
 */
export function detectTestFiles(components: Component[]) {
  return components.map((component) => {
    const paths = component.filesystem.files
      .filter((file) => {
        const testerConfig = component.config.extensions.findExtension(TesterAspect.id)?.config;
        // should be used as a default value.
        return file.relative.match(testerConfig?.testRegex || '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$');
      })
      .map((file) => file.relative);

    const componentWithSpecs = Object.assign(component, {
      specs: paths,
    });

    return componentWithSpecs;
  });
}
