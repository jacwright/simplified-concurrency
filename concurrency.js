/**
 * Returns methods for implementing
 */
export function simplifiedConcurrency() {
    const blockingCalls = new Set();
    const deferredBlocks = [];
    const deferredResponses = [];
    return {
        /**
         * Wrap a function which is blockable.
         * Also, a Typescript decorator for functions which are blockable.
         *
         * ### Examples:
         *
         * #### Wrapped function:
         * ```ts
         * // function
         * const increment = blockable(async (amount: number) => {
         *   const value = await getFromStorage('value'); // blocking call
         *   setToStorage('value', value + amount); // blocking call
         *   return value + amount; // won't return until blocking is finished
         * });
         *
         * // class
         * class Controller {
         *   constructor() {
         *     this.increment = blockable(this.increment);
         *   }
         *
         *   async increment(amount: number) {
         *     const value = await this.storage.get('value'); // blocking call
         *     this.storage.set('value', value + amount); // blocking call
         *     return value + amount; // won't return until blocking is finished
         *   }
         * }
         * ```
         *
         * #### Decorator:
         * ```ts
         * class Controller {
         *
         *   @blockable
         *   async increment(amount: number) {
         *     const value = await this.storage.get('value'); // blocking call
         *     this.storage.set('value', value + amount); // blocking call
         *     return value + amount; // won't return until blocking is finished
         *   }
         * }
         * ```
         */
        blockable: makeDecoratable(blockable),
        /**
         * Wrap a function which returns a response which is blockable (e.g. fetch).
         * Also, a Typescript decorator for functions whose response should be blocked when needed.
         * Example:
         * ```ts
         * class RemoteAPI {
         *   @blockableResponse
         *   async sendEmail(options: EmailOptions) {
         *     ...
         *   }
         * }
         * ```
         */
        blockableResponse: makeDecoratable(blockableResponse),
        /**
         * Wrap a function which blocks.
         * Also, a Typescript decorator for functions which block.
         * Examples:
         *
         * Wrapped function:
         * ```ts
         * // function
         * const getFromStorage = blocking(async (key: string) => {
         *   ...
         * });
         *
         * // class
         * class Storage {
         *   constructor() {
         *     this.get = blocking(this.get);
         *   }
         *
         *   async get(key: string) {
         *     ...
         *   }
         * }
         * ```
         *
         * Decorator:
         * ```ts
         * class Storage {
         *
         *   @blocking
         *   async get(key: string) {
         *     ...
         *   }
         * }
         * ```
         */
        blocking: makeDecoratable(blocking),
        /**
         * A version of fetch with a blockable response.
         */
        fetch: blockableResponse(fetch),
        /**
         * Block while waiting for the callback to resolve.
         */
        blockWhile,
        /** Internal function to call a function that may be deferred if the process is blocking */
        blockFunctionCall,
        /** Internal function to return a promise that will resolve when there is no more blocking */
        blockResponse,
        /** Internal function to block blockable functions and responses until it has resolved */
        addBlockingPromise,
        /** Internal function to reset everything for testing */
        reset,
    };
    /**
     * Wrap a function which is blockable.
     */
    function blockable(target) {
        return function (...args) {
            return blockFunctionCall(this, target, args);
        };
    }
    /**
     * Wrap a function which returns a response which is blockable (e.g. fetch).
     */
    function blockableResponse(target) {
        return function (...args) {
            return target.apply(this, args).finally(blockResponse);
        };
    }
    /**
     * Wrap a function which blocks.
     */
    function blocking(target) {
        return function (...args) {
            return addBlockingPromise(target.apply(this, args));
        };
    }
    /**
     * Block while waiting for the callback to resolve.
     */
    async function blockWhile(callback) {
        return addBlockingPromise(callback());
    }
    /**
     * Blocks the execution of this function until there are no more blocking calls in progress.
     */
    async function blockFunctionCall(thisArg, target, args) {
        if (!blockingCalls.size) {
            return target.apply(thisArg, args).finally(blockResponse);
        }
        return new Promise((resolve, reject) => {
            deferredBlocks.push(() => target.apply(thisArg, args).finally(blockResponse).then(resolve, reject));
        });
    }
    /**
     * Add to a promise.finally(blockResponse) to defer the response until all blocking calls are finished.
     */
    async function blockResponse() {
        return blockingCalls.size ? new Promise(r => deferredResponses.push(r)) : Promise.resolve();
    }
    /**
     * Blocks the execution of new actions until the given promise is resolved or rejected.
     */
    async function addBlockingPromise(promise) {
        blockingCalls.add(promise);
        promise.finally(() => {
            blockingCalls.delete(promise);
            if (!blockingCalls.size)
                process();
        });
        return promise;
    }
    /**
     * Process deferred calls and responses, pausing when blocked again.
     */
    async function process() {
        await afterAll();
        while (!blockingCalls.size && (deferredResponses.length || deferredBlocks.length)) {
            (deferredResponses.length ? deferredResponses : deferredBlocks).shift()();
            await afterAll();
        }
    }
    /**
     * Allows functions to act as decorators as well as simple wrapping functions. If a descriptor is passed, it is
     * assumed to be a decorator, otherwise it is assumed to be a wrapping function.
     */
    function makeDecoratable(wrapper) {
        function decoratable(target, _propertyKey, descriptor) {
            const origFunc = (descriptor && descriptor.value) || target;
            if (typeof origFunc !== 'function')
                throw new TypeError('Blocking method wrappers can only be used on functions');
            const wrapped = wrapper(origFunc);
            if (descriptor) {
                descriptor.value = wrapped;
            }
            else {
                return wrapped;
            }
        }
        return decoratable;
    }
    /**
     * Reset for testing.
     */
    function reset() {
        blockingCalls.clear();
        deferredResponses.length = 0;
        deferredBlocks.length = 0;
    }
}
async function tick() {
    await Promise.resolve();
}
async function afterAll() {
    for (let i = 0; i < 10; i++)
        await tick();
}
//# sourceMappingURL=concurrency.js.map