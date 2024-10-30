import { ComponentIssue } from './component-issue';

export class SelfReference extends ComponentIssue {
  description = 'a component has an import statement that points to itself';
  solution = 'edit the file and change the import statement to a relative path';
  data: { [filePath: string]: string } = {};
  isTagBlocker = true;
}
