export enum SchemaFeature {
  sharedDir = 'sharedDir',
  individualFiles = 'individualFiles',
  relativePaths = 'relativePaths',
  customModuleResolutions = 'customModuleResolutions',
  fullComponentId = 'fullComponentId', // previously, when component wasn't exported, it used BitId without "scope" prop.
}

export enum SchemaName {
  Legacy = '0.0.0',
  Harmony = '1.0.0',
  Harmony2 = '2.0.0',
}

export const CURRENT_SCHEMA = SchemaName.Harmony2;

const schemas: { [schemaVersion: string]: SchemaFeature[] } = {
  [SchemaName.Legacy]: [
    SchemaFeature.sharedDir,
    SchemaFeature.individualFiles,
    SchemaFeature.relativePaths,
    SchemaFeature.customModuleResolutions,
  ],
  [SchemaName.Harmony]: [],
  [SchemaName.Harmony2]: [SchemaFeature.fullComponentId],
};

export function isSchemaSupport(feature: SchemaFeature, schema: string = SchemaName.Legacy) {
  if (!schemas[schema]) throw new Error(`schemas doesn't include "${schema}"`);
  return schemas[schema].includes(feature);
}

export function throwForNonLegacy(isLegacy: boolean, functionName: string) {
  if (!isLegacy) {
    throw new Error(`${functionName} should not be running on a non-legacy component`);
  }
}
