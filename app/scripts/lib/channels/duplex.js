/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

/**
 * A two way channel. Messages can be sent and received. The channel requires
 * both a sender and a receiver. A sender and a receiver are the concrete
 * strategies used to send and receive messages. The decoupling of the two allows
 * a channel to e.g., send messages via a CustomEvent and receive messages via
 * a postMessage (Fx Desktop Sync v1 communicates this way).
 */

define([
  'underscore',
  'lib/promise',
  'lib/channels/base'
], function (_, p, BaseChannel) {
  var DEFAULT_SEND_TIMEOUT_LENGTH_MS = 90 * 1000;

  function RequestsAwaitingResponses(options) {
    this._window = options.window;
    this._sendTimeoutLength = options.sendTimeoutLength || DEFAULT_SEND_TIMEOUT_LENGTH_MS;
    this._requests = {};
  }
  RequestsAwaitingResponses.prototype = {
    add: function (messageId, request) {
      request.timeout = this._window.setTimeout(function (command) {
        this._window.console.error('Response not received for: ' + command);
      }.bind(this, request.command), this._sendTimeoutLength);

      this._requests[messageId] = request;
    },

    remove: function (messageId) {
      var outstanding = this.get(messageId);
      if (outstanding) {
        this._window.clearTimeout(outstanding.timeout);
        delete this._requests[outstanding.messageId];
      }
    },

    get: function (messageId) {
      return this._requests[messageId];
    },

    clear: function () {
      for (var messageId in this._requests) {
        this.remove(this._requests[messageId]);
      }
    }
  };

  function DuplexChannel() {
  }

  _.extend(DuplexChannel.prototype, new BaseChannel(), {
    init: function (options) {
      this._sender = options.sender;
      this._receiver = options.receiver;
      this._receiver.on('message', this.onMessageReceived.bind(this));

      this._awaitingResponses = new RequestsAwaitingResponses({
        window: options.window,
        sendTimeoutLength: options.sendTimeoutLength
      });
    },

    teardown: function () {
      this._awaitingResponses.clear();
      this._sender.teardown();
      this._receiver.teardown();
    },

    /**
     * Send a message, do not expect a response.
     */
    send: function (command, data) {
      var self = this;
      return p()
        .then(function () {
          self._sender.send(command, data, null);
        });
    },

    /**
     * Send a message, expect a response.
     */
    request: function (command, data) {
      var self = this;

      var messageId = Date.now();
      var outstanding = {
        deferred: p.defer(),
        command: command,
        data: data,
        messageId: messageId
      };

      // save the data beforehand in case the response is synchronous.
      self._awaitingResponses.add(messageId, outstanding);

      return p()
        .then(function () {
          return self._sender.send(command, data, messageId);
        })
        .then(function () {
          return outstanding.deferred.promise;
        })
        .fail(function (err) {
          // there was a problem sending.
          self._awaitingResponses.remove(messageId);
          throw err;
        });
    },

    onMessageReceived: function (messageData) {
      var self = this;
      var data = messageData.data;
      var messageId = messageData.messageId;

      // A message is not necessarily in response to a sent request.
      // If the message is in response to a request, then it should
      // have a messageId.
      var outstanding = self._awaitingResponses.get(messageId);
      if (outstanding) {
        self._awaitingResponses.remove(messageId);
        outstanding.deferred.resolve(data);
      }

      // Even if the message is not in response to a request, trigger an
      // event for any listeners that are waiting for it.
      var command = messageData.command;
      this.trigger(command, data);
    }
  });

  return DuplexChannel;
});
