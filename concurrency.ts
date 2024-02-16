/**
 * Returns methods for implementing
 */
export function simplifiedConcurrency() {
  const blockingCalls = new Set<Promise<unknown>>();
  const deferredBlocks: Array<() => {}> = [];
  const deferredResponses: Array<() => {}> = [];

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
     * Block while waiting for the promise or callback to resolve.
     */
    blockWhile,

    /**
     * Block the promise or callback from resolving until all blocking calls are finished.
     */
    blockResponse,

    /**
     * Block the given function from executing until all blocking calls are finished.
     */
    blockFunction,

    /** Internal function to reset everything for testing */
    reset,
  };

  /**
   * Wrap a function which is blockable.
   */
  function blockable<T extends Function>(target: T): T {
    return function (this: any, ...args: any[]) {
      return blockFunction(target, args, this);
    } as unknown as T;
  }

  /**
   * Wrap a function which returns a response which is blockable (e.g. fetch).
   */
  function blockableResponse<T extends Function>(target: T): T {
    return function (this: any, ...args: any[]) {
      return blockResponse(target.apply(this, args));
    } as unknown as T;
  }

  /**
   * Wrap a function which blocks.
   */
  function blocking<T extends Function>(target: T): T {
    return function (this: any, ...args: any[]) {
      return blockWhile(target.apply(this, args));
    } as unknown as T;
  }

  /**
   * Blocks the execution of this function until there are no more blocking calls in progress.
   */
  async function blockFunction(target: Function, args: any[], thisArg?: any) {
    if (!blockingCalls.size) {
      return blockResponse(target.apply(thisArg, args));
    }
    return new Promise((resolve, reject) => {
      deferredBlocks.push(() => blockResponse(target.apply(thisArg, args)).then(resolve, reject));
    });
  }

  /**
   * Block the promise or callback from resolving until all blocking calls are finished.
   */
  async function blockResponse<T>(callbackOrPromise: Promise<T> | ((...args: any[]) => Promise<T>)) {
    let promise = callbackOrPromise as Promise<T>;
    if (typeof callbackOrPromise === 'function' && typeof promise.then !== 'function') {
      promise = callbackOrPromise();
    }
    return promise.finally(() =>
      blockingCalls.size ? new Promise(r => deferredResponses.push(r as any)) : Promise.resolve()
    );
  }

  /**
   * Blocks the execution of new actions until the given promise/callback is resolved or rejected.
   */
  async function blockWhile<T>(callbackOrPromise: Promise<T> | ((...args: any[]) => Promise<T>)) {
    let promise = callbackOrPromise as Promise<T>;
    if (typeof callbackOrPromise === 'function' && typeof promise.then !== 'function') {
      promise = callbackOrPromise();
    }
    blockingCalls.add(promise);
    promise.finally(() => {
      blockingCalls.delete(promise);
      if (!blockingCalls.size) process();
    });
    return promise;
  }

  /**
   * Process deferred calls and responses, pausing when blocked again.
   */
  async function process() {
    await afterAll();
    while (!blockingCalls.size && (deferredResponses.length || deferredBlocks.length)) {
      (deferredResponses.length ? deferredResponses : deferredBlocks).shift()!();
      await afterAll();
    }
  }

  /**
   * Allows functions to act as decorators as well as simple wrapping functions. If a descriptor is passed, it is
   * assumed to be a decorator, otherwise it is assumed to be a wrapping function.
   */
  function makeDecoratable<T extends Function>(wrapper: T) {
    function decoratable<T extends Function>(target: T): T;
    function decoratable(target: any, propertyKey: string, descriptor: PropertyDescriptor): void;
    function decoratable(target: any, _propertyKey?: string, descriptor?: PropertyDescriptor) {
      const origFunc = (descriptor && descriptor.value) || target;
      if (typeof origFunc !== 'function') throw new TypeError('Blocking method wrappers can only be used on functions');
      const wrapped = wrapper(origFunc);

      if (descriptor) {
        descriptor.value = wrapped;
      } else {
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
  for (let i = 0; i < 10; i++) await tick();
}
