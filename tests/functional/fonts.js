/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'intern',
  'intern!object',
  'intern/chai!assert',
  'require'
], function (intern, registerSuite, assert, require) {
  'use strict';

  var url = intern.config.fxaContentRoot + 'signin';
  var nonFiraUrl = intern.config.fxaContentRoot + 'zh-CN/legal/privacy';

  registerSuite({
    name: 'fonts',

    setup: function () {
    },

    'Uses Fira for en-US': function () {

      return this.get('remote')
        .get(require.toUrl(url))
        .waitForElementById('fxa-signin-header')

        .elementByCssSelector('#fxa-signin-header')
          .getComputedCss('font-family')
          .then(function (value) {
            assert.ok(value.indexOf('Fira Sans') > -1);
          })
        .end()

        .elementByCssSelector('body')
          .getComputedCss('font-family')
          .then(function (value) {
            assert.ok(value.indexOf('Clear Sans') > -1);
          })
        .end();
    },

    'Does not use Fira for non-supported locale': function () {

      return this.get('remote')
        .get(require.toUrl(nonFiraUrl))
        .waitForElementById('fxa-pp-header')

        .elementByCssSelector('#fxa-pp-header')
          .getComputedCss('font-family')
          .then(function (value) {
            assert.ok(value.indexOf('Fira Sans') === -1);
          })
        .end()

        .elementByCssSelector('body')
          .getComputedCss('font-family')
          .then(function (value) {
            assert.ok(value.indexOf('Clear Sans') === -1);
          })
        .end();
    }
  });
});