import { MousetrapInstance } from 'mousetrap';

export class MousetrapStub implements MousetrapInstance {
  stopCallback() {
    return false;
  }
  bind() {
    return this;
  }
  unbind() {
    return this;
  }
  trigger() {
    return this;
  }
  handleKey() {}
  reset() {
    return this;
  }
}
