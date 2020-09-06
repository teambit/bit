// import open from 'open';

class WebpackCompilerDonePlugin {
  onEvent: (event: any) => void;

  constructor(options: any) {
    console.log('---options-->: ', options);
    this.onEvent = options.onEvent;
  }

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (
      stats /* stats is passed as an argument when done hook is tapped.  */
    ) => {
      this.onEvent({ event: 'webpack-compilation-done' });
      console.log('Webpack Compiler Done Plugin2');
      //   open('http://localhost:3000/');
      //   open('https://sindresorhus.com');
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
