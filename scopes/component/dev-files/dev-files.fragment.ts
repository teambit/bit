import { ShowFragment, Component } from '@teambit/component';
import { DevFilesMain } from './dev-files.main.runtime';

export class DevFilesFragment implements ShowFragment {
  constructor(private devFiles: DevFilesMain) {}

  title = 'dev files';

  stringifyDevFiles(component: Component) {
    const devFiles = this.devFiles.getDevFiles(component);
    const tuples = devFiles.toTupleArray();
    return tuples
      .map(([file, aspectId]) => {
        return `${file} (${aspectId})`;
      })
      .join('\n');
  }

  async renderRow(component: Component) {
    return {
      title: this.title,
      content: this.stringifyDevFiles(component),
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.devFiles.getDevFiles(component).toObject(),
    };
  }

  weight = 7;
}
