import { IntegrationsSettings, InitOptions, SegmentAnalytics } from '../types';

import { Analytics } from '../analytics';
import { default as groupEntity } from '../entity/group';
import metrics from '../metrics';

/*
 * Module dependencies.
 */

var Facade = require('segmentio-facade');
var DestinationMiddlewareChain = require('../middleware')
  .DestinationMiddlewareChain;
var extend = require('extend');
var is = require('is');
var isMeta = require('@segment/is-meta');
var on = require('component-event').bind;
var prevent = require('@segment/prevent-default');
var type = require('component-type');

/**
 * Define a new `SourceMiddleware`
 */

Analytics.prototype.addSourceMiddleware = function(
  middleware: Function
): SegmentAnalytics {
  this._sourceMiddlewares.add(middleware);
  return this;
};

/**
 * Define a new `IntegrationMiddleware`
 * @deprecated
 */

Analytics.prototype.addIntegrationMiddleware = function(
  middleware: Function
): SegmentAnalytics {
  this._integrationMiddlewares.add(middleware);
  return this;
};

/**
 * Define a new `DestinationMiddleware`
 * Destination Middleware is chained after integration middleware
 */

Analytics.prototype.addDestinationMiddleware = function(
  integrationName: string,
  middlewares: Array<unknown>
): SegmentAnalytics {
  var self = this;
  middlewares.forEach(function(middleware) {
    if (!self._destinationMiddlewares[integrationName]) {
      self._destinationMiddlewares[
        integrationName
      ] = new DestinationMiddlewareChain();
    }

    self._destinationMiddlewares[integrationName].add(middleware);
  });
  return self;
};

/**
 * Helper method to track an outbound link that would normally navigate away
 * from the page before the analytics calls were sent.
 *
 * BACKWARDS COMPATIBILITY: aliased to `trackClick`.
 *
 * @param {Element|Array} links
 * @param {string|Function} event
 * @param {Object|Function} properties (optional)
 * @return {Analytics}
 */

Analytics.prototype.trackClick = Analytics.prototype.trackLink = function(
  links: Element | Array<Element> | JQuery,
  event: any,
  properties?: any
): SegmentAnalytics {
  let elements: Array<Element> = [];
  if (!links) return this;
  // always arrays, handles jquery
  if (links instanceof Element) {
    elements = [links];
  } else if ('toArray' in links) {
    elements = links.toArray();
  } else {
    elements = links as Array<Element>;
  }

  elements.forEach(el => {
    if (type(el) !== 'element') {
      throw new TypeError('Must pass HTMLElement to `analytics.trackLink`.');
    }
    on(el, 'click', e => {
      const ev = is.fn(event) ? event(el) : event;
      const props = is.fn(properties) ? properties(el) : properties;
      const href =
        el.getAttribute('href') ||
        el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
        el.getAttribute('xlink:href');

      this.track(ev, props);

      // @ts-ignore
      if (href && el.target !== '_blank' && !isMeta(e)) {
        prevent(e);
        this._callback(function() {
          window.location.href = href;
        });
      }
    });
  });

  return this;
};

/**
 * Helper method to track an outbound form that would normally navigate away
 * from the page before the analytics calls were sent.
 *
 * BACKWARDS COMPATIBILITY: aliased to `trackSubmit`.
 *
 * @param {Element|Array} forms
 * @param {string|Function} event
 * @param {Object|Function} properties (optional)
 * @return {Analytics}
 */

Analytics.prototype.trackSubmit = Analytics.prototype.trackForm = function(
  forms: Element | Array<unknown>,
  event: any,
  properties?: any
): SegmentAnalytics {
  if (!forms) return this;
  // always arrays, handles jquery
  if (type(forms) === 'element') forms = [forms];

  const elements = forms as Array<unknown>;

  elements.forEach((el: { submit: () => void }) => {
    if (type(el) !== 'element')
      throw new TypeError('Must pass HTMLElement to `analytics.trackForm`.');
    const handler = e => {
      prevent(e);

      const ev = is.fn(event) ? event(el) : event;
      const props = is.fn(properties) ? properties(el) : properties;
      this.track(ev, props);

      this._callback(function() {
        el.submit();
      });
    };

    // Support the events happening through jQuery or Zepto instead of through
    // the normal DOM API, because `el.submit` doesn't bubble up events...
    var $ = window.jQuery || window.Zepto;
    if ($) {
      $(el).submit(handler);
    } else {
      on(el, 'submit', handler);
    }
  });

  return this;
};

/**
 * Call `method` with `facade` on all enabled integrations.
 *
 * @param {string} method
 * @param {Facade} facade
 * @return {Analytics}
 * @api private
 */
Analytics.prototype._invoke = function(
  method: string,
  facade: unknown
): SegmentAnalytics {
  var self = this;

  try {
    this._sourceMiddlewares.applyMiddlewares(
      extend(true, new Facade({}), facade),
      this._integrations,
      function(result) {
        // A nullified payload should not be sent.
        if (result === null) {
          self.log(
            'Payload with method "%s" was null and dropped by source a middleware.',
            method
          );
          return;
        }

        // Check if the payload is still a Facade. If not, convert it to one.
        if (!(result instanceof Facade)) {
          result = new Facade(result);
        }

        self.emit('invoke', result);
        metrics.increment('analytics_js.invoke', {
          method: method
        });

        applyIntegrationMiddlewares(result);
      }
    );
  } catch (e) {
    metrics.increment('analytics_js.invoke.error', {
      method: method
    });
    self.log(
      'Error invoking .%s method of %s integration: %o',
      method,
      name,
      e
    );
  }

  return this;

  function applyIntegrationMiddlewares(facade) {
    let failedInitializations = self.failedInitializations || [];
    Object.keys(self._integrations).forEach(key => {
      const integration = self._integrations[key];
      const { name } = integration;
      const facadeCopy = extend(true, new Facade({}), facade);

      if (!facadeCopy.enabled(name)) return;
      // Check if an integration failed to initialize.
      // If so, do not process the message as the integration is in an unstable state.
      if (failedInitializations.indexOf(name) >= 0) {
        self.log(
          'Skipping invocation of .%s method of %s integration. Integration failed to initialize properly.',
          method,
          name
        );
      } else {
        try {
          // Apply any integration middlewares that exist, then invoke the integration with the result.
          self._integrationMiddlewares.applyMiddlewares(
            facadeCopy,
            integration.name,
            function(result) {
              // A nullified payload should not be sent to an integration.
              if (result === null) {
                self.log(
                  'Payload to integration "%s" was null and dropped by a middleware.',
                  name
                );
                return;
              }

              // Check if the payload is still a Facade. If not, convert it to one.
              if (!(result instanceof Facade)) {
                result = new Facade(result);
              }

              // apply destination middlewares
              // Apply any integration middlewares that exist, then invoke the integration with the result.
              if (self._destinationMiddlewares[integration.name]) {
                self._destinationMiddlewares[integration.name].applyMiddlewares(
                  facadeCopy,
                  integration.name,
                  function(result) {
                    // A nullified payload should not be sent to an integration.
                    if (result === null) {
                      self.log(
                        'Payload to destination "%s" was null and dropped by a middleware.',
                        name
                      );
                      return;
                    }

                    // Check if the payload is still a Facade. If not, convert it to one.
                    if (!(result instanceof Facade)) {
                      result = new Facade(result);
                    }

                    metrics.increment('analytics_js.integration.invoke', {
                      method: method,
                      integration_name: integration.name
                    });

                    integration.invoke.call(integration, method, result);
                  }
                );
              } else {
                metrics.increment('analytics_js.integration.invoke', {
                  method: method,
                  integration_name: integration.name
                });

                integration.invoke.call(integration, method, result);
              }
            }
          );
        } catch (e) {
          metrics.increment('analytics_js.integration.invoke.error', {
            method: method,
            integration_name: integration.name
          });
          self.log(
            'Error invoking .%s method of %s integration: %o',
            method,
            name,
            e
          );
        }
      }
    });
  }
};
