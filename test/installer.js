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
          arch: 'i386'
        }
      }, done)
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
          arch: 'amd64'
        }
      }, done)
    })

    after(function (done) {
      rimraf(dest, done)
    })

    it('generates a `.flatpak` package', function (done) {
      access(dest + 'com.foo.bartest_master_amd64.flatpak', done)
    })
  })
})
