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

  constructor( { packagePath, packageName }: LinkProps) {
    this.packagePath = packagePath;
    this.packageName = packageName.replace(/\//g, '.');
  }
}

export default function generatePostInstallScript(writeDir: string, LinkProps: Array<Object>) {
  const LinkArr = LinkProps.map(linkObj => new LinkData(linkObj));
  fs.writeFileSync(path.join(writeDir, postInstallScriptName), createTemplate(JSON.stringify(LinkArr)));
  return { postinstall : `node ${postInstallScriptName}` };
}
