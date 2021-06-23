export default function bootstrap(arg1, arg2) {
  debugger;
  console.log('arg1', arg1);
  console.log('arg2', arg2);
  // eslint-disable-next-line
  import('./bootstrap').then((module) => module.default(arg1, arg2));
}
