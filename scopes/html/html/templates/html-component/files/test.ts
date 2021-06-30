import { ComponentContext } from '@teambit/generator';

export const testFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.spec.tsx`,
    content: `import { renderTemplate } from '@teambit/html.modules.render-template';
import { Basic${Name} } from './${name}.composition';

it('should render with the correct text', () => {
  const testString = "test string";
  const element = createElementFromString(${Name}(testString));
  const wrapper = document.createElement('div');
  renderTemplate(wrapper, element);
  const renderedElement = document.getElementsByTagName("div").find(el => el.textContent === testString);
  expect(renderedElement).toBeTruthy();
});
`,
  };
};
