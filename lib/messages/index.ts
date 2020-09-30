import includes from 'lodash.includes'
import { default as d } from 'debug'
import { v4 as uuid } from 'uuid'
import SparkMD5 from 'spark-md5'

const debug = d('analytics.js:normalize');
const TOP_LEVEL_PROPERTIES = ['integrations', 'anonymousId', 'timestamp', 'context'];

export interface Message {
  options?: {
    [key: string]: unknown
    integrations?: { [key: string]: string };
    providers?: { [key: string]: string | boolean };
    context?: {
      [key: string]: unknown
    };
  }
  [key: string]: unknown
}

export interface NormalizedMessage {
  /**
   * A generated ID for the message.
   */
  messageId: string;

  /**
   * The collection of integrations that will receive this message.
   */
  integrations: {
    [key: string]: string;
  };

  /**
   * Context about this message.
   */
  context: {
    [key: string]: unknown
    page?: {
      [key: string]: unknown
    }
  };

  /**
   * The anonymousId associated with the user.
   */
  anonymousId?: string

  /**
   * Random properties on the message that do not make it in to `context`
   */
  [key: string]: unknown
}

/**
 * Normalize `msg` based on integrations `list`.
 */

export const normalize = (msg: Message, list: Array<string>): NormalizedMessage => {
  const lower = list?.map(function(s) {
    return s.toLowerCase();
  });
  const opts = msg.options ?? {};
  const integrations = opts.integrations ?? {};
  const providers = opts.providers ?? {};
  const context = opts.context ?? {};

  // generate and attach a messageId to msg
  const hash = SparkMD5.hash(window.JSON.stringify(msg) + uuid());
  const messageId = `ajs-${hash}`

  let ret: NormalizedMessage = {
    messageId,
    integrations: {},
    context: {}
  };

  debug('<-', msg);

  // integrations.
  Object.keys(opts).forEach(key => {
    if (!integration(key)) return;
    if (integrations[key] === undefined) {
      integrations[key] = opts[key] as string;
    }
    delete opts[key];
  });

  // providers.
  delete opts.providers;
  Object.keys(providers).forEach(key => {
    if (!integration(key)) return;
    if (typeof integrations[key] === 'object') return;
    if (integrations[key] !== undefined && typeof providers[key] === 'boolean')
      return;
    integrations[key] = providers[key] as string;
  });

  // move all toplevel options to msg
  // and the rest to context.
  Object.keys(opts).forEach(key => {
    if (includes(TOP_LEVEL_PROPERTIES, key)) {
      ret[key] = opts[key];
    } else {
      context[key] = opts[key];
    }
  }, opts);

  // cleanup
  delete msg.options;
  ret.integrations = integrations;
  ret.context = context;
  ret = {
    ...msg,
    ...ret
  }

  debug('->', ret);
  return ret;

  function integration(name: string) {
    return !!(
      includes(list, name) ||
      name.toLowerCase() === 'all' ||
      includes(lower, name.toLowerCase())
    );
  }
}
