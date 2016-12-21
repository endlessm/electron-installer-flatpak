'use strict'

var installer = require('..')

var rimraf = require('rimraf')
var access = require('./helpers/access')

describe('module', function () {
  this.timeout(30000)

  describe('with an app with asar', function (test) {
    var dest = 'test/fixtures/out/foo/bar/'

    before(function (done) {
      installer({
        src: 'test/fixtures/app-with-asar/',
        dest: dest,

        options: {
          arch: 'ia32'
        }
      }, done)
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
      installer({
        src: 'test/fixtures/app-without-asar/',
        dest: dest,

        options: {
          icon: {
            '1024x1024': 'test/fixtures/icon.png'
          },
          bin: 'resources/cli/bar.sh',
          section: 'devel',
          priority: 'optional',
          arch: 'x64'
        }
      }, done)
    })

    after(function (done) {
      rimraf(dest, done)
    })

    it('generates a `.flatpak` package', function (done) {
      access(dest + 'com.foo.bartest_master_x64.flatpak', done)
    })
  })
})
