const fs = require('fs');
const path = require('path');
const postInstallScriptName = 'bitBindings.js';

type LinkProps = {
  packagePath: string,
  indexName: string,
  fileContent: string
};
class LinkData {
  packagePath: string;
  indexName: string;
  fileContent: string;

  constructor( { packagePath, indexName, fileContent }: LinkProps) {
    this.packagePath = packagePath;
    this.indexName = indexName;
    this.fileContent = fileContent;
  }
}
const scriptTemplate = (data) => `const fs = require('fs');
const path = require('path');
const arr = ${data}
function mkdirp(filepath) {
    var dirname = path.dirname(filepath);
    if (!fs.existsSync(dirname)) {
        mkdirp(dirname);
    }
    fs.mkdirSync(filepath);
} 
arr.forEach(LinkProps => { 
    mkdirp(path.join(__dirname,'node_modules', LinkProps.packagePath));
    const filePath = path.join(__dirname,'node_modules', LinkProps.packagePath, LinkProps.indexName);
        fs.writeFileSync(filePath, LinkProps.fileContent)
})`;

export default function generatePostInstallScript(writeDir: string, LinkProps: Array<Object>) {
  const LinkArr = LinkProps.map(linkObj => new LinkData(linkObj));
  fs.writeFileSync(path.join(writeDir, postInstallScriptName), scriptTemplate(JSON.stringify(LinkArr)));
  return { postinstall : `node ${postInstallScriptName}` };
}
