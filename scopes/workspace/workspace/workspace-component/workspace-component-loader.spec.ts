import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { isRequestedId } from './workspace-component-loader';

/**
 * the predicate decides whether a component is loaded because the caller asked for it, or only
 * because a requested component uses it as an aspect/env. the loader mutes the "env was not loaded"
 * warning for the latter, so a mismatch here either hides a real warning or brings the false one
 * back. it must not be confused with a load group's `seeders` flag, which marks which components
 * are returned to the caller - groups built from extension ids carry `seeders: true` as well.
 */
describe('isRequestedId', () => {
  const requested = (...ids: string[]) =>
    new Set(ids.flatMap((id) => [id, ComponentID.fromString(id).toStringWithoutVersion()]));

  it('should treat an id the caller asked for as requested', () => {
    const ids = requested('some-scope/comps/asked@1.0.0');
    expect(isRequestedId(ComponentID.fromString('some-scope/comps/asked@1.0.0'), ids)).to.be.true;
  });

  it('should treat an id the caller did not ask for as not requested', () => {
    const ids = requested('some-scope/comps/asked@1.0.0');
    expect(isRequestedId(ComponentID.fromString('some-scope/envs/pulled-in@2.0.0'), ids)).to.be.false;
  });

  // the requested ids and the loaded component can disagree on the version, e.g. when the id was
  // given without one. erring towards "requested" keeps the warning rather than muting it.
  it('should treat a different version of a requested id as requested', () => {
    const ids = requested('some-scope/comps/asked@1.0.0');
    expect(isRequestedId(ComponentID.fromString('some-scope/comps/asked@2.0.0'), ids)).to.be.true;
  });

  it('should treat everything as requested when the requested set is unknown', () => {
    expect(isRequestedId(ComponentID.fromString('some-scope/comps/anything@1.0.0'))).to.be.true;
  });
});
