const fs = require('fs');
const path = require('path');
const postInstallScriptName = 'bitBindings.js';
const createTemplate = require('./postInstallTemplate');

type LinkProps = {
  packagePath: string,
  packageName: string,
};
class LinkData {
  packagePath: string;
  packageName: string;

  constructor( { packagePath, packageName }: LinkProps, domainPrefix: string) {
    this.packagePath = packagePath;
    this.packageName = domainPrefix + '/' + packageName.replace(/\//g, '.');
  }
}

export default function generatePostInstallScript(writeDir: string, LinkProps: Array<Object>, domainPrefix: string) {
  const LinkArr = LinkProps.map(linkObj => new LinkData(linkObj, domainPrefix));
  fs.writeFileSync(path.join(writeDir, postInstallScriptName), createTemplate(JSON.stringify(LinkArr)));
  return { postinstall : `node ${postInstallScriptName}` };
}
