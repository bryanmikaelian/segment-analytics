# segment-analytics

![NPM](https://img.shields.io/npm/l/segment-analytics?style=flat-square)
![npm](https://img.shields.io/npm/v/segment-analytics?style=flat-square)
![GitHub Workflow Status](https://img.shields.io/github/workflow/status/bryanmikaelian/segment-analytics/ci?style=flat-square)

This is a hard fork of the original library [`segmentio/analytics.js-core`](https://github.com/segmentio/analytics.js-core) which is the main driver behind [`segmentio/analytics.js`](https://github.com/segmentio/analytics.js).

We are primarly focusing on the following items with this hard fork:

- Modernizing the codebase and tooling and focusing on support for modern browsers
- Easy integration with Single Page Application and existing Node build systems.
- Improvements to the bundle size and performance of the library

Long term, there also may be some unique features that will get added.

Check out the [GitHub Project](https://github.com/bryanmikaelian/segment-analytics/projects/1) for the roadmap and the latest state of the project.  This code is to be considered in an alpha state, so use at your own risk till things are more stable.

## What's changed

### Parity with Segment's Analytics.JS

This project offers an almost-parity version with Segment's official `analytics.js` library.  If you are using Analytics.js in your single-page application, you can easily switch to this library.  Please note there are some features that did not get ported over.  Those items are:

- Planning `track` events
- The `trackClick` and `trackSubmit` aliases for `trackLink` and `trackForm`, respectively.
- The `init` alias for `initialize`.
- Specific logic for `jQuery` and `Zepto`
- Cookie-based storage for User and Group traits

As this library evolves over time, we will always respect the [Segment Spec](https://segment.com/docs/connections/spec/) and will avoid introducing breaking changes.  With each major release, you can expect a migration guide as well.

It is expected that TypeScript-based projects might have some compiler errors after switching to this library.  These are accurate and you should update your code accordingly.  A significant amount of time has been invested to accurately portray the types, so you should treat them as truth.

### Client-side Destinations

`analytics.js` will load _all_ client-side destinations and expose each library on `window`.  In this library, we are not doing that.  If you are using any client-side destinations, we recommend you install each each one individually.  See [analytics.js-integrations](https://github.com/segmentio/analytics.js-integrations) for more details

The [Segment](https://github.com/segmentio/analytics.js-integrations/tree/master/integrations/segmentio) destination will be bundled by default.  You do not need to install this package. 

## Getting started

TBD

## Contributing

We welcome all pull requests and bug fixes to the repo.  For major features or changes, we request that you open an issue and use the `RFC` template.  This is similar to how [Rust](https://www.rust-lang.org/governance) operates their roadmap.  

## License

Released under the [MIT license](LICENSE).
