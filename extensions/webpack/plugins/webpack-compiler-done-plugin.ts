// import open from 'open';

class WebpackCompilerDonePlugin {
  pubsub: (event: any) => void;

  constructor(options: any) {
    this.pubsub = options.pubsub;
  }

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (
      stats /* stats is passed as an argument when done hook is tapped.  */
    ) => {
      this.pubsub({ event: 'webpack-compilation-done' }); //!!!!!!!!!!!!!!!!!!!!!!!!
      console.log('Webpack Compiler Done Plugin2');
      //   open('http://localhost:3000/');
      //   open('https://sindresorhus.com');
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
