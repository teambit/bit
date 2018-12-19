// @flow
import R from 'ramda';
import packageNameValidate from 'validate-npm-package-name';
import validateType from '../utils/validate-type';
import { BitId, BitIds } from '../bit-id';
import VersionInvalid from './exceptions/version-invalid';
import { isValidPath } from '../utils';
import type Version from './models/version';
import { Dependencies } from '../consumer/component/dependencies';

/**
 * make sure a Version instance is correct. throw an exceptions if it is not.
 */
export default function validateVersionInstance(version: Version): void {
  const message = 'unable to save Version object';
  const validateBitIdStr = (bitIdStr: string, field: string, validateVersion: boolean = true) => {
    validateType(message, bitIdStr, field, 'string');
    let bitId;
    try {
      bitId = BitId.parse(bitIdStr, true);
    } catch (err) {
      throw new VersionInvalid(`${message}, the ${field} has an invalid Bit id`);
    }
    if (validateVersion && !bitId.hasVersion()) {
      throw new VersionInvalid(`${message}, the ${field} ${bitIdStr} does not have a version`);
    }
    if (!bitId.scope) throw new VersionInvalid(`${message}, the ${field} ${bitIdStr} does not have a scope`);
  };
  const _validateEnv = (env) => {
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
      env.files.forEach((file) => {
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
  const _validatePackageDependencies = (packageDependencies) => {
    validateType(message, packageDependencies, 'packageDependencies', 'object');
    R.forEachObjIndexed(_validatePackageDependency, packageDependencies);
  };
  const validateFile = (file, isDist: boolean = false) => {
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

  if (!version.mainFile) throw new VersionInvalid(`${message}, the mainFile is missing`);
  if (!isValidPath(version.mainFile)) {
    throw new VersionInvalid(`${message}, the mainFile ${version.mainFile} is invalid`);
  }
  if (!version.files || !version.files.length) throw new VersionInvalid(`${message}, the files are missing`);
  let foundMainFile = false;
  validateType(message, version.files, 'files', 'array');
  const filesPaths = [];
  version.files.forEach((file) => {
    validateFile(file);
    filesPaths.push(file.relativePath);
    if (file.relativePath === version.mainFile) foundMainFile = true;
  });
  if (!foundMainFile) {
    throw new VersionInvalid(`${message}, unable to find the mainFile ${version.mainFile} in the files list`);
  }
  if (version.detachedCompiler !== undefined) {
    validateType(message, version.detachedCompiler, 'detachedCompiler', 'boolean');
  }
  if (version.detachedTester !== undefined) {
    validateType(message, version.detachedTester, 'detachedCompiler', 'boolean');
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
  _validatePackageDependencies(version.compilerPackageDependencies);
  _validatePackageDependencies(version.testerPackageDependencies);
  if (version.dists && version.dists.length) {
    validateType(message, version.dists, 'dist', 'array');
    // $FlowFixMe
    version.dists.forEach((file) => {
      validateFile(file, true);
    });
  }
  const dependenciesInstances = ['dependencies', 'devDependencies', 'compilerDependencies', 'testerDependencies'];
  dependenciesInstances.forEach((dependenciesType) => {
    // $FlowFixMe
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
    dependencies.forEach((dependency) => {
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
  if (!version.log) throw new VersionInvalid(`${message}, the log object is missing`);
  validateType(message, version.log, 'log', 'object');
  if (version.bindingPrefix) {
    validateType(message, version.bindingPrefix, 'bindingPrefix', 'string');
  }
}
