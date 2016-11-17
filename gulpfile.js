const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const runSequence = require('run-sequence');

const tasksDir = './tasks';

fs.readdirSync(tasksDir).forEach(filename => gulp.task(
  filename.replace(/(\.js)/, ''),
  require(path.join(__dirname, tasksDir, filename))
));

gulp.task('default', done => runSequence('lint', 'test', done));
