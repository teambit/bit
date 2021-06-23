export async function createRootBootstrap(rootPath: string) {
  return `export default function bootstrap() {
debugger
// import('./${rootPath}').then((Module) => {
//   debugger;
//   return Module
// });
return import('./${rootPath}')
}
bootstrap();
`;
}
