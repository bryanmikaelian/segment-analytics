import { IntegrationsSettings, InitOptions, SegmentAnalytics } from '../types';

import { Analytics } from '../analytics';
import cookie from '../entity/store/cookie';
import { default as groupEntity } from '../entity/group';
import store from '../entity/store/local';
import memory from '../entity/store/memory';
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
 * Initialize with the given integration `settings` and `options`.
 *
 * Aliased to `init` for convenience.
 * @this {Analytics}
 */
Analytics.prototype.init = Analytics.prototype.initialize = function(
  settings?: IntegrationsSettings,
  options?: InitOptions
): SegmentAnalytics {
  settings = settings || {};
  options = options || {};

  this._options(options);
  this._readied = false;

  // clean unknown integrations from settings
  var self = this;
  Object.keys(settings).forEach(key => {
    var Integration = self.Integrations[key];
    if (!Integration) delete settings[key];
  });

  // add integrations
  Object.keys(settings).forEach(key => {
    const opts = settings[key];
    const name = key;

    // Don't load disabled integrations
    if (options.integrations) {
      if (
        options.integrations[name] === false ||
        (options.integrations.All === false && !options.integrations[name])
      ) {
        return;
      }
    }

    const Integration = self.Integrations[name];
    const clonedOpts = {};
    extend(true, clonedOpts, opts); // deep clone opts
    const integration = new Integration(clonedOpts);
    self.log('initialize %o - %o', name, opts);
    self.add(integration);
  });

  var integrations = this._integrations;

  // load user now that options are set
  this.user.load();
  groupEntity.load();

  // make ready callback
  var readyCallCount = 0;
  var integrationCount = Object.keys(integrations).length;
  var ready = function() {
    readyCallCount++;
    if (readyCallCount >= integrationCount) {
      self._readied = true;
      self.emit('ready');
    }
  };

  // init if no integrations
  if (integrationCount <= 0) {
    ready();
  }

  // initialize integrations, passing ready
  // create a list of any integrations that did not initialize - this will be passed with all events for replay support:
  this.failedInitializations = [];
  let initialPageSkipped = false;
  Object.keys(integrations).forEach(key => {
    const integration = integrations[key];
    if (
      options.initialPageview &&
      integration.options.initialPageview === false
    ) {
      // We've assumed one initial pageview, so make sure we don't count the first page call.
      let page = integration.page;
      integration.page = function() {
        if (initialPageSkipped) {
          return page.apply(this, arguments);
        }
        initialPageSkipped = true;
        return;
      };
    }

    integration.analytics = self;

    integration.once('ready', ready);
    try {
      metrics.increment('analytics_js.integration.invoke', {
        method: 'initialize',
        integration_name: integration.name
      });
      integration.initialize();
    } catch (e) {
      let integrationName = integration.name;
      metrics.increment('analytics_js.integration.invoke.error', {
        method: 'initialize',
        integration_name: integration.name
      });
      self.failedInitializations.push(integrationName);
      self.log('Error initializing %s integration: %o', integrationName, e);
      // Mark integration as ready to prevent blocking of anyone listening to analytics.ready()

      integration.ready();
    }
  });

  // backwards compat with angular plugin and used for init logic checks
  this.initialized = true;

  this.emit('initialize', settings, options);
  return this;
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
 * FIXME: BACKWARDS COMPATIBILITY: convert an old `pageview` to a `page` call.
 * @api private
 */

Analytics.prototype.pageview = function(url: string): SegmentAnalytics {
  const properties: { path?: string } = {};
  if (url) properties.path = url;
  this.page(properties);
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

/*
 * Exports.
 */

export { Analytics, cookie, memory, store, metrics };
