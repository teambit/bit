const gulp = require('gulp');
const mocha = require('gulp-mocha');

module.exports = () => gulp
    .src('./dist/**/*.spec.js')
    .pipe(mocha({ reporter: 'nyan' }));
