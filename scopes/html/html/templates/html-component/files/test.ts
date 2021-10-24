import { ComponentContext } from '@teambit/generator';

export const testFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.spec.tsx`,
    content: `import { renderTemplate } from '@teambit/html.modules.render-template';
    import { ${Name} } from './index';
    
    it('should render with the correct text', () => {
      const testString = "test string";
      const element = ${Name}({ text: testString });
      const body = document.body;
      renderTemplate(body, element);
      const renderedElement = [...document.getElementsByTagName("div")].find(el => el.textContent === testString);
      expect(renderedElement).toBeTruthy();
    });
`,
  };
};
