Simplify concurrency using the strategies described in
https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/ using input gates and output gates by
allowing certain actions to block other actions or to block the responses of other actions.
To "block" an action or response means to defer it until after the blocking actions have been processed. This
allows the state of an object to be consistent and avoid race conditions which may be hard to discover.
It is a good idea to use this in conjunction with a cache for blockable actions (e.g. a storage mechanism) to ensure
the blocking doesn't slow down the system.

Definitions:

- "blockable" methods won't execute until after being unblocked. They will be deferred to run afterwards.
- "blockableResponse" methods will execute but won't deliver a response until after being unblocked.
- "blocking" methods will block blockable calls and responses.

In the article linked above, `this.storage.get` and `this.storage.put` are blocking, `fetch` has a blockable
response, and `this.getUniqueNumber()` is a blockable method.

Note that blockable methods also have blockable responses. I.E. if you return a response while a storage operation is in
progress, the response will return after the storage operation completes. If the storage operation fails, the
response will be the error of the storage operation.

Usage - with decorators (recommended):

```ts
import { simplifiedConcurrency } from 'simplified-concurrency';

const { blockable, blocking, blockableResponse } = simplifiedConcurrency();

class MyDurableObject {
  storage: Storage;

  constructor() {
    this.storage = new Storage();
  }

  @blockable
  async getUniqueNumber() {
    await this.fetch("https://example.com/api1");
    let val = await this.storage.get("counter");
    this.storage.put("counter", val + 1);
    return val;
  }

  @blockableResponse
  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    return fetch(input, init);
  }
}

// Simple storage with cache
class Storage {
  cache: Map<string, any>;

  constructor() {
    this.cache = new Map();
  }

  @blocking
  async get(key) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    } else {
      // if fetch is used in a blocking method, be sure to use the global fetch and not the blockable-response fetch
      // provided which would never return since it is blocked by the method calling it.
      const response = await fetch(BACKEND_URL + key);
      return await response.json();
    }
  }

  @blocking
  async put(key, value) {
    this.cache.set(key, value);

    const response = await fetch(BACKEND_URL + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }},
      body: JSON.stringify(value)
    });

    return await response.json();
  }
}
```

These APIs work in the browser and in Node.js as they are just plain JavaScript promises.
