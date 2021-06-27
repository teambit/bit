export default async function bootstrap(arg1, arg2, arg3, arg4, arg5) {
  // eslint-disable-next-line
  debugger;
  // const resolvedCompositions = await arg3;
  return import('./bootstrap').then((module) => module.default(arg1, arg2, arg3, arg4, arg5));
}
