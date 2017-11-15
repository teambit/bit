
module.exports  = function (data) {
  return `
  const fs = require('fs');
const path = require('path');
const NODE_MODULES = 'node_modules';
var _0777 = parseInt('0777', 8);
var tmpdir = require('os').tmpdir();

var isWindows = process.platform === 'win32'
// These can be overridden for testing
var options = {
  isWindows: isWindows,
  canSymlink: testCanSymlink(),
  fs: fs
}

function testCanSymlink () {
  if (isWindows === false) { return true; }

  var canLinkSrc  = path.join(tmpdir, "canLinkSrc.tmp")
  var canLinkDest = path.join(tmpdir, "canLinkDest.tmp")

  try {
    fs.writeFileSync(canLinkSrc, '');
  } catch (e) {
    return false
  }

  try {
    fs.symlinkSync(canLinkSrc, canLinkDest)
  } catch (e) {
    fs.unlinkSync(canLinkSrc)
    return false
  }

  fs.unlinkSync(canLinkSrc)
  fs.unlinkSync(canLinkDest)

  return true
}

function cleanup(path) {
  if (typeof path !== 'string' ) { return }
  return path.replace('/\\/$/','').replace('/\\/\\//g', '/');
}

function symlinkOrCopySync (srcPath, destPath) {
  if (options.isWindows) {
    symlinkWindows(srcPath, destPath)
  } else {
    symlink(srcPath, destPath)
  }
}

Object.defineProperty(module.exports, 'canSymlink', {
  get: function() {
    return !!options.canSymlink;
  }
});

function symlink(_srcPath, _destPath) {
  var srcPath = cleanup(_srcPath);
  var destPath = cleanup(_destPath);

  var lstat = options.fs.lstatSync(srcPath)
  if (lstat.isSymbolicLink()) {

    srcPath = options.fs.realpathSync(srcPath)
  } else if (srcPath[0] !== '/') {

    srcPath = process.cwd() + '/' + srcPath
  }
  options.fs.symlinkSync(srcPath, destPath);
}


var WINDOWS_PREFIX = '\\\\\\\\?\\\\';

function symlinkWindows(srcPath, destPath) {
  var stat = options.fs.lstatSync(srcPath)
  var isDir = stat.isDirectory()
  var wasResolved = false;

  if (stat.isSymbolicLink()) {
    srcPath = options.fs.realpathSync(srcPath);
    isDir = options.fs.lstatSync(srcPath).isDirectory();
    wasResolved = true;
  }

  srcPath = WINDOWS_PREFIX + (wasResolved ? srcPath : path.resolve(srcPath));
  destPath = WINDOWS_PREFIX + path.resolve(path.normalize(destPath));

  if (options.canSymlink) {
    options.fs.symlinkSync(srcPath, destPath, isDir ? 'dir' : 'file');
  } else {
    if (isDir) {
      options.fs.symlinkSync(srcPath, destPath, 'junction');
    } else {
      options.fs.writeFileSync(destPath, options.fs.readFileSync(srcPath), { flag: 'wx', mode: stat.mode })
      options.fs.utimesSync(destPath, stat.atime, stat.mtime)
    }
  }
}


mkdirP = function sync (p, opts, made) {
  if (!opts || typeof opts !== 'object') {
    opts = { mode: opts };
  }

  var mode = opts.mode;
  var xfs = opts.fs || fs;

  if (mode === undefined) {
    mode = _0777 & (~process.umask());
  }
  if (!made) made = null;

  p = path.resolve(p);

  try {
    xfs.mkdirSync(p, mode);
    made = made || p;
  }
  catch (err0) {
    switch (err0.code) {
      case 'ENOENT' :
        made = sync(path.dirname(p), opts, made);
        sync(p, opts, made);
        break;

      // In the case of any other error, just see if there's a dir
      // there already.  If so, then hooray!  If not, then something
      // is borked.
      default:
        var stat;
        try {
          stat = xfs.statSync(p);
        }
        catch (err1) {
          throw err0;
        }
        if (!stat.isDirectory()) throw err0;
        break;
    }
  }

  return made;
};


const componenetsArr = ${data};
  componenetsArr.forEach(component => {
      const packagePath = require.resolve(component.packageName);
      const resolvedPath = [packagePath.substr(0, packagePath.lastIndexOf(NODE_MODULES) + NODE_MODULES.length), component.packageName].join('/');
      const linkFile = [__dirname, NODE_MODULES,component.packagePath].join('/');
      mkdirP(path.dirname(linkFile).split(path.sep).join('/'));
      symlinkOrCopySync(resolvedPath, linkFile);
  })
`
}
