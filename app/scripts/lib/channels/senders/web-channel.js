/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'lib/promise'
], function (p) {

  function WebChannelSender() {
    // nothing to do here.
  }

  WebChannelSender.prototype = {
    init: function (options) {
      options = options || {};

      this._window = options.window;
      this._webChannelId = options.webChannelId;
    },

    send: function (command, data, messageId) {
      var self = this;
      return p().then(function () {
        var event = createEvent.call(self, command, data, messageId);
        self._window.dispatchEvent(event);
      });
    },
    teardown: function () {}
  };

  function createEvent(command, data, messageId) {
    /*jshint validthis: true*/
    return new this._window.CustomEvent('WebChannelMessageToChrome', {
      detail: {
        id: this._webChannelId,
        message: {
          messageId: messageId,
          command: command,
          data: data
        }
      }
    });
  }

  return WebChannelSender;
});


