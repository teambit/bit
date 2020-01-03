import { container } from 'tsyringe';
import Extension from './extension';

export default class Harmony {
  register(extension: Extension) {}

  resolve() {}

  static load(workspace: Workspace) {}
}
