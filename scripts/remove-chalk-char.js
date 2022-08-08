const fs = require('fs');

const filePath = process.argv[2];
const file = fs.readFileSync(filePath, 'utf8');
const fileWithoutChalk = file.replace(/\u001b\[(.*?)m/g, '');
fs.writeFileSync(filePath, fileWithoutChalk);
console.log('Removed chalk characters from file: ' + filePath);
