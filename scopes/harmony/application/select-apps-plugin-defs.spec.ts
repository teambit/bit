import { expect } from 'chai';
import type { PluginDefinition } from '@teambit/aspect-loader';
import type { PluginDefsByAspectId } from './select-apps-plugin-defs';
import { selectAppsPluginDefs } from './select-apps-plugin-defs';

function pluginDef(pattern: string): PluginDefinition {
  return { pattern, runtimes: ['main'], register: () => {} } as unknown as PluginDefinition;
}

const APP_TYPE_PATTERN = '*.my-app-type.*';
const OTHER_APP_TYPE_PATTERN = '*.other-app-type.*';
const LANE_SNAP_ASPECT_ID = 'my-scope/app-type-aspect@abcd1234';
const RELEASED_ASPECT_ID = 'my-scope/app-type-aspect@0.0.243';

describe('selectAppsPluginDefs', () => {
  it('should return the def when a single aspect registered the pattern', () => {
    const def = pluginDef(APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [[LANE_SNAP_ASPECT_ID, [def]]];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN], [LANE_SNAP_ASPECT_ID]);
    expect(result).to.deep.equal([def]);
  });
  it('should filter out defs whose pattern is not an app-type pattern', () => {
    const appDef = pluginDef(APP_TYPE_PATTERN);
    const nonAppDef = pluginDef('*.some-other-plugin.*');
    const defsByAspectId: PluginDefsByAspectId = [[LANE_SNAP_ASPECT_ID, [appDef, nonAppDef]]];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN], []);
    expect(result).to.deep.equal([appDef]);
  });
  it('should return one def per pattern when two versions of the same aspect registered it', () => {
    const fromLaneSnap = pluginDef(APP_TYPE_PATTERN);
    const fromReleased = pluginDef(APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [
      [LANE_SNAP_ASPECT_ID, [fromLaneSnap]],
      [RELEASED_ASPECT_ID, [fromReleased]],
    ];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN], [LANE_SNAP_ASPECT_ID]);
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.equal(fromLaneSnap);
  });
  it('should prefer the version used by the component even when it was registered last', () => {
    const fromReleased = pluginDef(APP_TYPE_PATTERN);
    const fromLaneSnap = pluginDef(APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [
      [RELEASED_ASPECT_ID, [fromReleased]],
      [LANE_SNAP_ASPECT_ID, [fromLaneSnap]],
    ];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN], [LANE_SNAP_ASPECT_ID]);
    expect(result[0]).to.equal(fromLaneSnap);
  });
  it('should fallback to the first registered def when no version is in the component aspect-list', () => {
    const fromLaneSnap = pluginDef(APP_TYPE_PATTERN);
    const fromReleased = pluginDef(APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [
      [LANE_SNAP_ASPECT_ID, [fromLaneSnap]],
      [RELEASED_ASPECT_ID, [fromReleased]],
    ];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN], ['my-scope/unrelated@1.0.0']);
    expect(result[0]).to.equal(fromLaneSnap);
  });
  it('should keep defs of different patterns', () => {
    const appDef = pluginDef(APP_TYPE_PATTERN);
    const otherAppDef = pluginDef(OTHER_APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [
      [LANE_SNAP_ASPECT_ID, [appDef]],
      ['my-scope/another-aspect@1.0.0', [otherAppDef]],
    ];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN, OTHER_APP_TYPE_PATTERN], []);
    expect(result).to.have.lengthOf(2);
  });
  it('should keep all defs of the selected aspect-version when it registered the pattern more than once', () => {
    const first = pluginDef(APP_TYPE_PATTERN);
    const second = pluginDef(APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [[LANE_SNAP_ASPECT_ID, [first, second]]];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN], [LANE_SNAP_ASPECT_ID]);
    expect(result).to.deep.equal([first, second]);
  });
  it('should keep defs of different aspects that share the same pattern', () => {
    const fromOneAspect = pluginDef(APP_TYPE_PATTERN);
    const fromAnotherAspect = pluginDef(APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [
      [LANE_SNAP_ASPECT_ID, [fromOneAspect]],
      ['my-scope/another-aspect@1.0.0', [fromAnotherAspect]],
    ];
    const result = selectAppsPluginDefs(defsByAspectId, [APP_TYPE_PATTERN], [LANE_SNAP_ASPECT_ID]);
    expect(result).to.deep.equal([fromOneAspect, fromAnotherAspect]);
  });
  it('should keep all defs of an aspect-version that registered several app-types', () => {
    const appDef = pluginDef(APP_TYPE_PATTERN);
    const otherAppDef = pluginDef(OTHER_APP_TYPE_PATTERN);
    const defsByAspectId: PluginDefsByAspectId = [
      [LANE_SNAP_ASPECT_ID, [appDef, otherAppDef]],
      [RELEASED_ASPECT_ID, [pluginDef(APP_TYPE_PATTERN), pluginDef(OTHER_APP_TYPE_PATTERN)]],
    ];
    const result = selectAppsPluginDefs(
      defsByAspectId,
      [APP_TYPE_PATTERN, OTHER_APP_TYPE_PATTERN],
      [LANE_SNAP_ASPECT_ID]
    );
    expect(result).to.deep.equal([appDef, otherAppDef]);
  });
});
