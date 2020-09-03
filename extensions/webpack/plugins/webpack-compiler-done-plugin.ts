import open from 'open';

// let _onEvent;
class WebpackCompilerDonePlugin {
  // onEvent;
  constructor(options: any) {
    console.log('---options-->: ', options);
  }

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (
      stats /* stats is passed as an argument when done hook is tapped.  */
    ) => {
      //   _onEvent({event: 'webpack-compilation-done'})
      console.log('Webpack Compiler Done Plugin2');
      //   open('http://localhost:3000/');
      //   open('https://sindresorhus.com');
    });
  }
}
const getPlugin = () => {
  // _onEvent = onEvent;
  return WebpackCompilerDonePlugin;
};

// module.exports = WebpackCompilerDonePlugin;
module.exports = getPlugin;
