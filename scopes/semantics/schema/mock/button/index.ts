/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-as-const */
/* eslint-disable one-var */
/* eslint-disable max-classes-per-file */

/**
 * General comment of the myFunc
 * @deprecate example of deprecation tag
 * @param a { number } this is A
 * @param b this is B
 * @returns { number } results of adding a to b
 */
export function myFunc(a = 4, b = 5): number {
  return a + b;
}

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

const computedName = 'str';
export interface ComputedNameWithType {
  [computedName]: boolean;
}
export interface ComputedNameNoType {
  [computedName];
}

type World1 = 'world1-a' | 'world1-b';
type World2 = 'world2';
export type templateLiteralType = `hello ${World1} hi ${World2}`;

export interface CallSignatureWithTypeParams {
  <T>(a: string): T;
}

/**
 * Conditional Generic Type
 */
export type If<T, U, Y, N> = T extends U ? Y : N;

export function genericFunction<T>(a: T) {
  return function <T>(a: T) {};
}

export const gfnc2 = genericFunction<string>('');
