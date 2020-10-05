import { Analytics } from '../analytics';
import metrics from '../metrics';

/*
 * Module dependencies.
 */

var Facade = require('segmentio-facade');
var DestinationMiddlewareChain = require('../middleware')
  .DestinationMiddlewareChain;
var extend = require('extend');

/**
 * Define a new `SourceMiddleware`
 */

Analytics.prototype.addSourceMiddleware = function(
  middleware: Function
): Analytics {
  this._sourceMiddlewares.add(middleware);
  return this;
};

/**
 * Define a new `IntegrationMiddleware`
 * @this {Analytics}
 * @deprecated
 */

Analytics.prototype.addIntegrationMiddleware = function(
  middleware: Function
): Analytics {
  this._integrationMiddlewares.add(middleware);
  return this;
};

/**
 * Define a new `DestinationMiddleware`
 * Destination Middleware is chained after integration middleware
 * @this {Analytics}
 */

Analytics.prototype.addDestinationMiddleware = function(
  integrationName: string,
  middlewares: Array<unknown>
): Analytics {
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
 * Call `method` with `facade` on all enabled integrations.
 *
 * @param {string} method
 * @param {Facade} facade
 * @return {Analytics}
 * @api private
 * @this {Analytics}
 */
Analytics.prototype._invoke = function(
  method: string,
  facade: unknown
): Analytics {
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
