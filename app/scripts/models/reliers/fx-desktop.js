/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The FxDesktop for Sync relier. In addition to the fields available on
 * `Relier`, provides the following:
 *
 * - context
 * - entrypoint
 */

'use strict';

define([
  'underscore',
  'models/reliers/relier',
  'lib/service-name',
  'lib/constants'
], function (_, Relier, ServiceNameTranslator, Constants) {

  var FxDesktopRelier = Relier.extend({
    defaults: _.extend({}, Relier.prototype.defaults, {
      campaign: null,
      // hard code the desktop context. The context is decided in app-start
      // and decoupled from the context query parameter. For example,
      // both service=sync&context=fx_desktop_v1 and
      // service=sync&context=iframe both use the FxDesktopRelier, and
      // the relier for both need context=fx_desktop_v1
      context: Constants.FX_DESKTOP_CONTEXT,
      entrypoint: null,
      migration: null
    }),

    initialize: function (options) {
      options = options || {};

      this._translator = options.translator;

      Relier.prototype.initialize.call(this, options);
    },

    fetch: function () {
      var self = this;
      return Relier.prototype.fetch.call(self)
        .then(function () {
          self.importSearchParam('entrypoint');
          self.importSearchParam('campaign');
          self.importSearchParam('migration');
          try {
            self.importBooleanSearchParam('customizeSync');
          } catch (e) {
            // ignore it for now.
            // TODO - handle the error whenever startup error handling is
            // complete - see #1982. This includes logging the error.
            // Use something like:
            // var err  = AuthErrors.toError('INVALID_PARAMETER')
            // err.param = 'customizeSync';
            // throw err;
          }

          self._setupServiceName();
        });
    },

    isFxDesktop: function () {
      return true;
    },

    /**
     * Desktop clients will always want keys so they can sync.
     */
    wantsKeys: function () {
      return true;
    },

    _setupServiceName: function () {
      var service = this.get('service');
      if (service) {
        var serviceNameTranslator = new ServiceNameTranslator(this._translator);
        var serviceName = serviceNameTranslator.get(service);
        this.set('serviceName', serviceName);
      }
    },

    /**
     * Check if the relier wants to force the customize sync checkbox on
     */
    isCustomizeSyncChecked: function () {
      return !!(this.isSync() && this.get('customizeSync'));
    }
  });

  return FxDesktopRelier;
});
