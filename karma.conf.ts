/* eslint-env node */
'use strict';

// 10 minutes
var TEST_TIMEOUT = 10 * 60 * 1000;

module.exports = function(config) {
  config.set({
    files: [
      { pattern: 'test/support/*.html', included: false },
      'test/**/*.test.ts',
      'lib/**/*.ts',
      'lib/**/*.test.ts'
    ],

    browsers: ['ChromeHeadless'],

    singleRun: true,

    frameworks: ['mocha', 'karma-typescript'],

    reporters: ['spec'],

    preprocessors: {
      '**/*.ts': 'karma-typescript'
    },

    browserNoActivityTimeout: TEST_TIMEOUT,

    client: {
      mocha: {
        grep: process.env.GREP,
        timeout: TEST_TIMEOUT
      }
    },

    specReporter: {
      failFast: true
    },

    karmaTypescriptConfig: {
      bundlerOptions: {
        sourceMap: true
      },
      compilerOptions: {
        sourceMap: true,
        esModuleInterop: true,
        resolveJsonModule: true
      },
      include: ['lib', 'test']
    }
  });
};
