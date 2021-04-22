import { ComponentContext } from '@teambit/generator';

export const testFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.spec.ts`,
    content: `import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ${Name}Component } from './${name}.component';

describe('${Name}Component', () => {
  let component: ${Name}Component;
  let fixture: ComponentFixture<${Name}Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ${Name}Component ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(${Name}Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
`,
  };
};
