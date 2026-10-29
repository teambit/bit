import { expect } from 'chai';
import type * as Real from './contracts.real-types';
import type * as Contract from './index';

/**
 * the contract types are a narrow copy of the aspects' types. these assertions fail the type check
 * when they drift apart:
 * - what Bit passes to envs must be assignable to the contract type the env receives.
 * - what envs return to Bit must be assignable to the type Bit expects.
 */
type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

// Bit passes these to envs.
export type BitToEnv = [
  Assert<IsAssignable<Real.EnvContext, Contract.EnvContext>>,
  Assert<IsAssignable<Real.ExecutionContext, Contract.ExecutionContext>>,
  Assert<IsAssignable<Real.Component, Contract.Component>>,
  Assert<IsAssignable<Real.ComponentMap<string>, Contract.ComponentMap<string>>>,
  Assert<IsAssignable<Real.Capsule, Contract.Capsule>>,
  Assert<IsAssignable<Real.Network, Contract.Network>>,
  Assert<IsAssignable<Real.BuildContext, Contract.BuildContext>>,
  Assert<IsAssignable<Real.TaskResultsList, Contract.TaskResultsList>>,
  Assert<IsAssignable<Real.TesterContext, Contract.TesterContext>>,
  Assert<IsAssignable<Real.LinterContext, Contract.LinterContext>>,
  Assert<IsAssignable<Real.FormatterContext, Contract.FormatterContext>>,
  Assert<IsAssignable<Real.ComponentContext, Contract.ComponentContext>>,
  Assert<IsAssignable<Real.WorkspaceContext, Contract.WorkspaceContext>>,
];

// envs return these to Bit.
export type EnvToBit = [
  Assert<IsAssignable<Contract.Compiler, Real.Compiler>>,
  Assert<IsAssignable<Contract.Tester, Real.Tester>>,
  Assert<IsAssignable<Contract.Linter, Real.Linter>>,
  Assert<IsAssignable<Contract.Formatter, Real.Formatter>>,
  Assert<IsAssignable<Contract.SchemaExtractor, Real.SchemaExtractor>>,
  Assert<IsAssignable<Contract.BuildTask, Real.BuildTask>>,
  Assert<IsAssignable<Contract.Pipeline, Real.Pipeline>>,
  Assert<IsAssignable<Contract.Tests, Real.Tests>>,
  Assert<IsAssignable<Contract.PackageGenerator, Real.PackageGenerator>>,
  Assert<IsAssignable<Contract.TemplateList, Real.TemplateList>>,
  Assert<IsAssignable<Contract.StarterList, Real.StarterList>>,
  Assert<IsAssignable<Contract.ConfigWriterList, Real.ConfigWriterList>>,
  Assert<IsAssignable<Contract.EnvHandler<Contract.Compiler>, Real.EnvHandler<Real.Compiler>>>,
];

// services built against the aspects' types are used in envs written against the contract.
export type ServicesToContract = [
  Assert<IsAssignable<Real.EnvHandler<Real.Compiler>, Contract.EnvHandler<Contract.Compiler>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.Tester>, Contract.EnvHandler<Contract.Tester>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.Linter>, Contract.EnvHandler<Contract.Linter>>>,
  Assert<IsAssignable<Real.EnvHandler<Real.Preview>, Contract.EnvHandler<Contract.Preview>>>,
];

describe('envs contracts', () => {
  it('should export the runtime values', async () => {
    const contract = await import('./index');
    expect(contract.CAPSULE_ARTIFACTS_DIR).to.equal('artifacts');
    expect(contract.Pipeline.from([]).tasks).to.deep.equal([]);
  });
});
