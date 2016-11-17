const gulp = require('gulp');
const mocha = require('gulp-mocha');

module.exports = () => gulp
    .src('./specs/**/*.spec.js')
    .pipe(mocha({ reporter: 'nyan' }));
