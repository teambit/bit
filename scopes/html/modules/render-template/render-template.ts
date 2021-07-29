import { createElementFromString } from '@teambit/html.modules.create-element-from-string';

export function renderTemplate(target: HTMLElement, template: string) {
  target.appendChild(createElementFromString(template));
}
