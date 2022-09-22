import { Section } from '@teambit/component';
import { APIReferenceUI } from '@teambit/api-reference';

export class APIRefSection implements Section {
  constructor(private apiReferenceUI: APIReferenceUI) {}

  order = 100;

  route = {
    path: '~apireference',
    element: this.apiReferenceUI.getAPIPage(),
  };

  navigationLink = {
    href: '~apireference',
    children: 'API Reference',
  };
}
