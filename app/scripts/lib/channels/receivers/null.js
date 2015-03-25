/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'backbone',
  'underscore'
], function (Backbone, _) {

  function WebChannelReceiver() {
    // nothing to do
  }
  _.extend(WebChannelReceiver.prototype, Backbone.Events, {
    init: function () {
    },

    teardown: function () {}
  });

  return WebChannelReceiver;
});

