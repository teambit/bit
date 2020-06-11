import { Component } from '../../component';

/**
 * detect test files in components
 */
export function detectTestFiles(components: Component[]) {
  return components.map(component => {
    const paths = component.filesystem.readdirSync('/').filter(path => {
      const testerConfig = component.config.extensions.findExtension('@teambit/tester')?.data;
      // should be used as a default value.
      return path.match(testerConfig?.testRegex || '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$');
    });

    const componentWithSpecs = Object.assign(component, {
      specs: paths
    });

    return componentWithSpecs;
  });
}
