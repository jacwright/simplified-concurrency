var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { expect } from 'chai';
import { simplifiedConcurrency } from './concurrency.js';
describe('concurrency', () => {
    const { blockable, blockableResponse, blocking, blockWhile: blockOthersWhile, reset } = simplifiedConcurrency();
    let storage;
    let controller;
    let blockableCalled = 0;
    let blockingFinished = 0;
    let blockableResponseFinished = 0;
    let blockingPromise;
    // Simple storage with cache
    class Storage {
        constructor() {
            this.cache = new Map();
        }
        async get(key) {
            if (this.cache.has(key)) {
                return this.cache.get(key);
            }
            else {
                return new Promise(resolve => setTimeout(() => resolve(0), 10));
            }
        }
        async put(key, value) {
            this.cache.set(key, value);
            return new Promise(resolve => setTimeout(() => resolve(), 100));
        }
    }
    __decorate([
        blocking
    ], Storage.prototype, "get", null);
    __decorate([
        blocking
    ], Storage.prototype, "put", null);
    class Controller {
        constructor() {
            this.storage = new Storage();
        }
        async getUniqueNumber() {
            let val = await this.storage.get('counter');
            val = (val || 0) + 1;
            this.storage.put('counter', val);
            return val;
        }
    }
    __decorate([
        blockable
    ], Controller.prototype, "getUniqueNumber", null);
    const blockFor10 = blocking(() => {
        return (blockingPromise = new Promise(resolve => setTimeout(() => resolve(blockingFinished++), 10)));
    });
    const blockableFunction = blockable(async () => {
        blockableCalled++;
        await blockOthersWhile(new Promise(resolve => setTimeout(resolve, 10)));
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
    it('should block concurrent calls to the same method', async () => {
        const getNumInnerMost = async () => await controller.getUniqueNumber();
        const getNumInner = async () => await getNumInnerMost();
        const getNum = async () => await getNumInner();
        const promise1 = getNum();
        const promise2 = controller.getUniqueNumber();
        await promise1;
        expect(storage.cache.get('counter')).to.equal(1);
    });
    it('should run deferred calls after the blocks are finished', async () => {
        const promise1 = controller.getUniqueNumber();
        const promise2 = controller.getUniqueNumber();
        await promise1;
        await promise2;
        expect(storage.cache.get('counter')).to.equal(2);
    });
    describe('blockable', () => {
        it('should defer calls when blocked', async () => {
            expect(blockableCalled).to.equal(0);
            blockableFunction();
            blockableFunction();
            expect(blockableCalled).to.equal(1);
        });
        it('should run deferred calls after block', async () => {
            const promise1 = blockableFunction();
            blockableFunction();
            await promise1;
            // wait for the next cycle
            await new Promise(r => setTimeout(r));
            expect(blockableCalled).to.equal(2);
        });
        it('should wait on un-await-ed blocks before returning', async () => {
            let firstResult;
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
    describe('blocking', () => { });
});
//# sourceMappingURL=concurrency.spec.js.map