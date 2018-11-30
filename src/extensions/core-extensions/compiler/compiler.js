// @flow

export default class Compiler {
  dists: { [id: string]: files[] };
  constructor(props, context) {
    this.props = props;
    this.context = context;
  }
  addCommandHook(): Object {
    return {
      name: 'compile [id]',
      description: 'compile component files using other extensions',
      opts: [
        ['v', 'verbose', 'showing npm verbose output for inspection'],
        ['', 'no-cache', 'ignore component cache when creating dist file']
      ],
      action: this.action,
      report: this.report
    };
  }
  action(
    [id]: [string],
    {
      noCache = false,
      verbose = false
    }: {
      noCache: boolean,
      verbose: boolean
    }
  ): Promise<any> {
    if (!id) return buildAll(noCache, verbose);
    return build(id, noCache, verbose);
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
