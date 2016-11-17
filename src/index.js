// @flow
import Resolver from './resolver'; 

const fn = (x: number, y: number) => {
  return (x * y).toString() + Resolver.isHere();
};

console.log(`hi ${fn(2, 2)}`);

export default fn; 
