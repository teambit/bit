/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-as-const */
/* eslint-disable one-var */
/* eslint-disable max-classes-per-file */
/**
 *
 * @param a this is A
 * @param b this is B
 * @returns
 */
export function myFunc(a = 4, b = 5): number {
  return a + b;
}

// import { Bar } from './button';

// export { Button } from './button';
// export type { ButtonProps } from './button';
export * from './button';

export function Hi() {}

export const a = 4,
  b: 5 = 5;

export * as Compositions from './button.composition';

export const HiThere = 'HiThere';

export const Function = () => {};

export const Array = ['hi', 'there'];

class Foo {}

class ClassSomething {
  app = '';
  constructor(readonly da: 'dsa') {}

  a() {
    return new Foo();
  }
  get getter() {
    return 'hi';
  }

  set setter(a: boolean) {}
}

export { ClassSomething };

export type IndexSig = { [key: string]: boolean };

export interface Hello {
  propertySig: () => void;
  methodSig(): string;
}

const obj = { a: 1, b: 2 };
// export const obj = () => ({ a: 1, b: 2 });
// export function getObj(a: string) { return { a: 1, b: 2 } };
// export function getObj(a: string, func: (b: number) => string, { a: any }) { return { a: 1, b: 2 } };

export const a1: typeof obj = { a: 5, b: 9 };

export type TypeOperator = keyof typeof obj;

// this is for Jump in the definition
class Bar {
  foo() {}
}
export const getBar = (bar: Bar) => new Bar();

export const tuple = ([a, b, c]: [string, Function, Record<string, any>]) => {};

export enum Food {
  Falafel,
  Hummus,
  Tahini,
}

export async function getPromise(): Promise<string> {
  return 'promise';
}

class T1 {}
class T2 {}
class T3<T, K> {}
export type TypeRefWithArgs = T3<T1, T2>;

export type ParenthesizedType = (T1 | T2)[];

export function typePredicateFn(str: any): str is string {
  return str;
}

export function typePredicateNoTypeFn(condition: any, msg?: string): asserts condition {}

export async function objectBindingElements({ prop = 1 }) {
  return prop;
}
export async function arrayBindingElements([prop]: [string]) {
  return prop;
}

interface config {
  someField: { a: string; b: boolean };
}
export type IndexedAccessType = config['someField'];
