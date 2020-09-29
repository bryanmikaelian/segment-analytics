import assert from 'proclaim';
import sinon from 'sinon';
import rawCookie from '@segment/cookie';

import { User } from '../lib/entity/user';
import { USER_ID_COOKIE_KEY, USER_TRAITS_LS_KEY } from '../lib/entity/keys';
import { Cookie } from '../lib/entity/store/cookie';
import local, { Store as LocalStorage } from '../lib/entity/store/local';
import { Group } from '../lib/entity/group';

const cookie = new Cookie({ enabled: true });
const localStorage = new LocalStorage({ enabled: true });
let user: User;

describe('user', function() {
  const cookieKey = USER_ID_COOKIE_KEY;
  const localStorageKey = USER_TRAITS_LS_KEY;

  beforeEach(function() {
    user = new User();
    user.reset();
  });

  afterEach(function() {
    user.reset();
    cookie.remove(cookieKey);
    localStorage.remove(cookieKey);
    localStorage.remove(localStorageKey);
    user.storage.remove('_sio');
    rawCookie('_sio', null);
  });

  describe('()', function() {
    let user: User;
    beforeEach(function() {
      cookie.set(cookieKey, 'id');
      localStorage.set(cookieKey, 'id');
      localStorage.set(localStorageKey, { trait: true });
    });

    it('should not reset user id and traits', function() {
      user = new User();
      assert.equal(user.id, 'id');
      assert.equal(user.traits.trait, true);
    });

    it('id() should fallback to localStorage', function() {
      user = new User();

      user.id = 'id';

      // delete the user.storage.
      cookie.remove(cookieKey);

      // verify cookie is deleted.
      assert.equal(cookie.get(cookieKey), null);

      // verify id() returns the id even when cookie is deleted.
      assert.equal(user.id, 'id');

      // verify cookie value is restored from localStorage.
      assert.equal(user.storage.get(cookieKey), 'id');
    });

    it('id() should not fallback to localStorage when disabled', function() {
      user = new User({
        localStorageFallbackDisabled: true
      });

      user.id = 'id';

      // delete the user.storage.
      cookie.remove(cookieKey);

      // verify cookie is deleted.
      assert.equal(user.storage.get(cookieKey), null);

      // verify id() does not return the id when cookie is deleted.
      assert.equal(user.id, null);
    });

    it('should pick the old "_sio" anonymousId', function() {
      rawCookie('_sio', 'anonymous-id----user-id');
      var user = new User();
      assert(user.anonymousId() === 'anonymous-id');
    });

    it('should not pick the old "_sio" if anonymous id is present', function() {
      rawCookie('_sio', 'old-anonymous-id----user-id');
      user.storage.set('ajs_anonymous_id', 'new-anonymous-id');
      assert(new User().anonymousId() === 'new-anonymous-id');
    });

    it('should create anonymous id if missing', function() {
      var user = new User();
      assert(user.anonymousId().length === 36);
    });

    it('should not overwrite anonymous id', function() {
      user.storage.set('ajs_anonymous_id', 'anonymous');
      assert(new User().anonymousId() === 'anonymous');
    });
  });

  describe('#id', function() {
    describe('when cookies are disabled', function() {
      let user: User;
      beforeEach(function() {
        sinon.stub(cookie, 'get');
        user = new User();
      });

      afterEach(function() {
        sinon.restore();
      });

      it('should get an id from the store', function() {
        user.storage.set(cookieKey, 'id');
        assert(user.id === 'id');
      });

      it('should get an id when not persisting', function() {
        user.options.persist = false;
        user.id = 'id';
        assert(user.id === 'id');
      });

      it('should set an id to the store', function() {
        user.id = 'id';
        assert(user.storage.get(cookieKey) === 'id');
      });

      it('should set the id when not persisting', function() {
        user.options.persist = false;
        user.id = 'id';
        assert(user.id === 'id');
      });

      it('should be null by default', function() {
        assert(user.id === null);
      });

      it('should not reset anonymousId if the user didnt have previous id', function() {
        var prev = user.anonymousId();
        user.id = 'foo';
        user.id = 'foo';
        user.id = 'foo';
        assert.equal(user.anonymousId(), prev);
      });

      it('should reset anonymousId if the user id changed', function() {
        var prev = user.anonymousId();
        user.id = 'foo';
        user.id = 'baz';
        assert.notEqual(user.anonymousId(), prev);
        assert.equal(user.anonymousId().length, 36);
      });

      it('should not reset anonymousId if the user id changed to null', function() {
        var prev = user.anonymousId();
        user.id = 'foo';
        user.id = null;
        assert.equal(user.anonymousId(), prev);
        assert.equal(user.anonymousId().length, 36);
      });
    });

    describe('when cookies and localStorage are disabled', function() {
      let user: User;
      beforeEach(function() {
        sinon.stub(cookie, 'get');
        user = new User();
        user.storage.enabled = false;
      });

      afterEach(function() {
        user.storage.enabled = true;
        sinon.restore();
      });

      it('should get an id from the memory', function() {
        user.storage.set(cookieKey, 'id');
        assert(user.id === 'id');
      });

      it('should get an id when not persisting', function() {
        user.options.persist = false;
        user.id = 'id';
        assert(user.id === 'id');
      });

      it('should set an id to the memory', function() {
        user.id = 'id';
        assert(user.storage.get(cookieKey) === 'id');
      });

      it('should set the id when not persisting', function() {
        user.options.persist = false;
        user.id = 'id';
        assert(user.id === 'id');
      });

      it('should be null by default', function() {
        assert(user.id === null);
      });

      it('should not reset anonymousId if the user didnt have previous id', function() {
        const prev = user.anonymousId();
        user.id = 'foo';
        user.id = 'foo';
        user.id = 'foo';
        assert(user.anonymousId() === prev);
      });

      it('should reset anonymousId if the user id changed', function() {
        const prev = user.anonymousId();
        user.id = 'foo';
        user.id = 'baz';
        assert(user.anonymousId() !== prev);
        assert(user.anonymousId().length === 36);
      });

      it('should not reset anonymousId if the user id changed to null', function() {
        const prev = user.anonymousId();
        user.id = 'foo';
        user.id = null;
        assert(user.anonymousId() === prev);
        assert(user.anonymousId().length === 36);
      });
    });

    describe('when cookies are enabled', function() {
      let user: User;
      beforeEach(() => {
        user = new User();
      });

      it('should get an id from the cookie', function() {
        user.storage.set(cookieKey, 'id');
        assert(user.id === 'id');
      });

      it('should get an id when not persisting', function() {
        user.options.persist = false;
        user.id = 'id';
        assert(user.id === 'id');
      });

      it('should set an id to the cookie', function() {
        user.id = 'id';
        assert(user.storage.get(cookieKey) === 'id');
      });

      it('should set the id when not persisting', function() {
        user.options.persist = false;
        user.id = 'id';
        assert(user.id === 'id');
      });

      it('should be null by default', function() {
        assert(user.id === null);
      });

      it('should not reset anonymousId if the user didnt have previous id', function() {
        var prev = user.anonymousId();
        user.id = 'foo';
        user.id = 'foo';
        user.id = 'foo';
        assert(user.anonymousId() === prev);
      });

      it('should reset anonymousId if the user id changed', function() {
        var prev = user.anonymousId();
        user.id = 'foo';
        user.id = 'baz';
        assert(user.anonymousId() !== prev);
        assert(user.anonymousId().length === 36);
      });
    });
  });

  describe('#anonymousId', function() {
    describe('when cookies are disabled', function() {
      let user: User;
      beforeEach(function() {
        sinon.stub(cookie, 'get');
        user = new User();
      });

      afterEach(function() {
        sinon.restore();
      });

      it('should get an id from the store', function() {
        user.storage.set('ajs_anonymous_id', 'anon-id');
        assert(user.anonymousId() === 'anon-id');
      });

      it('should set an id to the store', function() {
        user.anonymousId('anon-id');
        assert(user.storage.get('ajs_anonymous_id') === 'anon-id');
      });

      it('should return anonymousId using the store', function() {
        assert.notEqual(user.anonymousId().length, 0);
      });
    });

    describe('when cookies and localStorage are disabled', function() {
      let user: User;
      beforeEach(function() {
        sinon.stub(cookie, 'get');
        user = new User();
        user.storage.enabled = false;
      });

      afterEach(function() {
        user.storage.enabled = true;
        sinon.restore();
      });

      it('should get an id from the memory', function() {
        user.storage.set('ajs_anonymous_id', 'anon-id');
        assert(user.anonymousId() === 'anon-id');
      });

      it('should set an id to the memory', function() {
        user.anonymousId('anon-id');
        assert(user.storage.get('ajs_anonymous_id') === 'anon-id');
      });

      it('should return anonymousId using the store', function() {
        assert.notEqual(user.anonymousId().length, 0);
      });
    });

    describe('when cookies are enabled', function() {
      let user: User;
      beforeEach(function() {
        user = new User();
      });

      afterEach(() => {
        user.reset();
      });

      it('should get an id from the cookie', function() {
        user.storage.set('ajs_anonymous_id', 'anon-id');
        assert(user.anonymousId() === 'anon-id');
      });

      it('should set an id to the cookie', function() {
        user.anonymousId('anon-id');
        assert(user.storage.get('ajs_anonymous_id') === 'anon-id');
      });

      it('should return anonymousId using the store', function() {
        assert.notEqual(user.anonymousId().length, 0);
      });

      it('should set anonymousId in both cookie and localStorage', function() {
        user = new User();
        user.anonymousId('anon0');
        assert.equal(user.storage.get('ajs_anonymous_id'), 'anon0');
        assert.equal(user.storage.get('ajs_anonymous_id'), 'anon0');
      });

      it('should not set anonymousId in localStorage when localStorage fallback is disabled', function() {
        user = new User({ localStorageFallbackDisabled: true });
        user.anonymousId('anon0');
        assert.equal(user.storage.get('ajs_anonymous_id'), 'anon0');
        assert.equal(localStorage.get('ajs_anonymous_id'), null);
      });

      it('should copy value from cookie to localStorage', function() {
        user = new User();
        user.storage.set('ajs_anonymous_id', 'anon1');
        assert.equal(user.anonymousId(), 'anon1');
        assert.equal(user.storage.get('ajs_anonymous_id'), 'anon1');
      });

      it('should not copy value from cookie to localStorage when localStorage fallback is disabled', function() {
        user = new User({ localStorageFallbackDisabled: true });
        user.storage.set('ajs_anonymous_id', 'anon1');
        assert.equal(user.anonymousId(), 'anon1');
        assert.equal(localStorage.get('ajs_anonymous_id'), null);
      });

      it('should fall back to localStorage when cookie is not set', function() {
        user = new User();

        user.anonymousId('anon12');
        assert.equal(user.storage.get('ajs_anonymous_id'), 'anon12');

        // delete the cookie
        cookie.remove('ajs_anonymous_id');
        assert.equal(cookie.get('ajs_anonymous_id'), null);

        // verify anonymousId() returns the correct id even when there's no cookie
        assert.equal(user.anonymousId(), 'anon12');

        // verify cookie value is restored from localStorage
        assert.equal(cookie.get('ajs_anonymous_id'), 'anon12');
      });

      it('should not fall back to localStorage when cookie is not set and localStorage fallback is disabled', function() {
        user = new User();
        user.options.localStorageFallbackDisabled = true;

        user.anonymousId('anon12');
        assert.equal(user.storage.get('ajs_anonymous_id'), 'anon12');

        // delete the cookie
        user.storage.remove('ajs_anonymous_id');
        assert.equal(user.storage.get('ajs_anonymous_id'), null);

        // verify anonymousId() does not return the id when there's no user.storage.
        assert.notEqual(user.anonymousId(), 'anon12');
      });

      it('should write to both cookie and localStorage when generating a new anonymousId', function() {
        user = new User();
        const anonId = user.anonymousId();
        assert.notEqual(anonId, null);
        assert.equal(user.storage.get('ajs_anonymous_id'), anonId);
        assert.equal(user.storage.get('ajs_anonymous_id'), anonId);
      });

      it('should not write to both cookie and localStorage when generating a new anonymousId and localStorage fallback is disabled', function() {
        user = new User({
          localStorageFallbackDisabled: true
        });

        const anonId = user.anonymousId();

        assert.notEqual(anonId, null);
        assert.equal(cookie.get('ajs_anonymous_id'), anonId);
        assert.equal(localStorage.get('ajs_anonymous_id'), null);
      });
    });
  });

  describe('#traits', function() {
    let user: User;
    beforeEach(function() {
      user = new User();
    });

    afterEach(() => {
      user.reset();
    });

    it('should get traits', function() {
      user.storage.set(localStorageKey, { trait: true });
      assert.deepEqual(user.traits, { trait: true });
    });

    it('should get a copy of traits', function() {
      const prev = user.traits;
      user.storage.set(localStorageKey, { trait: true });
      assert(prev !== user.traits);
    });

    it('should get traits when not persisting', function() {
      user.options.persist = false;
      user.traits = { trait: true };
      assert.deepEqual(user.traits, { trait: true });
    });

    it('should get a copy of traits when not persisting', function() {
      user.options.persist = false;
      const prev = user.traits;
      user.traits = { trait: true };
      assert(prev !== user.traits);
    });

    it('should set traits', function() {
      user.traits = { trait: true };
      assert.deepEqual(user.storage.get(localStorageKey), { trait: true });
    });

    it('should set the id when not persisting', function() {
      user.options.persist = false;
      user.traits = { trait: true };
      assert.deepEqual(user.traits, { trait: true });
    });

    it('should default traits to an empty object', function() {
      user.traits = null;
      assert.deepEqual(user.storage.get(localStorageKey), {});
    });

    it('should default traits to an empty object when not persisting', function() {
      user.options.persist = false;
      user.traits = null;
      assert.deepEqual(user.traits, {});
    });

    it('should be an empty object by default', function() {
      assert.deepEqual(user.traits, {});
    });
  });

  describe('#options', function() {
    it('should set options with defaults', function() {
      assert.deepEqual(user.options, {
        persist: true,
        cookie: {
          key: 'ajs_user_id',
          oldKey: 'ajs_user'
        },
        localStorage: {
          key: 'ajs_user_traits'
        }
      });
    });
  });

  describe('#logout', function() {
    let user: User;
    beforeEach(function() {
      user = new User();
    });

    afterEach(() => {
      user.reset();
    });

    it('should reset an id and traits', function() {
      user.id = 'id';
      user.anonymousId('anon-id');
      user.traits = { trait: true };
      user.logout();
      assert(user.storage.get('ajs_anonymous_id') === null);
      assert(user.id === null);
      assert.deepEqual(user.traits, {});
    });

    it('should clear id in cookie', function() {
      user.id = 'id';
      user.logout();
      assert(cookie.get(cookieKey) === null);
    });

    it('should clear id in local storage', function() {
      user.id = 'id';
      user.logout();
      assert(localStorage.get(cookieKey) === undefined);
    });

    it('should clear traits in local storage', function() {
      user.traits = { trait: true };
      user.logout();
      assert(localStorage.get(localStorageKey) === undefined);
    });
  });

  describe('#identify', function() {
    it('should save an id', function() {
      user.identify('id');
      assert(user.id === 'id');
      assert(user.storage.get(cookieKey) === 'id');
    });

    it('should save traits', function() {
      user.identify(null, { trait: true });
      assert.deepEqual(user.traits, { trait: true });
      assert.deepEqual(user.storage.get(localStorageKey), { trait: true });
    });

    it('should save an id and traits', function() {
      user.identify('id', { trait: true });
      assert(user.id === 'id');
      assert.deepEqual(user.traits, { trait: true });
      assert(user.storage.get(cookieKey) === 'id');
      assert.deepEqual(user.storage.get(localStorageKey), { trait: true });
    });

    it('should extend existing traits', function() {
      user.traits = { one: 1 };
      user.identify('id', { two: 2 });
      assert.deepEqual(user.traits, { one: 1, two: 2 });
      assert.deepEqual(user.storage.get(localStorageKey), { one: 1, two: 2 });
    });

    it('shouldnt extend existing traits for a new id', function() {
      user.id = 'id';
      user.traits = { one: 1 };
      user.identify('new', { two: 2 });
      assert.deepEqual(user.traits, { two: 2 });
      assert.deepEqual(user.storage.get(localStorageKey), { two: 2 });
    });

    it('should reset traits for a new id', function() {
      user.id = 'id';
      user.traits = { one: 1 };
      user.identify('new');
      assert.deepEqual(user.traits, {});
      assert.deepEqual(user.storage.get(localStorageKey), {});
    });
  });

  describe('#load', function() {
    it('should load an empty user', function() {
      user.load();
      assert(user.id === null);
      assert.deepEqual(user.traits, {});
    });

    it('should load an id from a cookie', function() {
      user.storage.set(cookieKey, 'id');
      user.load();
      assert(user.id === 'id');
    });

    it('should load traits from local storage', function() {
      user.storage.set(localStorageKey, { trait: true });
      user.load();
      assert.deepEqual(user.traits, { trait: true });
    });

    it('should load from an old cookie', function() {
      user.storage.set(user.options.cookie.oldKey, {
        id: 'old',
        traits: { trait: true }
      });
      user.load();
      assert(user.id === 'old');
      assert.deepEqual(user.traits, { trait: true });
    });
  });
});
