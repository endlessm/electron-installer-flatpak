'use strict'

var _ = require('lodash')
var asar = require('asar')
var async = require('async')
var debug = require('debug')
var flatpak = require('flatpak-bundler')
var fs = require('fs-extra')
var path = require('path')
var temp = require('temp').track()
var url = require('url')

var pkg = require('../package.json')

var defaultLogger = debug(pkg.name)

var defaultRename = function (dest, src) {
  return path.join(dest, src)
}

var getPixmapPath = function (options) {
  return path.join('/share/pixmaps', options.id + '.png')
}

var sanitizePackageNameParts = function (parts) {
  return parts.map(part =>
    part.replace(/[^a-z0-9]/gi, '_').replace(/^[0-9]/, '_$&'))
}

var getAppId = function (name, website) {
  var host = 'electron.atom.io'
  if (website) {
    var urlObject = url.parse(website)
    if (urlObject.host) host = urlObject.host
  }
  var parts = host.split('.')
  if (parts[0] === 'www') parts.shift()
  parts = sanitizePackageNameParts(parts.reverse())
  parts.push(name)
  var appId = parts.join('.')
  while (appId.length > 255) {
    parts.unshift()
    appId = parts.join('.')
  }
  return appId
}

/**
 * Read `package.json` either from `resources.app.asar` (if the app is packaged)
 * or from `resources/app/package.json` (if it is not).
 */
var readMeta = function (options, callback) {
  var withAsar = path.join(options.src, 'resources/app.asar')
  var withoutAsar = path.join(options.src, 'resources/app/package.json')

  try {
    fs.accessSync(withAsar)
    options.logger('Reading package metadata from ' + withAsar)
    callback(null, JSON.parse(asar.extractFile(withAsar, 'package.json')))
    return
  } catch (err) {
  }

  try {
    options.logger('Reading package metadata from ' + withoutAsar)
    callback(null, fs.readJsonSync(withoutAsar))
  } catch (err) {
    callback(new Error('Error reading package metadata: ' + (err.message || err)))
  }
}

/**
 * Read `LICENSE` from the root of the app.
 */
var readLicense = function (options, callback) {
  var licenseSrc = path.join(options.src, 'LICENSE')
  options.logger('Reading license file from ' + licenseSrc)

  fs.readFile(licenseSrc, callback)
}

/**
 * Get the hash of default options for the installer. Some come from the info
 * read from `package.json`, and some are hardcoded.
 */
var getDefaults = function (data, callback) {
  async.parallel([
    async.apply(readMeta, data)
  ], function (err, results) {
    var pkg = results[0] || {}

    var defaults = {
      id: getAppId(pkg.name, pkg.homepage),
      productName: pkg.productName || pkg.name,
      genericName: pkg.genericName || pkg.productName || pkg.name,
      description: pkg.description,

      branch: 'master',
      arch: undefined,

      base: 'io.atom.electron.BaseApp',
      baseVersion: 'master',
      baseFlatpakref: 'https://s3-us-west-2.amazonaws.com/electron-flatpak.endlessm.com/electron-base-app-master.flatpakref',
      runtime: 'org.freedesktop.Platform',
      runtimeVersion: '1.4',
      runtimeFlatpakref: 'https://raw.githubusercontent.com/endlessm/flatpak-bundler/master/refs/freedesktop-runtime-1.4.flatpakref',
      sdk: 'org.freedesktop.Sdk',
      sdkFlatpakref: 'https://raw.githubusercontent.com/endlessm/flatpak-bundler/master/refs/freedesktop-sdk-1.4.flatpakref',
      finishArgs: [
        // X Rendering
        '--socket=x11', '--share=ipc',
        // Open GL
        '--device=dri',
        // Audio output
        '--socket=pulseaudio',
        // Read/write home directory access
        '--filesystem=home',
        // Chromium uses a socket in tmp for its singleton check
        '--filesystem=/tmp',
        // Allow communication with network
        '--share=network',
        // System notifications with libnotify
        '--talk-name=org.freedesktop.Notifications'
      ],
      modules: [],

      bin: pkg.productName || pkg.name || 'electron',
      icon: path.resolve(__dirname, '../resources/icon.png'),
      files: [],
      symlinks: [],

      categories: [
        'GNOME',
        'GTK',
        'Utility'
      ],

      mimeType: []
    }

    callback(err, defaults)
  })
}

/**
 * Get the hash of options for the installer.
 */
var getOptions = function (data, defaults, callback) {
  // Flatten everything for ease of use.
  var options = _.defaults({}, data, data.options, defaults)

  callback(null, options)
}

/**
 * Fill in a template with the hash of options.
 */
var generateTemplate = function (options, file, callback) {
  options.logger('Generating template from ' + file)

  async.waterfall([
    async.apply(fs.readFile, file),
    function (template, callback) {
      var result = _.template(template)(options)
      options.logger('Generated template from ' + file + '\n' + result)
      callback(null, result)
    }
  ], callback)
}

/**
 * Create the desktop file for the package.
 *
 * See: http://standards.freedesktop.org/desktop-entry-spec/latest/
 */
var createDesktop = function (options, dir, callback) {
  var desktopSrc = path.resolve(__dirname, '../resources/desktop.ejs')
  var desktopDest = path.join(dir, 'share/applications', options.id + '.desktop')
  options.logger('Creating desktop file at ' + desktopDest)

  async.waterfall([
    async.apply(generateTemplate, options, desktopSrc),
    async.apply(fs.outputFile, desktopDest)
  ], function (err) {
    callback(err && new Error('Error creating desktop file: ' + (err.message || err)))
  })
}

/**
 * Create pixmap icon for the package.
 */
var createPixmapIcon = function (options, dir, callback) {
  var iconFile = path.join(dir, getPixmapPath(options))
  options.logger('Creating icon file at ' + iconFile)

  fs.copy(options.icon, iconFile, function (err) {
    callback(err && new Error('Error creating icon file: ' + (err.message || err)))
  })
}

/**
 * Create hicolor icon for the package.
 */
var createHicolorIcon = function (options, dir, callback) {
  async.forEachOf(options.icon, function (icon, resolution, callback) {
    var iconFile = path.join(dir, 'share/icons/hicolor', resolution, 'apps', options.id + '.png')
    options.logger('Creating icon file at ' + iconFile)

    fs.copy(icon, iconFile, callback)
  }, function (err) {
    callback(err && new Error('Error creating icon file: ' + (err.message || err)))
  })
}

/**
 * Create icon for the package.
 */
var createIcon = function (options, dir, callback) {
  if (_.isObject(options.icon)) {
    createHicolorIcon(options, dir, callback)
  } else if (options.icon) {
    createPixmapIcon(options, dir, callback)
  } else {
    callback()
  }
}

/**
 * Create copyright for the package.
 */
var createCopyright = function (options, dir, callback) {
  var copyrightFile = path.join(dir, 'share/doc', options.id, 'copyright')
  options.logger('Creating copyright file at ' + copyrightFile)

  async.waterfall([
    async.apply(readLicense, options),
    async.apply(fs.outputFile, copyrightFile)
  ], function (err) {
    callback(err && new Error('Error creating copyright file: ' + (err.message || err)))
  })
}

/**
 * Copy the application into the package.
 */
var createApplication = function (options, dir, callback) {
  var applicationDir = path.join(dir, 'lib', options.id)
  options.logger('Copying application to ' + applicationDir)

  async.waterfall([
    async.apply(fs.ensureDir, applicationDir),
    async.apply(fs.copy, options.src, applicationDir)
  ], function (err) {
    callback(err && new Error('Error copying application directory: ' + (err.message || err)))
  })
}

/**
 * Create temporary directory where the contents of the package will live.
 */
var createDir = function (options, callback) {
  options.logger('Creating temporary directory')

  async.waterfall([
    async.apply(temp.mkdir, 'electron-'),
    function (dir, callback) {
      dir = path.join(dir, options.id + '_' + options.version + '_' + options.arch)
      fs.ensureDir(dir, callback)
    }
  ], function (err, dir) {
    callback(err && new Error('Error creating temporary directory: ' + (err.message || err)), dir)
  })
}

/**
 * Create the contents of the package.
 */
var createContents = function (options, dir, callback) {
  options.logger('Creating contents of package')

  async.parallel([
    async.apply(createDesktop, options, dir),
    async.apply(createIcon, options, dir),
    async.apply(createCopyright, options, dir),
    async.apply(createApplication, options, dir)
  ], function (err) {
    callback(err, dir)
  })
}

/**
 * Bundle everything using `flatpak-bundler`.
 */
var createBundle = function (options, dir, callback) {
  var name = _.template('<%= id %>_<%= branch %>_<%= arch %>.flatpak')(options)
  var dest = options.rename(options.dest, name)
  options.logger('Creating package at ' + dest)
  var extraExports = []
  if (options.icon && !_.isObject(options.icon)) extraExports.push(getPixmapPath(options))

  var files = [
    [dir, '/']
  ]
  var symlinks = [
    [path.join('/lib', options.id, options.bin), path.join('/bin', options.bin)]
  ]

  flatpak.bundle({
    id: options.id,
    branch: options.branch,
    base: options.base,
    baseVersion: options.baseVersion,
    baseFlatpakref: options.baseFlatpakref,
    runtime: options.runtime,
    runtimeVersion: options.runtimeVersion,
    runtimeFlatpakref: options.runtimeFlatpakref,
    sdk: options.sdk,
    sdkFlatpakref: options.sdkFlatpakref,
    finishArgs: options.finishArgs,
    command: options.bin,
    files: files.concat(options.files),
    symlinks: symlinks.concat(options.symlinks),
    extraExports: extraExports,
    modules: options.modules
  }, {
    arch: options.arch,
    bundlePath: dest
  }, function (err) {
    callback(err, dir)
  })
}

/* ************************************************************************** */

module.exports = function (data, callback) {
  data.rename = data.rename || defaultRename
  data.logger = data.logger || defaultLogger

  async.waterfall([
    async.apply(getDefaults, data),
    async.apply(getOptions, data),
    function (options, callback) {
      data.logger('Creating package with options\n' + JSON.stringify(options, null, 2))
      async.waterfall([
        async.apply(createDir, options),
        async.apply(createContents, options),
        async.apply(createBundle, options)
      ], function (err) {
        callback(err, options)
      })
    }
  ], function (err, options) {
    if (!err) {
      data.logger('Successfully created package at ' + options.dest)
    } else {
      data.logger('Error creating package: ' + (err.message || err))
    }

    callback(err, options)
  })
}
