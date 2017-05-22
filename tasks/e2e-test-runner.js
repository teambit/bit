require('babel-core/register');
const gulp = require('gulp');
const mocha = require('gulp-mocha');

module.exports = () => gulp
    .src('./tests/**/*.e2e.js')
    .pipe(mocha({ reporter: 'nyan' }));
