// @flow
import path from 'path';
import fs from 'fs-extra';
import { ProjectSymbols } from 'ngast';
import R from 'ramda';
import parents from 'parents';

const debug = require('debug')('angular');

export default function extractAngularDependencies(workspaceDir: string, fileName: string, existingAst: Object) {
  const contextSymbols = R.isEmpty(existingAst) ? getAst() : existingAst;
  const directive = contextSymbols.getDirectives().find(d => d.symbol.filePath === fileName);
  return {
    angularAst: contextSymbols,
    angularDependencies: [...getDependenciesFromDecorator(), ...getDependenciesFromTemplate()]
  };

  function getAst() {
    const resourceResolver = {
      get(url) {
        return fs.readFile(url, 'utf-8');
      },
      getSync(url) {
        return fs.readFileSync(url, 'utf-8');
      }
    };

    const tsconfigPath = _getTsconfigJsonPath();
    const defaultErrorReporter = (e, pathStr) => console.error(e, pathStr);
    return new ProjectSymbols(tsconfigPath, resourceResolver, defaultErrorReporter);
  }

  function getDependenciesFromDecorator(): string[] {
    const dependencies = [];
    if (!directive) return dependencies;
    const directiveMetadata = directive.getNonResolvedMetadata();
    if (!directiveMetadata.template) return dependencies;
    const templateUrl = directiveMetadata.template.templateUrl;
    const styleUrls = directiveMetadata.template.styleUrls;
    [templateUrl, ...styleUrls].forEach((url) => {
      if (url) {
        // for some reason, the url received is sometimes absolute sometimes relative to the fileName
        const absolutePath = path.isAbsolute(url) ? url : path.join(path.dirname(fileName), url);
        dependencies.push(absolutePath);
      }
    });
    return dependencies;
  }

  function getDependenciesFromTemplate(): string[] {
    const dependencies = [];
    if (!directive) return dependencies;
    const directives = contextSymbols.getDirectives();
    if (!directives) return dependencies;
    // dependencies from templates
    const appSelectors = directives.filter(d => d.isComponent()).map(d => d.getNonResolvedMetadata().selector);
    const templateAst = directive.getTemplateAst().templateAst;
    if (!templateAst) return dependencies;
    const selectorsFromTemplate = templateAst
      .filter(t => t.name && t.constructor.name === 'ElementAst' && appSelectors.includes(t.name))
      .map(t => t.name);
    const dependenciesFromTemplate = contextSymbols
      .getDirectives()
      .filter(d => selectorsFromTemplate.includes(d.getNonResolvedMetadata().selector))
      .map(d => d.symbol.filePath);
    return dependenciesFromTemplate;
  }

  /**
   * propagate from the workspace dir (or component root dir if imported) backwards to find the
   * tsconfig.json file.
   */
  function _getTsconfigJsonPath(): string {
    const parentsDirs = parents(workspaceDir);
    const findPath = (): ?string => {
      for (let i = 0; i < parentsDirs.length; i += 1) {
        const config = `${parentsDirs[i]}/tsconfig.json`;
        try {
          if (fs.lstatSync(config).isFile()) {
            return config;
          }
        } catch (e) {
          // that's fine, try the next directory
        }
      }
      return null;
    };
    const tsConfigPath = findPath();
    if (!tsConfigPath) {
      throw new Error(`failed finding tsconfig.json file starting at "${workspaceDir}" directory`);
    }
    debug(`found tsconfig.json at ${tsConfigPath}`);
    return tsConfigPath;
  }
}
