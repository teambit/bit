import * as fs from 'fs';
import { square, diag } from 'lib';
import foo from './bar';
import './my-module.js'; // Import a module for side-effects only
import zip = require('./ZipCodeValidator'); // needed when importing a module using `export =` syntax

console.log(square(11)); // 121
console.log(diag(4, 3)); // 5
