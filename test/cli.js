'use strict'

var rimraf = require('rimraf')
var access = require('./helpers/access')
var spawn = require('./helpers/spawn')

describe('cli', function () {
  this.timeout(30000)

  describe('with an app with asar', function (test) {
    var dest = 'test/fixtures/out/foo/'

    before(function (done) {
      spawn('./src/cli.js', [
        '--src', 'test/fixtures/app-with-asar/',
        '--dest', dest,
        '--arch', 'ia32'
      ], done)
    })

    after(function (done) {
      rimraf(dest, done)
    })

    it('generates a `.flatpak` package', function (done) {
      access(dest + 'io.atom.electron.footest_master_ia32.flatpak', done)
    })
  })

  describe('with an app without asar', function (test) {
    var dest = 'test/fixtures/out/bar/'

    before(function (done) {
      spawn('node src/cli.js', [
        '--src', 'test/fixtures/app-without-asar/',
        '--dest', dest,
        '--arch', 'x64'
      ], done)
    })

    it('generates a `.flatpak` package', function (done) {
      access(dest + 'com.foo.bartest_master_x64.flatpak', done)
    })
  })
})
