import AbstractError from '../../error/abstract-error';

export default class ComponentsHaveIssues extends AbstractError {
  components: Record<string, any>;
  constructor(components: Record<string, any>) {
    super();
    this.components = components;
  }
}
