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
    init: function (options) {
      options = options || {};

      this._window = options.window;
      this._window.addEventListener('WebChannelMessageToContent', this.receiveMessage.bind(this), true);
      this._webChannelId = options.webChannelId;
    },

    receiveMessage: function (event) {
      var detail = event.detail;

      if (! (detail && detail.id && detail.message)) {
        // malformed message
        this._window.console.error('malformed WebChannelMessageToContent event');
        return;
      }

      if (detail.id !== this._webChannelId) {
        // not from the expected WebChannel, silently ignore.
        return;
      }

      var parsed = detail.message;
      if (parsed) {
        this.trigger('message', parsed);
      }
    },
    teardown: function () {}
  });

  return WebChannelReceiver;
});

