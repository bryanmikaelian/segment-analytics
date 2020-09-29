import assert from 'proclaim';
import sinon from 'sinon';

import { Group } from '../lib/entity/group';
import { Cookie } from '../lib/entity/store/cookie';
import { Store as LocalStorage } from '../lib/entity/store/local';
import { GROUP_ID_COOKIE_KEY, GROUP_TRAITS_LS_KEY } from '../lib/entity/keys';

const cookie = new Cookie({ enabled: true });
const localStorage = new LocalStorage({ enabled: true });
let group: Group;

describe('group', function() {
  const cookieKey = GROUP_ID_COOKIE_KEY;
  const localStorageKey = GROUP_TRAITS_LS_KEY;

  beforeEach(function() {
    group = new Group();
    group.reset();
  });

  afterEach(function() {
    group.reset();
    cookie.remove(cookieKey);
    localStorage.remove(cookieKey);
    localStorage.remove(localStorageKey);
  });

  describe('()', function() {
    let group: Group;
    beforeEach(function() {
      cookie.set(cookieKey, 'gid');
      localStorage.set(cookieKey, 'gid');
      localStorage.set(localStorageKey, { trait: true });
    });

    it('should not reset group id and traits', function() {
      group = new Group();
      assert.equal(group.id, 'gid');
      assert.equal(group.traits.trait, true);
    });

    it('id should fallback to localStorage', function() {
      group = new Group();

      group.id = 'gid';

      // delete the cookie.
      cookie.remove(cookieKey);

      // verify cookie is deleted.
      assert.equal(cookie.get(cookieKey), null);

      // verify id() returns the id even when cookie is deleted.
      assert.equal(group.id, 'gid');

      // verify cookie value is restored from localStorage.
      assert.equal(group.storage.get(cookieKey), 'gid');
    });

    it('id() should not fallback to localStorage when localStorage fallback is disabled', function() {
      group = new Group({
        localStorageFallbackDisabled: true
      });

      group.id = 'gid';

      // delete the cookie.
      group.storage.remove(cookieKey);

      // verify cookie is deleted.
      assert.equal(group.storage.get(cookieKey), null);

      // verify id does not return the id when cookie is deleted.
      assert.equal(group.id, null);
    });
  });

  describe('#id', function() {
    let stub;
    let group: Group;
    describe('when cookies are disabled and we fallback to localstorage', function() {
      before(function() {
        stub = sinon.stub(cookie, 'get');
      });

      after(function() {
        stub.restore();
      });

      beforeEach(() => {
        group = new Group();
      });

      it('should get an id from store', function() {
        group.storage.set(cookieKey, 'id');
        assert(group.id === 'id');
      });

      it('should get an id when not persisting', function() {
        group.options.persist = false;
        group.id = 'id';
        assert(group.id === 'id');
      });

      it('should set an id to the store', function() {
        group.id = 'id2';
        assert.isTrue(group.storage.get(cookieKey) === 'id2');
      });

      it('should set the id when not persisting', function() {
        group.options.persist = false;
        group.id = 'id';
        assert(group.id === 'id');
      });

      it('should be null by default', function() {
        assert(group.id === null);
      });
    });

    describe('when cookies and localStorage are disabled and we fallback to memory', function() {
      let stub;
      let group: Group;
      before(function() {
        stub = sinon.stub(cookie, 'get');
      });

      after(function() {
        stub.restore();
      });

      beforeEach(() => {
        group = new Group({ localStorageFallbackDisabled: true });
      });

      it('should get an id from the store', function() {
        group.storage.set(cookieKey, 'id');
        assert(group.id === 'id');
      });

      it('should get an id when not persisting', function() {
        group.id = 'id';
        assert(group.id === 'id');
      });

      it('should set an id to the store', function() {
        group.id = 'id';
        assert(group.storage.get(cookieKey) === 'id');
      });

      it('should set the id when not persisting', function() {
        group.options.persist = false;
        group.id = 'id';
        assert(group.id === 'id');
      });

      it('should be null by default', function() {
        assert(group.id === null);
      });
    });

    describe('when cookies are enabled', function() {
      let group: Group;
      beforeEach(() => {
        group = new Group();
      });

      it('should get an id from the cookie', function() {
        group.storage.set(cookieKey, 'id');

        assert(group.id === 'id');
      });

      it('should get an id when not persisting', function() {
        group.options.persist = false;
        group.id = 'id';
        assert(group.id === 'id');
      });

      it('should set an id to the cookie', function() {
        group.id = 'id';
        assert(group.storage.get(cookieKey) === 'id');
      });

      it('should set the id when not persisting', function() {
        group.options.persist = false;
        group.id = 'id';
        assert(group.id === 'id');
      });

      it('should be null by default', function() {
        assert(group.id === null);
      });
    });
  });

  describe('#properties', function() {
    let group: Group;
    beforeEach(() => {
      group = new Group();
    });

    it('should get properties', function() {
      group.storage.set(localStorageKey, { property: true });
      assert.deepEqual(group.properties, { property: true });
    });

    it('should get a copy of properties', function() {
      group.storage.set(localStorageKey, { property: true });
      assert(group.traits !== group.properties);
    });

    it('should get properties when not persisting', function() {
      group.options.persist = false;
      group.traits = { property: true };
      assert.deepEqual(group.properties, { property: true });
    });

    it('should get a copy of properties when not persisting', function() {
      group.options.persist = false;
      group.traits = { property: true };
      assert(group.traits !== group.properties);
    });

    it('should set properties', function() {
      group.properties = { property: true };
      assert.deepEqual(group.storage.get(localStorageKey), { property: true });
    });

    it('should set the id when not persisting', function() {
      group.options.persist = false;
      group.properties = { property: true };
      assert.deepEqual(group.traits, { property: true });
    });

    it('should default properties to an empty object', function() {
      group.properties = null;
      assert.deepEqual(group.storage.get(localStorageKey), {});
    });

    it('should default properties to an empty object when not persisting', function() {
      group.options.persist = false;
      group.properties = null;
      assert.deepEqual(group.traits, {});
    });

    it('should be an empty object by default', function() {
      assert.deepEqual(group.properties, {});
    });
  });

  describe('#options', function() {
    let group: Group;
    beforeEach(() => {
      group = new Group();
    });

    it('should get options', function() {
      const { options } = group;
      assert(options === group.options);
    });

    it('should set options with defaults', function() {
      group.options.persist = false;
      assert.deepEqual(group.options, {
        persist: false,
        cookie: {
          key: GROUP_ID_COOKIE_KEY
        },
        localStorage: {
          key: GROUP_TRAITS_LS_KEY
        }
      });
    });
  });

  describe('#logout', function() {
    let group: Group;
    beforeEach(() => {
      group = new Group();
    });

    it('should reset an id and properties', function() {
      group.id = 'id';
      group.properties = { property: true };
      group.logout();
      assert(group.id === null);
      assert.deepEqual(group.properties, {});
    });

    it('should clear id in cookie', function() {
      group.id = 'id';
      group.logout();
      assert(cookie.get(cookieKey) === null);
    });

    it('should clear id in localStorage', function() {
      group.id = 'id';
      group.logout();
      assert(localStorage.get(cookieKey) === undefined);
    });

    it('should clear traits in local storage', function() {
      group.properties = { property: true };
      group.logout();
      assert(localStorage.get(localStorageKey) === undefined);
    });
  });

  describe('#identify', function() {
    it('should save an id', function() {
      group.identify('id');
      assert(group.id === 'id');
      assert(group.storage.get(cookieKey) === 'id');
    });

    it('should save properties', function() {
      group.identify(null, { property: true });
      assert.deepEqual(group.properties, { property: true });
      assert.deepEqual(group.storage.get(localStorageKey), {
        property: true
      });
    });

    it('should save an id and properties', function() {
      group.identify('id', { property: true });
      assert(group.id === 'id');
      assert.deepEqual(group.properties, { property: true });
      assert(group.storage.get(cookieKey) === 'id');
      assert.deepEqual(group.storage.get(localStorageKey), {
        property: true
      });
    });

    it('should extend existing properties', function() {
      group.properties = { one: 1 };
      group.identify('id', { two: 2 });
      assert.deepEqual(group.properties, { one: 1, two: 2 });
      assert.deepEqual(group.storage.get(localStorageKey), {
        one: 1,
        two: 2
      });
    });

    it('shouldnt extend existing properties for a new id', function() {
      group.id = 'id';
      group.properties = { one: 1 };
      group.identify('new', { two: 2 });
      assert.deepEqual(group.properties, { two: 2 });
      assert.deepEqual(group.storage.get(localStorageKey), { two: 2 });
    });

    it('should reset properties for a new id', function() {
      group.id = 'id';
      group.properties = { one: 1 };
      group.identify('new');
      assert.deepEqual(group.properties, {});
      assert.deepEqual(group.storage.get(localStorageKey), {});
    });
  });

  describe('#load', function() {
    it('should load an empty group', function() {
      group.load();
      assert(group.id === null);
      assert.deepEqual(group.properties, {});
    });

    it('should load an id from a cookie', function() {
      group.storage.set(cookieKey, 'id');
      group.load();
      assert(group.id === 'id');
    });

    it('should load properties from local storage', function() {
      group.storage.set(localStorageKey, { property: true });
      group.load();
      assert.deepEqual(group.properties, { property: true });
    });
  });
});
