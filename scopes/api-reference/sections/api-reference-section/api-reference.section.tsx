import { Section } from '@teambit/component';
import { APIReferenceUI } from '@teambit/api-reference';

export class APIRefSection implements Section {
  constructor(private apiReferenceUI: APIReferenceUI) {}

  order = 100;

  route = {
    path: '~api-reference',
    element: this.apiReferenceUI.getAPIPage(),
  };

  navigationLink = {
    href: '~api-reference',
    children: 'API Reference',
  };
}
