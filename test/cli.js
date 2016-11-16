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
        '--arch', 'i386'
      ], done)
    })

    after(function (done) {
      rimraf(dest, done)
    })

    it('generates a `.flatpak` package', function (done) {
      access(dest + 'io.atom.electron.footest_master_i386.flatpak', done)
    })
  })

  describe('with an app without asar', function (test) {
    var dest = 'test/fixtures/out/bar/'

    before(function (done) {
      spawn('node src/cli.js', [
        '--src', 'test/fixtures/app-without-asar/',
        '--dest', dest,
        '--arch', 'amd64'
      ], done)
    })

    it('generates a `.flatpak` package', function (done) {
      access(dest + 'com.foo.bartest_master_amd64.flatpak', done)
    })
  })
})
