import { Debugger } from 'debug';
import cloneDeep from 'lodash.clonedeep';
import assignIn from 'lodash.assignin';
import isodateTraverse from '@segment/isodate-traverse';
import { default as d } from 'debug';

import { EntityStore, Store } from './store';

export interface EntityOptions {
  localStorageFallbackDisabled?: boolean;
  persist: boolean
  localStorage: {
    key: string
  }
  cookie: {
    key: string;
    /**
     * @deprecated  Use `key` instead
     */
    oldKey?: string;
  }
}

/**
 * Abstract class that represents some object that is backed by cookie storage and localStorage.
 */
abstract class Entity {
  public storage: EntityStore;

  protected debug: Debugger;
  protected _options: EntityOptions;
  private _id?: string | null;
  private _traits?: Record<string, unknown>;

  protected constructor(options: EntityOptions) {
    this._id = null;
    this._traits = {};


    this.debug = d('analytics:entity');
    this._options = options;

    const useLocalStorage = !options.localStorageFallbackDisabled ?? true;
    this.storage = new Store(options, useLocalStorage);
  }

  /**
   * Sets the id for the entity
   * @param {string} id - The id you wish to use for the entity
   */
  set id(id: string) {
    this._id = id;


    if (this._options.persist && this._options.cookie?.key) {
      this.storage.set(this._options.cookie.key, id);
    }
  }

  /**
   * Gets the id for an entity
   *
   * @return {string | null}
   */
  get id(): string | null {
    if (!this._options.persist && this._id) {
      return this._id;
    }

    return this.storage.get(this._options.cookie?.key) as string ?? null;
  }

  /**
   * Sets the traits for a given entity.
   * @param {Record<string, unknown>} traits - The collection of traits.
   */
  set traits(traits: Record<string, unknown>) {
    this._traits = traits || {};

    if (this._options.persist) {
      this.storage.set(this._options.localStorage.key, traits || {});
    }
  }

  /**
   * Gets the traits for a given entity.
   *
   * @return {Record<string, unknown>}
   */
  get traits(): Record<string, unknown> {
    let traits: Record<string, unknown>;
    if (this._options.persist) {
      traits = this.storage.get(this._options.localStorage.key) as Record<string, unknown>;
    } else {
      traits = this._traits;
    }

    if (!traits) {
      return {};
    }

    // Always convert ISO date strings into real dates since they aren't parsed back from local storage.
    return isodateTraverse(cloneDeep(traits)) as Record<string, unknown>;
  }


  /**
   * Alternative method for set `traits`
   * @param {Record<string, unknown>} traits - The collection of traits.
   * @deprecated
   */
  set properties(traits: Record<string, unknown>) {
    this.traits = traits;
  }

  /**
   * Alternative method for getting `traits`
   *
   * @return {Record<string, unknown>}
   * @deprecated
   */
  get properties(): Record<string, unknown> {
    return this.traits;
  }


  set options(options: EntityOptions) {
    if (options) {
      this._options = options;
    }
  }

  get options(): EntityOptions {
    return this._options;
  }

  /**
   * Identify the entity with an `id` and `traits`. If we it's the same entity,
   * extend the existing `traits` instead of overwriting.
   *
   * @param {string} id - The id
   * @param {traits} traits - A collection of traits
   */
  public identify(id?: string, traits?: Record<string, unknown>): void {
    traits = traits || {};
    const current = this.id;

    if (current === null || current === id) {
      traits = assignIn(this.traits, traits);
    }

    if (id) {
      this.id = id;
    }

    this.debug('identify %o, %o', id, traits);
    this.traits = traits;
  }

  /**
   * Log the entity out, resetting `id` and `traits` to defaults.
   */
  public logout(): void {
    this.id = null;
    this.traits = {};

    if (this._options.persist) {
      this.storage.remove(this._options.cookie.key);
      this.storage.remove(this._options.localStorage.key);
    }
  }

  /**
   * Reset all entity state, logging out and returning options to defaults.
   */
  public reset(): void {
    this.logout();
  }


  /**
   * Load saved entity `id` or `traits` from storage into memory.
   */
  public load(): void {
    if (this._options.persist) {
      this._id = this.id;
      this._traits = this.traits;
    }
  }
}

export default Entity;
