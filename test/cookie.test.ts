import assert from 'proclaim';
import cookie from '../lib/entity/store/cookie';

describe('cookie', function() {
  beforeEach(function() {
    // Just to make sure that
    // URIError is never thrown here.
    document.cookie = 'bad=%';
  });

  afterEach(function() {
    // reset to defaults
    cookie.options = {};
    // remove all cookies
    document.cookie.split(';').forEach(function(entry) {
      cookie.remove(entry.split('=')[0]);
    });
  });

  describe('#get', function() {
    it('should not not get an empty cookie', function() {
      assert(cookie.get('abc') === null);
    });

    it('should get an existing cookie', function() {
      cookie.set('cookie-get', { a: 'b' });
      assert.deepEqual(cookie.get('cookie-get'), { a: 'b' });
    });

    it('should not throw an error on a malformed cookie', function() {
      document.cookie = 'cookie-bad=y';
      assert(cookie.get('cookie-bad') === null);
    });
  });

  describe('#set', function() {
    it('should set a cookie', function() {
      cookie.set('cookie-set', { a: 'b' });
      assert.deepEqual(cookie.get('cookie-set'), { a: 'b' });
    });
  });

  describe('#remove', function() {
    it('should remove a cookie', function() {
      cookie.set('cookie-remove', { a: 'b' });
      assert.deepEqual(cookie.get('cookie-remove'), { a: 'b' });
      cookie.remove('cookie-remove');
      assert(cookie.get('cookie-remove') === null);
    });

    it('null cookie should be null after setting', function() {
      cookie.set('cookie-null', null);
      assert(cookie.get('cookie-null') === null);
    });
  });

  describe('#options', function() {
    it('should save options', function() {
      cookie.options = { path: '/xyz' };
      assert(cookie.options.path === '/xyz');
      assert(cookie.options.maxage === 31536000000);
    });

    it('should have default options', function() {
      cookie.options = { domain: '' };

      assert(cookie.options.maxage === 31536000000);
      assert(cookie.options.path === '/');
      assert(cookie.options.domain === '');
      assert(cookie.options.sameSite === 'Lax');
    });

    it('should set the domain correctly', function() {
      cookie.options = { domain: '' };
      assert(cookie.options.domain === '');
    });

    it('should set SameSite=Lax by default', function() {
      assert(cookie.options.sameSite === 'Lax');
    });

    it('should fallback to `domain=null` when it cant set the test cookie', function() {
      cookie.options = { domain: 'baz.com' };
      assert(cookie.options.domain === null);
      assert(cookie.get('ajs:test') === null);
    });
  });
});
