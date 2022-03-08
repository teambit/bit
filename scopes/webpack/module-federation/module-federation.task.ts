// import { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
// import { Component } from '@teambit/component';
// import { Bundler, BundlerContext } from '@teambit/bundler';
// import { WebpackMain } from '@teambit/webpack';

// const { ModuleFederationPlugin } = require('webpack').container;

// export class ModuleFederationTask implements BuildTask {
//   name = 'module-federation';

//   constructor(
//     readonly aspectId: string,
//     private webpack: WebpackMain
//   ) {}

//   location?: TaskLocation | undefined;

//   computeExposes(component: Component) {

//   }

//   execute(context: BuildContext): Promise<BuiltTaskResult> {
//     const bundlerContext: BundlerContext = Object.assign({}, context, {
//       targets: [],
//       entry: '',
//       publicPath: '',
//       rootPath: ''
//     });

//     const webpackBundler = this.webpack.createBundler(bundlerContext, [(config) => {
//       context.components.forEach((component) => {
//         config.addPlugin(new ModuleFederationPlugin({
//           name: component.id.scope,
//           filename: `${component.id.toString().replaceAll('/', '-')}.js`,
//           exposes: {

//           }
//         }));
//       });

//       return config;
//     }]);

//     const componentResults = context.capsuleNetwork.seedersCapsules.map((capsule) => {

//     });

//     return {

//     }
//   }
// }
