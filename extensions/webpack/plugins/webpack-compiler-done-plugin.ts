class WebpackCompilerDonePlugin {
  pubsub: any;

  constructor({ options }) {
    this.pubsub = options.pubsub;
  }

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (
      stats /* stats is passed as an argument when done hook is tapped.  */
    ) => {
      this.pubsub.createOrGetTopic('webpack-pubsub-topic');
      this.pubsub.publishToTopic('webpack-pubsub-topic', { event: 'webpack-compilation-done' });
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
