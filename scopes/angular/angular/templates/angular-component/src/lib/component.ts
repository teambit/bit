import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `src/${name}.component.ts`,
    content: `import { Component, OnInit } from '@angular/core';

@Component({
  selector: '${name}',
  template: \`
      <p>
      ${name} works!
      </p>
        \`,
  styles: [
  ]
})
export class ${Name}Component implements OnInit {
  constructor() {}

  ngOnInit(): void {}
}
`,
  };
};
