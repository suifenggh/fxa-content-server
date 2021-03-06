/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'cocktail',
  'lib/xhr',
  'views/base',
  'stache!templates/tos',
  'lib/auth-errors',
  'views/mixins/back-mixin'
],
function (Cocktail, xhr, BaseView, Template, AuthErrors, BackMixin) {
  var View = BaseView.extend({
    template: Template,
    className: 'tos',

    afterRender: function () {
      var self = this;
      return xhr.ajax({
        url: '/legal/terms',
        accepts: {
          text: 'text/partial'
        },
        dataType: 'text'
      })
      .then(function (template) {
        self.$('#legal-copy').html(template);
        self.$('.hidden').removeClass('hidden');
      })
      .fail(function () {
        var err = AuthErrors.toError('COULD_NOT_GET_TOS');
        self.displayError(err);
        self.$('.hidden').removeClass('hidden');
      });
    },

    events: {
      'click #fxa-tos-back': 'back',
      'keyup #fxa-tos-back': 'backOnEnter'
    }
  });

  Cocktail.mixin(
    View,
    BackMixin
  );

  return View;
});

