const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const runSequence = require('run-sequence');
const gulpsync = require('gulp-sync')(gulp);

const tasksDir = './tasks';

fs.readdirSync(tasksDir).forEach(filename => gulp.task(
  filename.replace(/(\.js)/, ''),
  require(path.join(__dirname, tasksDir, filename))
));

gulp.task('test', gulpsync.sync(['build-tests', 'test-runner']));
gulp.task('default', done => runSequence('lint', 'test', 'clean', 'build', done));
