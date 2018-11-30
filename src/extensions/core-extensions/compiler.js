// @flow

export default class Compiler {
  dists: { [id: string]: files[] };
  constructor(props, context) {
    this.props = props;
    this.context = context;
  }
  addCommandHook(): Object {
    return {
      name: 'compile',
      description: 'compile component files using other extensions',
      opts: [
        ['v', 'verbose', 'showing npm verbose output for inspection'],
        ['', 'no-cache', 'ignore component cache when creating dist file']
      ],
      action: this.action,
      report: this.report
    };
  }
  action() {
    // const components = this.context.workspace.getModifiedComponents();
    // components.map(component => this.compileComponent(component));
  }
  report(result) {}
  compileComponent(component) {
    this.context.hook.triggerComponentsHook('preCompile', component);
    const dists = this.context.hook.triggerComponentsHook('compile', component, { distPath: '' });
    this.context.hook.triggerComponentsHook('postCompile', component, { dists });
    this.dists[component.id.toString()] = dists;
    return dists;
  }
  preTagHook(component, args) {
    this.compileComponent(component);
  }
  preSaveVersionHook(version: Version, componentId: string) {
    version.dists = this.dists[componentId];
  }
}
