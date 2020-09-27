'use strict';

import { InitOptions } from './types';
import Entity from './entity';

/*
 * Module dependencies.
 */

var bindAll = require('bind-all');
var debug = require('debug')('analytics:group');
var inherit = require('inherits');

/**
 * Group defaults
 */

Group.defaults = {
  persist: true,
  cookie: {
    key: 'ajs_group_id'
  },
  localStorage: {
    key: 'ajs_group_properties'
  }
};

/**
 * Initialize a new `Group` with `options`.
 */

function Group(options?: InitOptions) {
  this.defaults = Group.defaults;
  this.debug = debug;
  Entity.call(this, options);
}

/**
 * Inherit `Entity`
 */

inherit(Group, Entity);

/**
 * Expose the group singleton.
 */

export default bindAll(new Group());

/**
 * Expose the `Group` constructor.
 */

export { Group };
