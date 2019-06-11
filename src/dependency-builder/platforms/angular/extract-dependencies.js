// @flow
import path from 'path';
import fs from 'fs-extra';
import { ProjectSymbols } from 'ngast';
import R from 'ramda';

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

    const program = path.join(workspaceDir, 'tsconfig.json');
    const defaultErrorReporter = (e, pathStr) => console.error(e, pathStr);
    return new ProjectSymbols(program, resourceResolver, defaultErrorReporter);
  }

  function getDependenciesFromDecorator(): string[] {
    const dependencies = [];
    if (!directive) return dependencies;
    const templateUrl = directive.getNonResolvedMetadata().template.templateUrl;
    const styleUrls = directive.getNonResolvedMetadata().template.styleUrls;
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
    if (!directive) return [];
    // dependencies from templates
    const appSelectors = contextSymbols
      .getDirectives()
      .filter(d => d.isComponent())
      .map(d => d.getNonResolvedMetadata().selector);
    const templateAst = directive.getTemplateAst().templateAst;
    const selectorsFromTemplate = templateAst
      .filter(t => t.name && t.constructor.name === 'ElementAst' && appSelectors.includes(t.name))
      .map(t => t.name);
    const dependenciesFromTemplate = contextSymbols
      .getDirectives()
      .filter(d => selectorsFromTemplate.includes(d.getNonResolvedMetadata().selector))
      .map(d => d.symbol.filePath);
    return dependenciesFromTemplate;
  }
}
