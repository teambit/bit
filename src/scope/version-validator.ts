import R from 'ramda';
import { PJV } from 'package-json-validator';
import packageNameValidate from 'validate-npm-package-name';
import validateType from '../utils/validate-type';
import { BitId, BitIds } from '../bit-id';
import VersionInvalid from './exceptions/version-invalid';
import { isValidPath } from '../utils';
import Version from './models/version';
import { Dependencies } from '../consumer/component/dependencies';
import PackageJsonFile from '../consumer/component/package-json-file';
import { nonPackageJsonFields } from '../consumer/config/consumer-overrides';
import { componentOverridesForbiddenFields } from '../consumer/config/component-overrides';
import { DEPENDENCIES_TYPES } from '../consumer/component/dependencies/dependencies';
import { DEPENDENCIES_FIELDS } from '../constants';
import GeneralError from '../error/general-error';
import { PathLinux } from '../utils/path';
import { ExtensionDataEntry, ExtensionDataList } from '../consumer/config/extension-data';

/**
 * make sure a Version instance is correct. throw an exceptions if it is not.
 */
export default function validateVersionInstance(version: Version): void {
  const message = 'unable to save Version object';
  const validateBitId = (bitId: BitId, field: string, validateVersion = true, validateScope = true) => {
    if (validateVersion && !bitId.hasVersion()) {
      throw new VersionInvalid(`${message}, the ${field} ${bitId.toString()} does not have a version`);
    }
    if (validateScope && !bitId.scope) {
      throw new VersionInvalid(`${message}, the ${field} ${bitId.toString()} does not have a scope`);
    }
  };
  const validateBitIdStr = (bitIdStr: string, field: string, validateVersion = true, validateScope = true) => {
    validateType(message, bitIdStr, field, 'string');
    let bitId;
    try {
      bitId = BitId.parse(bitIdStr, true);
    } catch (err) {
      throw new VersionInvalid(`${message}, the ${field} has an invalid Bit id`);
    }
    validateBitId(bitId, field, validateVersion, validateScope);
  };
  const _validateEnv = env => {
    if (!env) return;
    if (typeof env === 'string') {
      // Do not validate version - for backward compatibility
      validateBitIdStr(env, 'environment-id', false);
      return;
    }
    validateType(message, env, 'env', 'object');
    if (!env.name) {
      throw new VersionInvalid(`${message}, the environment is missing the name attribute`);
    }
    validateBitIdStr(env.name, 'env.name');
    if (env.files) {
      const compilerName = env.name || '';
      env.files.forEach(file => {
        if (!file.name) {
          throw new VersionInvalid(
            `${message}, the environment ${compilerName} has a file which missing the name attribute`
          );
        }
      });
    }
  };

  /**
   * Validate that the package name and version are valid
   * @param {*} packageName
   * @param {*} packageVersion
   */
  const _validatePackageDependency = (packageVersion, packageName) => {
    const packageNameValidateResult = packageNameValidate(packageName);
    if (!packageNameValidateResult.validForNewPackages && !packageNameValidateResult.validForOldPackages) {
      const errors = packageNameValidateResult.errors || [];
      throw new VersionInvalid(`${packageName} is invalid package name, errors:  ${errors.join()}`);
    }
    // don't use semver.valid and semver.validRange to validate the package version because it
    // can be also a URL, Git URL or Github URL. see here: https://docs.npmjs.com/files/package.json#dependencies
    validateType(message, packageVersion, `version of "${packageName}"`, 'string');
  };
  const _validatePackageDependencies = packageDependencies => {
    validateType(message, packageDependencies, 'packageDependencies', 'object');
    R.forEachObjIndexed(_validatePackageDependency, packageDependencies);
  };
  const _validateEnvPackages = (envPackages, fieldName) => {
    validateType(message, envPackages, fieldName, 'object');
    Object.keys(envPackages).forEach(dependencyType => {
      if (!DEPENDENCIES_FIELDS.includes(dependencyType)) {
        throw new VersionInvalid(
          `${message}, the property ${dependencyType} inside ${fieldName} is invalid, allowed values are ${DEPENDENCIES_FIELDS.join(
            ', '
          )}`
        );
      }
      validateType(message, envPackages[dependencyType], `${fieldName}.${dependencyType}`, 'object');
      Object.keys(envPackages[dependencyType]).forEach(pkg => {
        validateType(message, envPackages[dependencyType][pkg], `${fieldName}.${dependencyType}.${pkg}`, 'string');
      });
    });
  };
  const validateFile = (file, isDist = false) => {
    const field = isDist ? 'dist-file' : 'file';
    validateType(message, file, field, 'object');
    if (!isValidPath(file.relativePath)) {
      throw new VersionInvalid(`${message}, the ${field} ${file.relativePath} is invalid`);
    }
    if (!file.name) {
      throw new VersionInvalid(`${message}, the ${field} ${file.relativePath} is missing the name attribute`);
    }
    if (!file.file) throw new VersionInvalid(`${message}, the ${field} ${file.relativePath} is missing the hash`);
    validateType(message, file.name, `${field}.name`, 'string');
    validateType(message, file.file, `${field}.file`, 'object');
    validateType(message, file.file.hash, `${field}.file.hash`, 'string');
  };

  const _validateExtension = (extension: ExtensionDataEntry) => {
    if (extension.extensionId) {
      validateBitId(extension.extensionId, `extensions.${extension.extensionId.toString()}`, true, false);
    }
  };

  const _validateExtensions = (extensions: ExtensionDataList) => {
    if (extensions) {
      extensions.map(_validateExtension);
    }
  };

  if (!version.mainFile) throw new VersionInvalid(`${message}, the mainFile is missing`);
  if (!isValidPath(version.mainFile)) {
    throw new VersionInvalid(`${message}, the mainFile ${version.mainFile} is invalid`);
  }
  if (!version.files || !version.files.length) throw new VersionInvalid(`${message}, the files are missing`);
  let foundMainFile = false;
  validateType(message, version.files, 'files', 'array');
  const filesPaths: PathLinux[] = [];
  version.files.forEach(file => {
    validateFile(file);
    filesPaths.push(file.relativePath);
    if (file.relativePath === version.mainFile) foundMainFile = true;
  });
  if (!foundMainFile) {
    throw new VersionInvalid(
      `${message}, unable to find the mainFile ${version.mainFile} in the following files list: ${filesPaths.join(
        ', '
      )}`
    );
  }
  const duplicateFiles = filesPaths.filter(
    file => filesPaths.filter(f => file.toLowerCase() === f.toLowerCase()).length > 1
  );
  if (duplicateFiles.length) {
    throw new VersionInvalid(`${message} the following files are duplicated ${duplicateFiles.join(', ')}`);
  }
  _validateEnv(version.compiler);
  _validateEnv(version.tester);
  _validatePackageDependencies(version.packageDependencies);
  _validatePackageDependencies(version.devPackageDependencies);
  _validatePackageDependencies(version.peerPackageDependencies);
  _validateEnvPackages(version.compilerPackageDependencies, 'compilerPackageDependencies');
  _validateEnvPackages(version.testerPackageDependencies, 'testerPackageDependencies');
  _validateExtensions(version.extensions);
  if (version.dists && version.dists.length) {
    validateType(message, version.dists, 'dist', 'array');
    version.dists.forEach(file => {
      validateFile(file, true);
    });
  } else if (version.mainDistFile) {
    throw new VersionInvalid(`${message} the mainDistFile cannot be set when the dists are empty`);
  }
  if (version.mainDistFile && !isValidPath(version.mainDistFile)) {
    throw new VersionInvalid(`${message}, the mainDistFile ${version.mainDistFile} is invalid`);
  }
  DEPENDENCIES_TYPES.forEach(dependenciesType => {
    if (!(version[dependenciesType] instanceof Dependencies)) {
      throw new VersionInvalid(
        `${message}, ${dependenciesType} must be an instance of Dependencies, got ${typeof version[dependenciesType]}`
      );
    }
  });
  version.dependencies.validate();
  version.devDependencies.validate();
  version.compilerDependencies.validate();
  version.testerDependencies.validate();
  if (!version.dependencies.isEmpty() && !version.flattenedDependencies.length) {
    throw new VersionInvalid(`${message}, it has dependencies but its flattenedDependencies is empty`);
  }
  if (!version.devDependencies.isEmpty() && !version.flattenedDevDependencies.length) {
    throw new VersionInvalid(`${message}, it has devDependencies but its flattenedDevDependencies is empty`);
  }
  if (!version.compilerDependencies.isEmpty() && !version.flattenedCompilerDependencies.length) {
    throw new VersionInvalid(`${message}, it has compilerDependencies but its flattenedCompilerDependencies is empty`);
  }
  if (!version.testerDependencies.isEmpty() && !version.flattenedTesterDependencies.length) {
    throw new VersionInvalid(`${message}, it has testerDependencies but its flattenedTesterDependencies is empty`);
  }
  const validateFlattenedDependencies = (dependencies: BitIds) => {
    validateType(message, dependencies, 'dependencies', 'array');
    dependencies.forEach(dependency => {
      if (!(dependency instanceof BitId)) {
        throw new VersionInvalid(`${message}, a flattenedDependency expected to be BitId, got ${typeof dependency}`);
      }
      if (!dependency.hasVersion()) {
        throw new VersionInvalid(
          `${message}, the flattenedDependency ${dependency.toString()} does not have a version`
        );
      }
    });
  };
  validateFlattenedDependencies(version.flattenedDependencies);
  validateFlattenedDependencies(version.flattenedDevDependencies);
  validateFlattenedDependencies(version.flattenedCompilerDependencies);
  validateFlattenedDependencies(version.flattenedTesterDependencies);
  const allDependenciesIds = version.getAllDependenciesIds();
  const depsDuplications = allDependenciesIds.findDuplicationsIgnoreVersion();
  if (!R.isEmpty(depsDuplications)) {
    const duplicationStr = Object.keys(depsDuplications)
      .map(id => `"${id}" shows as the following: ${depsDuplications[id].map(depId => depId.toString()).join(', ')} `)
      .join('\n');
    throw new GeneralError(`some dependencies are duplicated, see details below.
if you added a dependency to "overrides" configuration with a plus sign, make sure to add it with a minus sign in the other dependency type
for example, { dependencies: { "bar/foo": "+" }, devDependencies: { "bar/foo": "-" } }

${duplicationStr}`);
    // todo: once decided how to address duplicate dependencies, remove the line above and uncomment the line below
    // throw new VersionInvalid(`${message}, some dependencies are duplicated:\n${duplicationStr}`);
  }
  if (!version.log) throw new VersionInvalid(`${message}, the log object is missing`);
  validateType(message, version.log, 'log', 'object');
  if (version.bindingPrefix) {
    validateType(message, version.bindingPrefix, 'bindingPrefix', 'string');
  }
  const npmSpecs = PJV.getSpecMap('npm');
  const validatePackageJsonField = (fieldName: string, fieldValue: any): string | null | undefined => {
    if (!npmSpecs[fieldName]) {
      // it's not a standard package.json field, can't validate
      return null;
    }
    const validateResult = PJV.validateType(fieldName, npmSpecs[fieldName], fieldValue);
    if (!validateResult.length) return null;
    return validateResult.join(', ');
  };
  const validateOverrides = (fieldValue: Record<string, any>, fieldName: string) => {
    const field = `overrides.${fieldName}`;
    if (DEPENDENCIES_FIELDS.includes(fieldName)) {
      validateType(message, fieldValue, field, 'object');
      Object.keys(fieldValue).forEach(key => {
        validateType(message, key, `property name of ${field}`, 'string');
        validateType(message, fieldValue[key], `version of "${field}.${key}"`, 'string');
      });
    } else if (!nonPackageJsonFields.includes(fieldName)) {
      const result = validatePackageJsonField(fieldName, fieldValue);
      if (result) {
        throw new VersionInvalid(
          `${message}, "${field}" is a package.json field but is not compliant with npm requirements. ${result}`
        );
      }
    }
  };
  Object.keys(version.overrides).forEach(field => {
    if (componentOverridesForbiddenFields.includes(field)) {
      throw new VersionInvalid(`${message}, the "overrides" has a forbidden key "${field}"`);
    }
    validateOverrides(version.overrides[field], field);
  });
  validateType(message, version.packageJsonChangedProps, 'packageJsonChangedProps', 'object');
  const forbiddenPackageJsonProps = PackageJsonFile.propsNonUserChangeable();
  Object.keys(version.packageJsonChangedProps).forEach(prop => {
    validateType(message, prop, 'property name of packageJson', 'string');
    if (forbiddenPackageJsonProps.includes(prop)) {
      throw new VersionInvalid(`${message}, the packageJsonChangedProps should not override the prop ${prop}`);
    }
    const result = validatePackageJsonField(prop, version.packageJsonChangedProps[prop]);
    if (result) {
      throw new VersionInvalid(
        `${message}, the generated package.json field "${prop}" is not compliant with npm requirements. ${result}`
      );
    }
  });
}
