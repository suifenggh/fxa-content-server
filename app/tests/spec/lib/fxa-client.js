/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'chai',
  'jquery',
  'sinon',
  'lib/promise',
  '../../mocks/channel',
  '../../lib/helpers',
  'lib/session',
  'lib/fxa-client',
  'lib/auth-errors',
  'lib/constants',
  'lib/resume-token',
  'models/reliers/oauth'
],
// FxaClientWrapper is the object that is used in
// fxa-content-server views. It wraps FxaClient to
// take care of some app-specific housekeeping.
function (chai, $, sinon, p, ChannelMock, testHelpers, Session,
    FxaClientWrapper, AuthErrors, Constants, ResumeToken, OAuthRelier) {
  'use strict';

  var STATE = 'state';
  var SERVICE = 'sync';
  var REDIRECT_TO = 'https://sync.firefox.com';

  var assert = chai.assert;
  var email;
  var password = 'password';
  var client;
  var realClient;
  var channelMock;
  var relier;
  var expectedResumeToken;

  function trim(str) {
    return str && str.replace(/^\s+|\s+$/g, '');
  }

  describe('lib/fxa-client', function () {
    beforeEach(function () {
      channelMock = new ChannelMock();
      email = ' ' + testHelpers.createEmail() + ' ';
      relier = new OAuthRelier();
      relier.set('state', STATE);
      relier.set('service', SERVICE);
      relier.set('redirectTo', REDIRECT_TO);

      expectedResumeToken = ResumeToken.stringify({ state: STATE });

      Session.set('config', {
        fxaccountUrl: 'http://127.0.0.1:9000'
      });

      client = new FxaClientWrapper({
        channel: channelMock
      });
      return client._getClientAsync()
              .then(function (_realClient) {
                realClient = _realClient;
              });
    });

    afterEach(function () {
      channelMock = null;
    });

    describe('signUp', function () {
      it('signUp signs up a user with email/password', function () {
        sinon.stub(realClient, 'signUp', function () {
          return p({});
        });

        return client.signUp(email, password, relier)
          .then(function () {
            assert.isTrue(realClient.signUp.calledWith(trim(email), password, {
              keys: true,
              service: SERVICE,
              redirectTo: REDIRECT_TO,
              resume: expectedResumeToken
            }));
          });
      });

      it('a throttled signUp returns a THROTTLED error', function () {
        sinon.stub(realClient, 'signUp', function () {
          return p.reject({
            code: 429,
            errno: 114,
            error: 'Too Many Requests',
            message: 'Client has sent too many requests'
          });
        });

        return client.signUp(email, password, relier)
          .then(
            assert.fail,
            function (err) {
              assert.isTrue(AuthErrors.is(err, 'THROTTLED'));
            }
          );
      });

      it('signUp a preverified user using preVerifyToken', function () {
        var preVerifyToken = 'somebiglongtoken';
        relier.set('preVerifyToken', preVerifyToken);

        sinon.stub(realClient, 'signUp', function () {
          return p();
        });

        return client.signUp(email, password, relier, {
          preVerifyToken: preVerifyToken
        })
        .then(function () {
          assert.isTrue(realClient.signUp.calledWith(trim(email), password, {
            preVerifyToken: preVerifyToken,
            keys: true,
            redirectTo: REDIRECT_TO,
            service: SERVICE,
            resume: expectedResumeToken
          }));
        });
      });

      it('signUp a user with an invalid preVerifyToken retries the signup without the token', function () {
        var preVerifyToken = 'somebiglongtoken';
        relier.set('preVerifyToken', preVerifyToken);

        // we are going to take over from here.
        testHelpers.removeFxaClientSpy(realClient);

        var count = 0;
        sinon.stub(realClient, 'signUp', function () {
          count++;
          if (count === 1) {
            assert.isTrue(realClient.signUp.calledWith(trim(email), password, {
              preVerifyToken: preVerifyToken,
              keys: true,
              redirectTo: REDIRECT_TO,
              service: SERVICE,
              resume: expectedResumeToken
            }));

            return p.reject(AuthErrors.toError('INVALID_VERIFICATION_CODE'));
          } else if (count === 2) {
            assert.isTrue(realClient.signUp.calledWith(trim(email), password, {
              keys: true,
              redirectTo: REDIRECT_TO,
              service: SERVICE,
              resume: expectedResumeToken
            }));

            return p(true);
          }
        });

        return client.signUp(email, password, relier)
          .then(function () {
            assert.equal(realClient.signUp.callCount, 2);
          });
      });

      it('sends the `can_link_account` message to check if the user is overwriting browser Sync creds', function () {
        sinon.stub(realClient, 'signUp', function () {
          return p({});
        });

        return client.signUp(email, password, relier)
          .then(function () {
            // check can_link_account was called once
            assert.equal(channelMock.getMessageCount('can_link_account'), 1);
          });
      });

      describe('if users cancels when `can_link_account` message is triggered', function () {
        it('a USER_CANCELED_LOGIN error is thrown', function () {
          // simulate the user rejecting
          channelMock.canLinkAccountOk = false;

          sinon.stub(realClient, 'signUp', function () {
            return p.reject('user cancelled signUp from browser and the auth server\'s signUp should not be called');
          });

          return client.signUp(email, password, relier)
            .then(assert.fail, function (err) {
              assert.isTrue(AuthErrors.is(err, 'USER_CANCELED_LOGIN'));
              // check can_link_account was called once
              assert.equal(channelMock.getMessageCount('can_link_account'), 1);
            });
        });
      });
    });

    describe('signUpResend', function () {
      it('resends the validation email', function () {
        sinon.stub(realClient, 'recoveryEmailResendCode', function () {
          return p();
        });

        return client.signUpResend(relier)
          .then(function () {
            var params = {
              service: SERVICE,
              redirectTo: REDIRECT_TO,
              resume: expectedResumeToken
            };
            assert.isTrue(
                realClient.recoveryEmailResendCode.calledWith(
                    Session.sessionToken,
                    params
                ));
          });
      });

      it('still shows success after max tries', function () {
        sinon.stub(realClient, 'recoveryEmailResendCode', function () {
          return p();
        });
        var triesLeft = Constants.SIGNUP_RESEND_MAX_TRIES;

        // exhaust all tries
        var promises = [];
        for (var i = 0; i < triesLeft; i++) {
          promises.push(client.signUpResend(relier));
        }

        return p.all(promises)
          .then(function () {
            return client.signUpResend(relier);
          })
          .then(function (result) {
            assert.ok(result);
          });
      });
    });

    describe('verifyCode', function () {
      it('can successfully complete', function () {
        sinon.stub(realClient, 'verifyCode', function () {
          return p({});
        });

        return client.verifyCode('uid', 'code')
          .then(function () {
            assert.isTrue(realClient.verifyCode.calledWith('uid', 'code'));
          });
      });

      it('throws any errors', function () {
        sinon.stub(realClient, 'verifyCode', function () {
          return p.reject(AuthErrors.toError('INVALID_VERIFICATION_CODE'));
        });

        return client.verifyCode('uid', 'code')
          .then(assert.fail, function (err) {
            assert.isTrue(realClient.verifyCode.calledWith('uid', 'code'));
            assert.isTrue(AuthErrors.is(err, 'INVALID_VERIFICATION_CODE'));
          });
      });
    });

    describe('signIn', function () {
      it('signin with unknown user should call errorback', function () {
        sinon.stub(realClient, 'signIn', function () {
          return p.reject(AuthErrors.toError('UNKNOWN_ACCOUNT'));
        });

        return client.signIn('unknown@unknown.com', 'password', relier)
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'UNKNOWN_ACCOUNT'));
          });
      });

      it('signs a user in with email/password', function () {
        sinon.stub(realClient, 'signIn', function () {
          return p({});
        });

        return client.signIn(email, password, relier)
          .then(function () {
            assert.isTrue(realClient.signIn.calledWith(trim(email)));
            assert.equal(channelMock.message, 'login');
            assert.isUndefined(channelMock.data.customizeSync);
          });
      });

      it('informs browser of customizeSync option', function () {
        sinon.stub(relier, 'isSync', function () {
          return true;
        });

        sinon.stub(realClient, 'signIn', function () {
          return p({});
        });

        return client.signIn(email, password, relier, {
          customizeSync: true
        })
        .then(function () {
          assert.equal(channelMock.message, 'login');
          assert.isTrue(channelMock.data.customizeSync);
        });
      });

      it('throws errors sent back from channel notification if sync', function () {
        sinon.stub(realClient, 'signIn', function () {
          return p({});
        });

        sinon.stub(client, 'notifyChannelOfLogin', function () {
          return p.reject(AuthErrors.toError('UNEXPECTED_ERROR'));
        });

        sinon.stub(relier, 'isSync', function () {
          return true;
        });

        return client.signIn(email, password, relier)
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'UNEXPECTED_ERROR'));
          });
      });

      it('does not throw errors sent back from channel notification if not sync', function () {
        sinon.stub(realClient, 'signIn', function () {
          return p({});
        });

        sinon.stub(client, 'notifyChannelOfLogin', function () {
          return p.reject(AuthErrors.toError('UNEXPECTED_ERROR'));
        });

        sinon.stub(relier, 'isSync', function () {
          return false;
        });

        return client.signIn(email, password, relier)
          .then(function () {
            assert.isTrue(client.notifyChannelOfLogin.called);
          }, assert.fail);
      });

      describe('signIn with verifiedCanLinkAccount=true option', function () {
        it('sends verifiedCanLinkAccount along with the login message', function ()
 {
          sinon.stub(realClient, 'signIn', function () {
            return p({});
          });

          return client.signIn(email, password, relier, {
            verifiedCanLinkAccount: true
          })
          .then(function () {
            // check that login was the last message sent over the channel
            assert.equal(channelMock.message, 'login');
            // check can_link_account was called zero times
            assert.equal(channelMock.getMessageCount('can_link_account'), 0);
            // and it includes that it has already verified that it is allowed to link
            assert.isTrue(channelMock.data.verifiedCanLinkAccount);
            assert.isTrue(realClient.signIn.calledWith(trim(email)));
          });
        });
      });


      describe('signIn when another user has previously signed in to browser and user accepts', function () {
        it('sends verifiedCanLinkAccount along with the login message', function () {
          sinon.stub(realClient, 'signIn', function () {
            return p({});
          });

          return client.signIn(email, password, relier)
            .then(function () {
              // check that login was the last message sent over the channel
              assert.equal(channelMock.message, 'login');
              // check can_link_account was called once
              assert.equal(channelMock.getMessageCount('can_link_account'), 1);
              // and it includes that it has already verified that it is allowed to link
              assert.isTrue(channelMock.data.verifiedCanLinkAccount);
              assert.isTrue(realClient.signIn.calledWith(trim(email)));
            });
        });
      });

      describe('signIn when another user has previously signed in to browser and user rejects', function () {
        it('throws a USER_CANCELED_LOGIN error', function () {
          sinon.stub(realClient, 'signIn', function () {
            return p({});
          });

          // simulate the user rejecting
          channelMock.canLinkAccountOk = false;
          return client.signIn(email, password, relier)
            .then(function () {
              assert(false, 'should throw USER_CANCELED_LOGIN');
            }, function (err) {
              assert.isTrue(AuthErrors.is(err, 'USER_CANCELED_LOGIN'));
              // check can_link_account was called once
              assert.equal(channelMock.getMessageCount('can_link_account'), 1);
            });
        });
      });
    });

    describe('passwordReset', function () {
      it('requests a password reset', function () {
        sinon.stub(realClient, 'passwordForgotSendCode', function () {
          return p({
            passwordForgotToken: 'token'
          });
        });

        return client.passwordReset(email, relier)
          .then(function () {
            var params = {
              service: SERVICE,
              redirectTo: REDIRECT_TO,
              resume: expectedResumeToken
            };
            assert.isTrue(
                realClient.passwordForgotSendCode.calledWith(
                    trim(email),
                    params
                ));
          });
      });
    });

    describe('passwordResetResend', function () {
      it('resends the validation email', function () {
        sinon.stub(realClient, 'passwordForgotSendCode', function () {
          return p({
            passwordForgotToken: 'token'
          });
        });

        sinon.stub(realClient, 'passwordForgotResendCode', function () {
          return p({});
        });

        return client.passwordReset(email, relier)
          .then(function () {
            return client.passwordResetResend(relier);
          })
          .then(function () {
            var params = {
              service: SERVICE,
              redirectTo: REDIRECT_TO,
              resume: expectedResumeToken
            };
            assert.isTrue(
                realClient.passwordForgotResendCode.calledWith(
                    trim(email),
                    Session.passwordForgotToken,
                    params
                ));
          });
      });

      it('still shows success after max tries', function () {
        sinon.stub(realClient, 'passwordForgotResendCode', function () {
          return p({});
        });

        var triesLeft = Constants.PASSWORD_RESET_RESEND_MAX_TRIES;
        var promises = [];
        // exhaust all tries
        for (var i = 0; i < triesLeft; i++) {
          promises.push(client.passwordResetResend(relier));
        }

        return p.all(promises)
          .then(function () {
            return client.passwordResetResend(relier);
          })
          .then(function (result) {
            assert.ok(result);
          });
      });
    });

    describe('completePasswordReset', function () {
      it('completes the password reset, signs the user in', function () {
        var email = 'testuser@testuser.com';
        var token = 'token';
        var code = 'code';

        sinon.stub(realClient, 'passwordForgotVerifyCode', function () {
          return p({
            accountResetToken: 'reset_token'
          });
        });

        sinon.stub(realClient, 'accountReset', function () {
          return p(true);
        });

        sinon.stub(client, 'signIn', function () {
          return p(true);
        });

        return client.completePasswordReset(email, password, token, code, relier, {
          shouldSignIn: true
        }).then(function () {
          assert.isTrue(realClient.passwordForgotVerifyCode.calledWith(
              code, token));
          assert.isTrue(realClient.accountReset.calledWith(
              email, password));
          assert.isTrue(client.signIn.calledWith(
              email, password));
        });
      });
    });

    describe('signOut', function () {
      it('signs the user out', function () {
        sinon.stub(realClient, 'sessionDestroy', function () {
          return p();
        });

        return client.signOut()
          .then(function () {
            assert.isTrue(realClient.sessionDestroy.called);
          });
      });

      it('resolves to success on XHR failure', function () {
        var count = 0;
        sinon.stub(realClient, 'sessionDestroy', function () {
          count++;
          if (count === 1) {
            return p();
          } else if (count === 2) {
            return p.reject(new Error('no session'));
          }
        });

        return client.signOut()
          .then(function () {
            // user has no session, this will cause an XHR error.
            return client.signOut();
          });
      });
    });

    describe('checkPassword', function () {
      it('returns error if password is incorrect', function () {
        email = trim(email);

        sinon.stub(realClient, 'signIn', function () {
          return p.reject(AuthErrors.toError('INCORRECT_PASSWORD'));
        });

        return client.checkPassword(email, 'badpassword')
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'INCORRECT_PASSWORD'));
          });
      });

      it('succeeds if password is correct', function () {
        email = trim(email);

        sinon.stub(realClient, 'signIn', function () {
          return p({});
        });

        return client.checkPassword(email, password)
          .then(function () {
            assert.isTrue(realClient.signIn.called);
          });
      });
    });

    describe('changePassword', function () {
      it('changes the user\'s password', function () {
        sinon.stub(realClient, 'passwordChange', function () {
          return p();
        });

        sinon.stub(realClient, 'signIn', function () {
          return p({});
        });

        return client.changePassword(email, password, 'new_password', relier)
          .then(function () {
            assert.isTrue(realClient.passwordChange.calledWith(
                    trim(email), password, 'new_password'));
            assert.isTrue(realClient.signIn.calledWith(
                    trim(email), 'new_password'));
            // user is automatically re-authenticated with their new password
            assert.equal(channelMock.message, 'login');
          });
      });
    });

    describe('isPasswordResetComplete', function () {
      it('password status incomplete', function () {
        sinon.stub(realClient, 'passwordForgotStatus', function () {
          return p();
        });

        return client.isPasswordResetComplete('token')
          .then(function (complete) {
            // cache the token so it's not cleared after the password change
            assert.isFalse(complete);
          });
      });

      it('password status complete', function () {
        sinon.stub(realClient, 'passwordForgotStatus', function () {
          return p.reject(AuthErrors.toError('INVALID_TOKEN'));
        });

        return client.isPasswordResetComplete('token')
          .then(function (complete) {
            assert.isTrue(complete);
          });
      });

      it('throws other errors', function () {
        sinon.stub(realClient, 'passwordForgotStatus', function () {
          return p.reject(AuthErrors.toError('UNEXPECTED_ERROR'));
        });

        return client.isPasswordResetComplete('token')
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'UNEXPECTED_ERROR'));
          });
      });
    });

    describe('deleteAccount', function () {
      it('deletes the user\'s account', function () {
        sinon.stub(realClient, 'accountDestroy', function () {
          return p();
        });

        return client.deleteAccount(email, password)
          .then(null, function (err) {
            assert.isTrue(realClient.accountDestroy.calledWith(trim(email)));
            // this test is necessary because errors in deleteAccount
            // should not be propagated to the final done's error
            // handler
            throw new Error('unexpected failure: ' + err.message);
          });
      });
    });

    describe('sessionStatus', function () {
      it('checks sessionStatus', function () {
        sinon.stub(realClient, 'sessionStatus', function () {
          return p();
        });

        return client.sessionStatus('sessiontoken')
          .then(function () {
            assert.isTrue(realClient.sessionStatus.calledWith('sessiontoken'));
          });
      });
    });

    describe('certificateSign', function () {
      it('signs certificate', function () {
        var publicKey = {
          algorithm: 'RS',
          n: '4759385967235610503571494339196749614544606692567785790953934768202714280652973091341' +
             '316862993582789079872007974809511698859885077002492642203267408776123',
          e: '65537'
        };
        var duration = 86400000;

        sinon.stub(realClient, 'certificateSign', function () {
          return p('cert_is_returned');
        });

        return client.certificateSign(publicKey, duration)
          .then(function (cert) {
            assert.ok(cert);
          });
      });
    });

    describe('isSignedIn', function () {
      it('resolves to false if no sessionToken passed in', function () {
        return client.isSignedIn()
            .then(function (isSignedIn) {
              assert.isFalse(isSignedIn);
            });
      });

      it('resolves to false if invalid sessionToken passed in', function () {
        sinon.stub(realClient, 'sessionStatus', function () {
          return p.reject(AuthErrors.toError('INVALID_TOKEN'));
        });

        return client.isSignedIn('not a real token')
            .then(function (isSignedIn) {
              assert.isFalse(isSignedIn);
            });
      });

      it('resolves to true with a valid sessionToken', function () {
        sinon.stub(realClient, 'sessionStatus', function () {
          return p({});
        });

        return client.isSignedIn('token')
          .then(function (isSignedIn) {
            assert.isTrue(isSignedIn);
          });
      });

      it('throws any other errors', function () {
        sinon.stub(realClient, 'sessionStatus', function () {
          return p.reject(AuthErrors.toError('UNEXPECTED_ERROR'));
        });

        return client.isSignedIn('token')
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'UNEXPECTED_ERROR'));
          });
      });
    });

    describe('getRandomBytes', function () {
      it('snags some entropy from somewhere', function () {
        sinon.stub(realClient, 'getRandomBytes', function () {
          return p('some random bytes');
        });

        return client.getRandomBytes()
            .then(function (bytes) {
              assert.ok(bytes);
              assert.isTrue(realClient.getRandomBytes.called);
            });
      });
    });

  });
});

