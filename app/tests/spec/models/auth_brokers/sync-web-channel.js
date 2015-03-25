/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'chai',
  'sinon',
  'underscore',
  'models/auth_brokers/sync-web-channel',
  'models/user',
  'lib/constants',
  'lib/auth-errors',
  'lib/channels/null',
  'lib/promise',
  'lib/session',
  '../../../mocks/window'
], function (chai, sinon, _, SyncWebChannelAuthenticationBroker, User,
        Constants, AuthErrors, NullChannel, p, Session, WindowMock) {
  var assert = chai.assert;

  describe('models/auth_brokers/sync-web-channel', function () {
    var windowMock;
    var channelMock;
    var broker;
    var user;
    var account;

    beforeEach(function () {
      windowMock = new WindowMock();
      channelMock = new NullChannel();
      channelMock.request = function () {
        return p();
      };

      user = new User();
      account = user.initAccount({
        email: 'testuser@testuser.com'
      });

      broker = new SyncWebChannelAuthenticationBroker({
        window: windowMock,
        relierChannel: channelMock,
        session: Session
      });
    });

    describe('afterLoaded', function () {
      it('sends a `loaded` message', function () {
        sinon.stub(channelMock, 'send', function () {
          return p();
        });

        return broker.afterLoaded()
          .then(function () {
            assert.isTrue(channelMock.send.calledWith('loaded'));
          });
      });
    });

    describe('beforeSignIn', function () {
      it('is happy if the user clicks `yes`', function () {
        sinon.stub(channelMock, 'request', function () {
          return p({ data: { ok: true }});
        });

        return broker.beforeSignIn('testuser@testuser.com')
          .then(function () {
            assert.isTrue(channelMock.request.calledWith('fxaccounts:can_link_account'));
          });
      });

      it('throws a USER_CANCELED_LOGIN error if user rejects', function () {
        sinon.stub(channelMock, 'request', function () {
          return p({ data: {} });
        });

        return broker.beforeSignIn('testuser@testuser.com')
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'USER_CANCELED_LOGIN'));
            assert.isTrue(channelMock.request.calledWith('fxaccounts:can_link_account'));
          });
      });

      it('swallows errors returned by the browser', function () {
        sinon.stub(channelMock, 'request', function () {
          return p.reject(new Error('uh oh'));
        });

        sinon.spy(console, 'error');

        return broker.beforeSignIn('testuser@testuser.com')
          .then(function () {
            assert.isTrue(console.error.called);
            console.error.restore();
            assert.isTrue(channelMock.request.calledWith('fxaccounts:can_link_account'));
          });
      });
    });

    describe('_notifyRelierOfLogin', function () {
      it('sends a `login` message to the channel', function () {
        sinon.stub(channelMock, 'send', function () {
          return p();
        });

        return broker._notifyRelierOfLogin(account)
          .then(function () {
            assert.isTrue(channelMock.send.calledWith('fxaccounts:login'));
            var data = channelMock.send.args[0][1];
            assert.equal(data.email, 'testuser@testuser.com');
            assert.isFalse(data.verified);
            assert.isFalse(data.verifiedCanLinkAccount);
          });
      });

      it('sends a `login` message to the channel using current account data', function () {
        sinon.stub(channelMock, 'send', function () {
          return p({});
        });

        return broker._notifyRelierOfLogin(account)
          .then(function () {
            assert.isTrue(channelMock.send.calledWith('fxaccounts:login'));
            var data = channelMock.send.args[0][1];
            assert.equal(data.email, 'testuser@testuser.com');
            assert.isFalse(data.verified);
            assert.isFalse(data.verifiedCanLinkAccount);
          });
      });

      it('tells the window not to re-verify if the user can link accounts if the question has already been asked', function () {
        sinon.stub(channelMock, 'request', function () {
          return p({ data: { ok: true }});
        });

        sinon.stub(channelMock, 'send', function () {
          return p();
        });

        return broker.beforeSignIn('testuser@testuser.com')
          .then(function () {
            return broker._notifyRelierOfLogin(account);
          })
          .then(function () {
            assert.isTrue(channelMock.send.calledWith('fxaccounts:login'));
            var data = channelMock.send.args[0][1];
            assert.equal(data.email, 'testuser@testuser.com');
            assert.isFalse(data.verified);
            assert.isTrue(data.verifiedCanLinkAccount);
          });
      });

      it('indicates whether the account is verified', function () {
        // set account as verified
        account.set('verified', true);

        sinon.stub(channelMock, 'request', function () {
          return p({ data: { ok: true }});
        });

        sinon.stub(channelMock, 'send', function () {
          return p();
        });

        return broker.beforeSignIn('testuser@testuser.com')
          .then(function () {
            return broker._notifyRelierOfLogin(account);
          })
          .then(function () {
            var data = channelMock.send.args[0][1];
            assert.isTrue(data.verified);
          });
      });
    });

    describe('afterSignIn', function () {
      it('notifies the channel of login', function () {
        sinon.stub(broker, '_notifyRelierOfLogin', function () {
          return p();
        });

        return broker.afterSignIn(account)
          .then(function () {
            assert.isTrue(broker._notifyRelierOfLogin.calledWith(account));
          });
      });
    });

    describe('beforeSignUpConfirmationPoll', function () {
      it('notifies the channel of login, halts the flow', function () {
        sinon.stub(broker, '_notifyRelierOfLogin', function () {
          return p();
        });

        return broker.beforeSignUpConfirmationPoll(account)
          .then(function () {
            assert.isTrue(broker._notifyRelierOfLogin.calledWith(account));
          });
      });
    });

    describe('afterResetPasswordConfirmationPoll', function () {
      it('notifies the channel of login', function () {
        sinon.stub(broker, '_notifyRelierOfLogin', function () {
          return p();
        });

        return broker.afterResetPasswordConfirmationPoll()
          .then(function () {
            assert.isTrue(broker._notifyRelierOfLogin.called);
          });
      });
    });
  });
});
