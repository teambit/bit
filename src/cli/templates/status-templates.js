/** @flow */

function format(component: string | Component, showVersions: boolean = false): string {
  const missing = componentsWithMissingDeps.find((missingComp: Component) => {
    const compId = component.id ? component.id.toString() : component;
    return missingComp.id.toString() === compId;
  });
}

export function formatNew(newComps) {
  console.log(newComps);
}

export function formatModified() {}

export function formatStaged() {}

export function formatDeleted() {}

export function formatAutotagged() {}
