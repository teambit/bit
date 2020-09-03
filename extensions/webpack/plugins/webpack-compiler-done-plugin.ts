class WebpackCompilerDonePlugin {
  // onEvent;
  constructor(options: any) {
    console.log('---options-->: ', options);
  }

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (
      stats /* stats is passed as an argument when done hook is tapped.  */
    ) => {
      console.log('Webpack Compiler Done Plugin2');
    });
  }
}
const getPlugin = () => {
  return WebpackCompilerDonePlugin;
};

// module.exports = WebpackCompilerDonePlugin;
module.exports = getPlugin;

// class HelloWorldPlugin {
//     apply(compiler) {
//       compiler.hooks.done.tap('Hello World Plugin', (
//         stats /* stats is passed as an argument when done hook is tapped.  */
//       ) => {
//         console.log('Hello World!');
//       });
//     }
//   }

//   module.exports = HelloWorldPlugin;
