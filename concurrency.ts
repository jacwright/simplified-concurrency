/**
 * Returns methods for implementing
 */
export function simplifiedConcurrency() {
  const blockingCalls = new Set<number>();
  const callsJustBlocked = new Map<number, Promise<any>>();
  const deferred: Function[] = [];
  let call = 0;

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

    /**
     * Defers the response of this call if a blocking call is in progress.
     */
    deferResponse,

    /**
     * Reset for testing.
     */
    reset,
  };

  /**
   * Wrap a function which is blockable.
   */
  function blockable<T extends Function>(target: T): T {
    return function (this: any, ...args: any[]) {
      if (!blockingCalls.size) {
        return target.apply(this, args).then(outputGate);
      } else {
        return new Promise((resolve, reject) => {
          deferred.push(() => target.apply(this, args).then(outputGate).then(resolve, reject));
        });
      }
    } as unknown as T;
  }

  /**
   * Wrap a function which returns a response which is blockable (e.g. fetch).
   */
  function blockableResponse<T extends Function>(target: T): T {
    return function (this: any, ...args: any[]) {
      return deferResponse(target.apply(this, args));
    } as unknown as T;
  }

  /**
   * Wrap a function which blocks.
   */
  function blocking<T extends Function>(target: T): T {
    return function (this: any, ...args: any[]) {
      return blockFor(target.apply(this, args));
    } as unknown as T;
  }

  /**
   * Block while waiting for the callback to resolve.
   */
  async function blockWhile(callback: Function): Promise<any> {
    return blockFor(callback());
  }

  /**
   * Defers the response of this call if a blocking call is in progress.
   */
  function deferResponse<T>(promise: Promise<T>): Promise<T> {
    return promise.then(onFulfilled, onRejected);
  }

  /**
   * Blocks the execution of new actions until the given promise is resolved or rejected.
   */
  async function blockFor<T>(promise: Promise<T>) {
    const thisCall = ++call;
    blockingCalls.add(thisCall);
    callsJustBlocked.set(thisCall, promise);
    afterAll().then(() => callsJustBlocked.delete(thisCall));

    function finish() {
      if (!blockingCalls.has(thisCall)) return;
      blockingCalls.delete(thisCall);
      callsJustBlocked.delete(thisCall);
      if (!blockingCalls.size) afterAll().then(process);
    }

    let response: any;
    try {
      response = await promise;
    } catch (e) {
      finish();
      throw e;
    }
    finish();
    return response;
  }

  /**
   * Called when a promise is resolved, defers the response if a blocking call is in progress.
   */
  function onFulfilled(result: any) {
    if (blockingCalls.size) {
      return new Promise(resolve => deferred.push(() => resolve(result)));
    } else {
      return result;
    }
  }

  /**
   * Called when a promise is rejected, defers the response if a blocking call is in progress.
   */
  function onRejected(reason: any) {
    if (blockingCalls.size) {
      return new Promise((resolve, reject) => deferred.push(() => reject(reason)));
    } else {
      return Promise.reject(reason);
    }
  }

  /**
   * Process deferred calls and responses, pausing when blocked again.
   */
  function process() {
    while (!blockingCalls.size && deferred.length) {
      deferred.shift()!();
    }
  }

  /**
   * Allows functions to act as decorators as well as simple wrapping functions. If a descriptor is passed, it is
   * assumed to be a decorator, otherwise it is assumed to be a wrapping function.
   */
  function makeDecoratable<T extends Function>(wrapper: T) {
    function decoratable<T extends Function>(target: T): T;
    function decoratable(target: any, propertyKey: string, descriptor: PropertyDescriptor): void;
    function decoratable(target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
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
   * Don't let a blockable function return its result until all blocking calls it initiated are finished.
   */
  function outputGate(result: any) {
    if (callsJustBlocked.size) {
      const promises = Array.from(callsJustBlocked.values());
      callsJustBlocked.forEach((promise, call) => blockingCalls.delete(call));
      callsJustBlocked.clear();
      afterAll().then(process);
      return Promise.all(promises).then(() => result);
    } else {
      return result;
    }
  }

  /**
   * Reset for testing.
   */
  function reset() {
    blockingCalls.clear();
    callsJustBlocked.clear();
    deferred.length = 0;
    call = 0;
  }
}

function tick() {
  return Promise.resolve();
}

async function afterAll() {
  for (let i = 0; i < 10; i++) await tick();
}
