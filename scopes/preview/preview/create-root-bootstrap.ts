export async function createRootBootstrap(rootPath: string) {
  return `
  console.log('create root bootstrap');
  // import React from 'react';
  // const importReactP = import('react');
  // async function load(){
  //     await importReactP;
  // }()

export default async function bootstrap() {
  // await importReactP;
  return import('./${rootPath}')
}
bootstrap();
`;
}
