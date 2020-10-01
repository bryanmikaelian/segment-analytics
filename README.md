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

## This Project vs Segment's Official Library

This codebase is not designed to be a drop-in replacement for the [Analytics.js](https://github.com/segmentio/analytics.js) snippet. If there are specific things you are doing with `analytics.js`, it is suggested you continue to use that official snippet.  We will try to maintain parity but realize that things may diverge from `analytics.js`' behavior.

Segment's `analytics.js` library is still the fastest way to get started with Segment and, in most cases, you probably don't need to use this library.  

## Contributing

We welcome all pull requests and bug fixes to the repo.  For major features or changes, we request that you open an issue and use the `RFC` template.  This is similar to how [Rust](https://www.rust-lang.org/governance) operates their roadmap.  

## License

Released under the [MIT license](LICENSE).
