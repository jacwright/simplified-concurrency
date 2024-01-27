import { expect } from 'chai';
import { simplifiedConcurrency } from './concurrency.js';

describe.only('concurrency', () => {
  const { blockable, blockableResponse, blocking, reset } = simplifiedConcurrency();
  let storage: Storage;
  let controller: Controller;
  let blockableCalled = 0;
  let blockingFinished = 0;
  let blockableResponseFinished = 0;
  let blockingPromise: Promise<any>;

  // Simple storage with cache
  class Storage {
    cache: Map<string, any>;

    constructor() {
      this.cache = new Map();
    }

    @blocking
    async get(key: string) {
      if (this.cache.has(key)) {
        return this.cache.get(key);
      } else {
        return new Promise(resolve => setTimeout(() => resolve(0), 10));
      }
    }

    @blocking
    async put(key: string, value: any) {
      this.cache.set(key, value);
      return new Promise(resolve => setTimeout(() => resolve(value), 100));
    }
  }

  class Controller {
    storage: Storage;

    constructor() {
      this.storage = new Storage();
    }

    @blockable
    async getUniqueNumber() {
      const val = await this.storage.get('counter');
      this.storage.put('counter', (val || 0) + 1);
      return val;
    }
  }

  const blockFor10 = blocking(() => {
    return (blockingPromise = new Promise(resolve => setTimeout(() => resolve(blockingFinished++), 10)));
  });

  const blockableFunction = blockable(async () => {
    blockableCalled++;
    await blockFor10();
    blockFor10();
    return 'foo';
  });

  const blockableResponseFunction = blockableResponse(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    blockableResponseFinished++;
    return 'bar';
  });

  beforeEach(() => {
    reset();
    controller = new Controller();
    storage = controller.storage;
    blockableCalled = 0;
    blockingFinished = 0;
    blockableResponseFinished = 0;
  });

  // it('should block concurrent calls to the same method', async () => {
  //   let called = 0;
  //   function blockableFunction() {
  //     called++;

  //   }
  //   const promise1 = controller.getUniqueNumber();
  //   const promise2 = controller.getUniqueNumber();
  //   await promise1;
  //   expect(storage.cache.get('counter')).to.equal(1);
  // });

  // it('should run deferred calls after blocks are finished', async () => {
  //   const promise1 = controller.getUniqueNumber();
  //   const promise2 = controller.getUniqueNumber();
  //   await promise1;
  //   await promise2;
  //   expect(storage.cache.get('counter')).to.equal(2);
  // });

  describe('blockable', () => {
    it('should defer calls when blocked', async () => {
      expect(blockableCalled).to.equal(0);
      blockableFunction();
      blockableFunction();
      expect(blockableCalled).to.equal(1);
    });

    it('should run deferred calls after block', async () => {
      let firstResult: any;
      const promise1 = blockableFunction();
      promise1.then(result => (firstResult = result));
      blockableFunction();
      await blockingPromise;
      expect(blockableCalled).to.equal(2);
    });

    it('should wait on un-await-ed blocks before returning', async () => {
      let firstResult: any;
      const promise1 = blockableFunction();
      promise1.then(result => (firstResult = result));
      blockableFunction();
      await blockingPromise;

      expect(firstResult).to.be.undefined; // still waiting on the second blocker
      await promise1;
      expect(firstResult).to.equal('foo'); // still waiting on the second blocker
    });
  });

  describe('blockableResponse', () => {
    it('should return the result immediately if there are no blockers', async () => {
      const result = await blockableResponseFunction();
      expect(result).to.equal('bar');
    });

    it('should defer the result while there are blockers', async () => {
      let hasResponded = false;
      const promise1 = blockableResponseFunction().then(result => (hasResponded = true));
      expect(blockableResponseFinished).to.equal(0);
      expect(hasResponded).to.equal(false);
      await blockFor10();
      expect(blockableResponseFinished).to.equal(1);
      expect(hasResponded).to.equal(false);
      await blockFor10();
      await blockFor10();
      await blockFor10();
      await blockFor10();
      expect(hasResponded).to.equal(false);
      await promise1;
      expect(hasResponded).to.equal(true);
    });
  });

  describe('blocking', () => {});
});
