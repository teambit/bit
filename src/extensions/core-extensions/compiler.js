/** @flow */

// import Bit from 'bit-bin';
import Bit, { Command } from '../../api';
// import type { Command } from '../../core/life-cycle';

type CompilerProps = {
  compilers: Extension[], // compilers components (will be resolved to extension instance by bit)
  // Stolen from new babel-
  // https://babeljs.io/blog/2018/08/27/7.0.0#selective-configuration-with-overrides
  overrides: PipeOverride[], // A list of override pipes for specific components (to build them differently)
  config: { [string]: any }
};

type PipeOverride = {
  test: ComponentMatching, // regex for something - component names / main file type / components path prefix
  pipe: ComponentID[]
};

type ComponentMatching = {
  regexType: 'componentName' | 'mainFileType' | 'componentPathPrefix',
  regexVal: string
};

/**
 * register a new command named 'build' / 'compile' - V
 * register to hooks (pre tag) - V
 * change main file
 * save in models
 * read from models
 * get config (inc. component id)
 * declarative access other components - V
 * component modification api (dependencies)
 * eject conf
 * affect isolated env (write the dist files there and change the main file)
 * piping in bit.json for build process
 * default pipes (build and test etc.)
 */

export default class Compiler extends Bit.Extension {
  constructor(props: CompilerProps, context: Context) {
    super();
    // console.log("im here")
  }

  command(): Command[] | Command {
    return new Command({
      name: 'compile [id]',
      description: 'compile component',
      opts: [
        ['v', 'verbose [boolean]', 'showing npm verbose output for inspection'],
        ['', 'no-cache', 'ignore component cache when creating dist file']
      ],
      action: this.compile
    });
  }

  async tag(componentId: string, args) {
    await this.emit('pre-build', {});
    const target = this.compile(componentId, {
      noCache: false,
      verbose: false
    });
    this.emit('post-build', {});
  }

  compile(
    [id]: string[],
    {
      noCache = false,
      verbose = false
    }: {
      noCache: boolean,
      verbose: boolean
    }
  ) {
    // Will import the component to the cache (.bit/components) if necessary
    // will load/resolve it from workspace if it was imported as component
    // const concreteCompiler = Bit.requireComponent(this.config.ids[0]);
    const compilerEnv = props.compilers[0].createEnv(opts);
    const concreteCompiler = compilerEnv.get(); // ? think about the UX
    const component = Component.load(id);
    return concreteCompiler.compile(component);
    throw new Implement('compile method must be implemented');
  }
}

Compiler.propTypes = {
  compilerName: Bit.types.StringType
};

Compiler.defaultProps = {
  compilerName: 'babel'
};
