import { Harmony } from './harmony';
// import { BitExt } from '../../bit/dist/extensions/bit';
// import { BaseCompiler } from './fixtures/base-compiler';
// import { TypeScript } from './fixtures/typescript/typescript';
// import { Babel } from './fixtures/babel/babel.extension';
// import { Slot, SlotRegistry } from './slots';
// import { start } from 'repl';
// import { ExtensionManifest } from './extension';
import { ReactAspect } from './fixtures/aspects/react/react.aspect';
import { ReactCLI } from './fixtures/aspects/react/react.cli';
import { ReactUI } from './fixtures/aspects/react/react.ui';

describe('Harmony', () => {
  describe('run()', () => {
    //   it('should return a string', async () => {
    //     const manifest = {
    //       name: 'HelloWorld',
    //       provider: async () => 'hello world'
    //     };
    //     await harmony.run(manifest);
    //     expect(harmony.get('HelloWorld')).eql('hello world');
    //   });
    //   it('should load an array of different extensions', async () => {
    //     await harmony.run([BaseCompiler, TypeScript]);
    //     const compiler = harmony.get<BaseCompiler>('BaseCompiler')
    //     const typescript = harmony.get<TypeScript>('typescript')
    //     expect(typescript.compile()).to.eq('hello world');
    //     expect(compiler.compile()).to.eq('hello world');
    //   });
    //   it('should load extensions with slots', async () => {
    //     class Env {
    //       build () {
    //         return 'react built';
    //       }
    //     }
    //     it('extension instance should include an ID', async () => {
    //       const React = {
    //         name: '@teambit/react',
    //         dependencies: [],
    //         provide: async () => {}
    //       };
    //       await harmony.run([React]);
    //       const react = harmony.get<any>(React.name);
    //       expect(react.id).to.eq(React.name);
    //     });
    //     const Envs: ExtensionManifest = {
    //       name: '@teambit/envs',
    //       slots: [Slot.withType<Env>()],
    //       provider: async ([], config: {env: string}, [envSlot]: [SlotRegistry<Env>]) => {
    //         return {
    //           register: (env: Env) => {
    //             envSlot.register(env);
    //           },
    //           start() {
    //             const instance = envSlot.get(config.env);
    //             if (!instance) throw new Error('could not find envs');
    //             return instance.build();
    //           }
    //         };
    //       }
    //     };
    //     const React = {
    //       name: '@teambit/react',
    //       dependencies: [Envs],
    //       provide: async ([envs]: [{ register: (env: Env) => void }], config: {}) => {
    //         envs.register(new Env());
    //       }
    //     };
    //     const harmony = Harmony.load([Envs, React], {
    //       '@teambit/envs': {
    //         env: '@teambit/react'
    //       }
    //     });
    //     await harmony.run([Envs, React]);
    //     const envs = harmony.get<any>(Envs.name);
    //     expect(envs.start()).to.eq('react built');
    //   });
    //   it('should load extensions with config', async () => {
    //     const e1 = {
    //       name: '@teambit/typescript',
    //       provider: async ([], config: { declarations: boolean }) => {
    //         return {
    //           get: () => {
    //             return config.declarations || false
    //           }
    //         };
    //       }
    //     };
    //     const e2 = { name: '@teambit/react', defaultConfig: {ts: false}, provide: async ([], config: any) => {
    //        return {
    //          config: config.ts
    //        };
    //       }
    //     };
    //     const harmony = Harmony.load([e1], {
    //       '@teambit/typescript': {
    //         declarations: true
    //       },
    //     });
    //     await harmony.run([e1]);
    //     const ts = harmony.get<{get: () => {}}>('@teambit/typescript');
    //     expect(ts.get()).to.eq(true);
    //     harmony.config.set('@teambit/react', {ts: true});
    //     await harmony.set([e2]);
    //     const react = harmony.get<{[key: string]: object}>('@teambit/react');
    //     expect(react.config).to.eq(true);
    //   });
    //   it('should invoke a class extension method', async () => {
    //     await harmony.run(BaseCompiler);
    //     const compiler = harmony.get<BaseCompiler>('BaseCompiler')
    //     expect(compiler.compile()).to.eq('hello world');
    //   });
    //   it('should invoke a class extension with configured dependencies', async () => {
    //     await harmony.run(TypeScript);
    //     const typescript = harmony.get<TypeScript>('typescript')
    //     expect(typescript.compile()).to.eq('hello world');
    //   });
    //   it('should use prefer id over name', async () => {
    //     const dependency = {
    //       name: 'dependencyName',
    //       id: 'dependencyId',
    //       provider: async () => 'hello world'
    //     };
    //     const dependent = {
    //       name: 'dependentName',
    //       id: 'dependentId',
    //       dependencies: [dependency],
    //       provider: async () => 'hello world'
    //     };
    //     await harmony.run(dependent);
    //     const ids = harmony.extensionsIds;
    //     expect(ids).to.contain('dependencyId');
    //     expect(ids).to.contain('dependentId');
    //   });
    //   it('should execute bit core extension graph', async () => {
    //     // const bit = await Harmony.run(BitExt);
    //   });
    //   it('should register during run', async () => {
    //     const compiler = await harmony.run(Babel);
    //   });
    // it('should execute an aspect in the cli runtime', async() => {
    //   const harmony = await Harmony.load([ReactAspect], 'cli', {});
    //   await harmony.run();
    //   const react = harmony.get<ReactCLI>('@teambit/react');
    // })
    // it('should execute an aspect in the ui runtime', async() => {
    //   const harmony = await Harmony.load([ReactAspect], 'ui', {});
    //   await harmony.run();
    //   const react = harmony.get<ReactUI>('@teambit/react');
    //   expect(react.render()).toBeTruthy;
    // })
  });
});
