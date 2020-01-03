import { container } from 'tsyringe';
import Extension from './extension';

export default class Harmony {
  register() {}

  resolve() {}

  static load() {
    return new Harmony();
  }
}
