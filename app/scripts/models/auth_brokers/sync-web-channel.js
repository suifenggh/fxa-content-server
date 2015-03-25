/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A broker that knows how to communicate with Firefox when used for Sync.
 */

'use strict';

define([
  'underscore',
  'models/auth_brokers/base',
  'lib/promise',
  'lib/auth-errors',
  'lib/constants',
  'lib/channels/duplex',
  'lib/channels/senders/web-channel',
  'lib/channels/receivers/web-channel'
], function (_, BaseAuthenticationBroker, p, AuthErrors, Constants,
        DuplexChannel, WebChannelSender, WebChannelReceiver) {

  var SyncWebChannelAuthenticationBroker = BaseAuthenticationBroker.extend({
    initialize: function (options) {
      options = options || {};

      this.window = options.window || window;

      // relierChannel can be passed in for testing.
      this._relierChannel = options.relierChannel || this.createRelierChannel();

      return BaseAuthenticationBroker.prototype.initialize.call(
          this, options);
    },

    afterLoaded: function () {
      return this._relierChannel.send('loaded');
    },

    beforeSignIn: function (email) {
      var self = this;
      // This will send a message over the channel to determine whether
      // we should cancel the login to sync or not based on Desktop
      // specific checks and dialogs. It throws an error with
      // message='USER_CANCELED_LOGIN' and errno=1001 if that's the case.
      return self._relierChannel.request('fxaccounts:can_link_account', { email: email })
        .then(function (response) {
          if (response && response.data && ! response.data.ok) {
            throw AuthErrors.toError('USER_CANCELED_LOGIN');
          }

          self._verifiedCanLinkAccount = true;
        }, function (err) {
          console.error('beforeSignIn failed with', err);
          // If the browser doesn't implement this command, then it will
          // handle prompting the relink warning after sign in completes.
          // This can likely be changed to 'reject' after Fx31 hits nightly,
          // because all browsers will likely support 'can_link_account'
        });
    },

    afterSignIn: function (account) {
      return this._notifyRelierOfLogin(account);
    },

    beforeSignUpConfirmationPoll: function (account) {
      // The Sync broker notifies the browser of an unverified login
      // before the user has verified her email. This allows the user
      // to close the original tab and have Sync still successfully start.
      return this._notifyRelierOfLogin(account);
    },

    afterResetPasswordConfirmationPoll: function (account) {
      return this._notifyRelierOfLogin(account);
    },

    createRelierChannel: function () {
      var webChannelId = Constants.SYNC_WEBCHANNEL_ID;
      var sender = new WebChannelSender();
      sender.init({
        window: this.window,
        webChannelId: webChannelId
      });

      var receiver = new WebChannelReceiver();
      receiver.init({
        window: this.window,
        webChannelId: webChannelId
      });

      var channel = new DuplexChannel();
      channel.init({
        window: this.window,
        sender: sender,
        receiver: receiver
      });

      return channel;
    },

    _notifyRelierOfLogin: function (account) {
      return this._relierChannel.send(
          'fxaccounts:login', this._getLoginData(account));
    },

    _getLoginData: function (account) {
      var ALLOWED_FIELDS = [
        'email',
        'uid',
        'sessionToken',
        'sessionTokenContext',
        'unwrapBKey',
        'keyFetchToken',
        'customizeSync',
        'verified'
      ];

      var loginData = {};
      _.each(ALLOWED_FIELDS, function (field) {
        loginData[field] = account.get(field);
      });

      loginData.verified = !! loginData.verified;
      loginData.verifiedCanLinkAccount = !! this._verifiedCanLinkAccount;
      return loginData;
    }
  });

  return SyncWebChannelAuthenticationBroker;
});

