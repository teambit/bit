import CoffeeScript from 'coffeescript';
import es6Detective from '../detective-es6';

function coffeeToJs(src) {
  const coffeeStr = CoffeeScript.compile(src);
  const splited = coffeeStr.split('\n');
  splited.pop();
  splited.pop();
  splited.shift();
  return splited.join('\n');
}

export default function (src, options: Record<string, any> = {}) {
  return es6Detective(coffeeToJs(src));
}
