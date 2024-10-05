// Copyright 2018-2024 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
/** Options for {@linkcode delay}. */ /**
 * Resolve a {@linkcode Promise} after a given amount of milliseconds.
 *
 * @example
 * ```ts
 * import { delay } from "https://deno.land/std@$STD_VERSION/async/delay.ts";
 *
 * // ...
 * const delayedPromise = delay(100);
 * const result = await delayedPromise;
 * // ...
 * ```
 *
 * To allow the process to continue to run as long as the timer exists.
 *
 * ```ts
 * import { delay } from "https://deno.land/std@$STD_VERSION/async/delay.ts";
 *
 * // ...
 * await delay(100, { persistent: false });
 * // ...
 * ```
 */ export function delay(ms, options = {}) {
  const { signal, persistent = true } = options;
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject)=>{
    const abort = ()=>{
      clearTimeout(i);
      reject(signal?.reason);
    };
    const done = ()=>{
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const i = setTimeout(done, ms);
    signal?.addEventListener("abort", abort, {
      once: true
    });
    if (persistent === false) {
      try {
        // @ts-ignore For browser compatibility
        Deno.unrefTimer(i);
      } catch (error) {
        if (!(error instanceof ReferenceError)) {
          throw error;
        }
        console.error("`persistent` option is only available in Deno");
      }
    }
  });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIyNC4wL2FzeW5jL2RlbGF5LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjQgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBUaGlzIG1vZHVsZSBpcyBicm93c2VyIGNvbXBhdGlibGUuXG5cbi8qKiBPcHRpb25zIGZvciB7QGxpbmtjb2RlIGRlbGF5fS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRGVsYXlPcHRpb25zIHtcbiAgLyoqIFNpZ25hbCB1c2VkIHRvIGFib3J0IHRoZSBkZWxheS4gKi9cbiAgc2lnbmFsPzogQWJvcnRTaWduYWw7XG4gIC8qKiBJbmRpY2F0ZXMgd2hldGhlciB0aGUgcHJvY2VzcyBzaG91bGQgY29udGludWUgdG8gcnVuIGFzIGxvbmcgYXMgdGhlIHRpbWVyIGV4aXN0cy5cbiAgICpcbiAgICogQGRlZmF1bHQge3RydWV9XG4gICAqL1xuICBwZXJzaXN0ZW50PzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXNvbHZlIGEge0BsaW5rY29kZSBQcm9taXNlfSBhZnRlciBhIGdpdmVuIGFtb3VudCBvZiBtaWxsaXNlY29uZHMuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBkZWxheSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2FzeW5jL2RlbGF5LnRzXCI7XG4gKlxuICogLy8gLi4uXG4gKiBjb25zdCBkZWxheWVkUHJvbWlzZSA9IGRlbGF5KDEwMCk7XG4gKiBjb25zdCByZXN1bHQgPSBhd2FpdCBkZWxheWVkUHJvbWlzZTtcbiAqIC8vIC4uLlxuICogYGBgXG4gKlxuICogVG8gYWxsb3cgdGhlIHByb2Nlc3MgdG8gY29udGludWUgdG8gcnVuIGFzIGxvbmcgYXMgdGhlIHRpbWVyIGV4aXN0cy5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgZGVsYXkgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9hc3luYy9kZWxheS50c1wiO1xuICpcbiAqIC8vIC4uLlxuICogYXdhaXQgZGVsYXkoMTAwLCB7IHBlcnNpc3RlbnQ6IGZhbHNlIH0pO1xuICogLy8gLi4uXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlbGF5KG1zOiBudW1iZXIsIG9wdGlvbnM6IERlbGF5T3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHsgc2lnbmFsLCBwZXJzaXN0ZW50ID0gdHJ1ZSB9ID0gb3B0aW9ucztcbiAgaWYgKHNpZ25hbD8uYWJvcnRlZCkgcmV0dXJuIFByb21pc2UucmVqZWN0KHNpZ25hbC5yZWFzb24pO1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IGFib3J0ID0gKCkgPT4ge1xuICAgICAgY2xlYXJUaW1lb3V0KGkpO1xuICAgICAgcmVqZWN0KHNpZ25hbD8ucmVhc29uKTtcbiAgICB9O1xuICAgIGNvbnN0IGRvbmUgPSAoKSA9PiB7XG4gICAgICBzaWduYWw/LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBhYm9ydCk7XG4gICAgICByZXNvbHZlKCk7XG4gICAgfTtcbiAgICBjb25zdCBpID0gc2V0VGltZW91dChkb25lLCBtcyk7XG4gICAgc2lnbmFsPy5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgYWJvcnQsIHsgb25jZTogdHJ1ZSB9KTtcbiAgICBpZiAocGVyc2lzdGVudCA9PT0gZmFsc2UpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIEB0cy1pZ25vcmUgRm9yIGJyb3dzZXIgY29tcGF0aWJpbGl0eVxuICAgICAgICBEZW5vLnVucmVmVGltZXIoaSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoIShlcnJvciBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJgcGVyc2lzdGVudGAgb3B0aW9uIGlzIG9ubHkgYXZhaWxhYmxlIGluIERlbm9cIik7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUscUNBQXFDO0FBRXJDLG1DQUFtQyxHQVduQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQXNCQyxHQUNELE9BQU8sU0FBUyxNQUFNLEVBQVUsRUFBRSxVQUF3QixDQUFDLENBQUM7RUFDMUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxhQUFhLElBQUksRUFBRSxHQUFHO0VBQ3RDLElBQUksUUFBUSxTQUFTLE9BQU8sUUFBUSxNQUFNLENBQUMsT0FBTyxNQUFNO0VBQ3hELE9BQU8sSUFBSSxRQUFRLENBQUMsU0FBUztJQUMzQixNQUFNLFFBQVE7TUFDWixhQUFhO01BQ2IsT0FBTyxRQUFRO0lBQ2pCO0lBQ0EsTUFBTSxPQUFPO01BQ1gsUUFBUSxvQkFBb0IsU0FBUztNQUNyQztJQUNGO0lBQ0EsTUFBTSxJQUFJLFdBQVcsTUFBTTtJQUMzQixRQUFRLGlCQUFpQixTQUFTLE9BQU87TUFBRSxNQUFNO0lBQUs7SUFDdEQsSUFBSSxlQUFlLE9BQU87TUFDeEIsSUFBSTtRQUNGLHVDQUF1QztRQUN2QyxLQUFLLFVBQVUsQ0FBQztNQUNsQixFQUFFLE9BQU8sT0FBTztRQUNkLElBQUksQ0FBQyxDQUFDLGlCQUFpQixjQUFjLEdBQUc7VUFDdEMsTUFBTTtRQUNSO1FBQ0EsUUFBUSxLQUFLLENBQUM7TUFDaEI7SUFDRjtFQUNGO0FBQ0YifQ==