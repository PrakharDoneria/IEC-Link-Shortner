// Copyright 2018-2024 the Deno authors. All rights reserved. MIT license.
import { delay } from "../async/delay.ts";
/** Thrown by Server after it has been closed. */ const ERROR_SERVER_CLOSED = "Server closed";
/** Default port for serving HTTP. */ const HTTP_PORT = 80;
/** Default port for serving HTTPS. */ const HTTPS_PORT = 443;
/** Initial backoff delay of 5ms following a temporary accept failure. */ const INITIAL_ACCEPT_BACKOFF_DELAY = 5;
/** Max backoff delay of 1s following a temporary accept failure. */ const MAX_ACCEPT_BACKOFF_DELAY = 1000;
/**
 * Used to construct an HTTP server.
 *
 * @deprecated This will be removed in 1.0.0. Use {@linkcode Deno.serve} instead.
 */ export class Server {
  #port;
  #host;
  #handler;
  #closed = false;
  #listeners = new Set();
  #acceptBackoffDelayAbortController = new AbortController();
  #httpConnections = new Set();
  #onError;
  /**
   * Constructs a new HTTP Server instance.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   * ```
   *
   * @param serverInit Options for running an HTTP server.
   */ constructor(serverInit){
    this.#port = serverInit.port;
    this.#host = serverInit.hostname;
    this.#handler = serverInit.handler;
    this.#onError = serverInit.onError ?? function(error) {
      console.error(error);
      return new Response("Internal Server Error", {
        status: 500
      });
    };
  }
  /**
   * Accept incoming connections on the given listener, and handle requests on
   * these connections with the given handler.
   *
   * HTTP/2 support is only enabled if the provided Deno.Listener returns TLS
   * connections and was configured with "h2" in the ALPN protocols.
   *
   * Throws a server closed error if called after the server has been closed.
   *
   * Will always close the created listener.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ handler });
   * const listener = Deno.listen({ port: 4505 });
   *
   * console.log("server listening on http://localhost:4505");
   *
   * await server.serve(listener);
   * ```
   *
   * @param listener The listener to accept connections from.
   */ async serve(listener) {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    this.#trackListener(listener);
    try {
      return await this.#accept(listener);
    } finally{
      this.#untrackListener(listener);
      try {
        listener.close();
      } catch  {
      // Listener has already been closed.
      }
    }
  }
  /**
   * Create a listener on the server, accept incoming connections, and handle
   * requests on these connections with the given handler.
   *
   * If the server was constructed without a specified port, 80 is used.
   *
   * If the server was constructed with the hostname omitted from the options, the
   * non-routable meta-address `0.0.0.0` is used.
   *
   * Throws a server closed error if the server has been closed.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   *
   * console.log("server listening on http://localhost:4505");
   *
   * await server.listenAndServe();
   * ```
   */ async listenAndServe() {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    const listener = Deno.listen({
      port: this.#port ?? HTTP_PORT,
      hostname: this.#host ?? "0.0.0.0",
      transport: "tcp"
    });
    return await this.serve(listener);
  }
  /**
   * Create a listener on the server, accept incoming connections, upgrade them
   * to TLS, and handle requests on these connections with the given handler.
   *
   * If the server was constructed without a specified port, 443 is used.
   *
   * If the server was constructed with the hostname omitted from the options, the
   * non-routable meta-address `0.0.0.0` is used.
   *
   * Throws a server closed error if the server has been closed.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   *
   * const certFile = "/path/to/certFile.crt";
   * const keyFile = "/path/to/keyFile.key";
   *
   * console.log("server listening on https://localhost:4505");
   *
   * await server.listenAndServeTls(certFile, keyFile);
   * ```
   *
   * @param certFile The path to the file containing the TLS certificate.
   * @param keyFile The path to the file containing the TLS private key.
   */ async listenAndServeTls(certFile, keyFile) {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    const listener = Deno.listenTls({
      port: this.#port ?? HTTPS_PORT,
      hostname: this.#host ?? "0.0.0.0",
      cert: Deno.readTextFileSync(certFile),
      key: Deno.readTextFileSync(keyFile),
      transport: "tcp"
    });
    return await this.serve(listener);
  }
  /**
   * Immediately close the server listeners and associated HTTP connections.
   *
   * Throws a server closed error if called after the server has been closed.
   */ close() {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    this.#closed = true;
    for (const listener of this.#listeners){
      try {
        listener.close();
      } catch  {
      // Listener has already been closed.
      }
    }
    this.#listeners.clear();
    this.#acceptBackoffDelayAbortController.abort();
    for (const httpConn of this.#httpConnections){
      this.#closeHttpConn(httpConn);
    }
    this.#httpConnections.clear();
  }
  /** Get whether the server is closed. */ get closed() {
    return this.#closed;
  }
  /** Get the list of network addresses the server is listening on. */ get addrs() {
    return Array.from(this.#listeners).map((listener)=>listener.addr);
  }
  /**
   * Responds to an HTTP request.
   *
   * @param requestEvent The HTTP request to respond to.
   * @param connInfo Information about the underlying connection.
   */ async #respond(requestEvent, connInfo) {
    let response;
    try {
      // Handle the request event, generating a response.
      response = await this.#handler(requestEvent.request, connInfo);
      if (response.bodyUsed && response.body !== null) {
        throw new TypeError("Response body already consumed.");
      }
    } catch (error) {
      // Invoke onError handler when request handler throws.
      response = await this.#onError(error);
    }
    try {
      // Send the response.
      await requestEvent.respondWith(response);
    } catch  {
    // `respondWith()` can throw for various reasons, including downstream and
    // upstream connection errors, as well as errors thrown during streaming
    // of the response content.  In order to avoid false negatives, we ignore
    // the error here and let `serveHttp` close the connection on the
    // following iteration if it is in fact a downstream connection error.
    }
  }
  /**
   * Serves all HTTP requests on a single connection.
   *
   * @param httpConn The HTTP connection to yield requests from.
   * @param connInfo Information about the underlying connection.
   */ async #serveHttp(httpConn, connInfo) {
    while(!this.#closed){
      let requestEvent;
      try {
        // Yield the new HTTP request on the connection.
        requestEvent = await httpConn.nextRequest();
      } catch  {
        break;
      }
      if (requestEvent === null) {
        break;
      }
      // Respond to the request. Note we do not await this async method to
      // allow the connection to handle multiple requests in the case of h2.
      this.#respond(requestEvent, connInfo);
    }
    this.#closeHttpConn(httpConn);
  }
  /**
   * Accepts all connections on a single network listener.
   *
   * @param listener The listener to accept connections from.
   */ async #accept(listener) {
    let acceptBackoffDelay;
    while(!this.#closed){
      let conn;
      try {
        // Wait for a new connection.
        conn = await listener.accept();
      } catch (error) {
        if (// The listener is closed.
        error instanceof Deno.errors.BadResource || // TLS handshake errors.
        error instanceof Deno.errors.InvalidData || error instanceof Deno.errors.UnexpectedEof || error instanceof Deno.errors.ConnectionReset || error instanceof Deno.errors.NotConnected) {
          // Backoff after transient errors to allow time for the system to
          // recover, and avoid blocking up the event loop with a continuously
          // running loop.
          if (!acceptBackoffDelay) {
            acceptBackoffDelay = INITIAL_ACCEPT_BACKOFF_DELAY;
          } else {
            acceptBackoffDelay *= 2;
          }
          if (acceptBackoffDelay >= MAX_ACCEPT_BACKOFF_DELAY) {
            acceptBackoffDelay = MAX_ACCEPT_BACKOFF_DELAY;
          }
          try {
            await delay(acceptBackoffDelay, {
              signal: this.#acceptBackoffDelayAbortController.signal
            });
          } catch (err) {
            // The backoff delay timer is aborted when closing the server.
            if (!(err instanceof DOMException && err.name === "AbortError")) {
              throw err;
            }
          }
          continue;
        }
        throw error;
      }
      acceptBackoffDelay = undefined;
      // "Upgrade" the network connection into an HTTP connection.
      let httpConn;
      try {
        // deno-lint-ignore no-deprecated-deno-api
        httpConn = Deno.serveHttp(conn);
      } catch  {
        continue;
      }
      // Closing the underlying listener will not close HTTP connections, so we
      // track for closure upon server close.
      this.#trackHttpConnection(httpConn);
      const connInfo = {
        localAddr: conn.localAddr,
        remoteAddr: conn.remoteAddr
      };
      // Serve the requests that arrive on the just-accepted connection. Note
      // we do not await this async method to allow the server to accept new
      // connections.
      this.#serveHttp(httpConn, connInfo);
    }
  }
  /**
   * Untracks and closes an HTTP connection.
   *
   * @param httpConn The HTTP connection to close.
   */ #closeHttpConn(httpConn) {
    this.#untrackHttpConnection(httpConn);
    try {
      httpConn.close();
    } catch  {
    // Connection has already been closed.
    }
  }
  /**
   * Adds the listener to the internal tracking list.
   *
   * @param listener Listener to track.
   */ #trackListener(listener) {
    this.#listeners.add(listener);
  }
  /**
   * Removes the listener from the internal tracking list.
   *
   * @param listener Listener to untrack.
   */ #untrackListener(listener) {
    this.#listeners.delete(listener);
  }
  /**
   * Adds the HTTP connection to the internal tracking list.
   *
   * @param httpConn HTTP connection to track.
   */ #trackHttpConnection(httpConn) {
    this.#httpConnections.add(httpConn);
  }
  /**
   * Removes the HTTP connection from the internal tracking list.
   *
   * @param httpConn HTTP connection to untrack.
   */ #untrackHttpConnection(httpConn) {
    this.#httpConnections.delete(httpConn);
  }
}
/**
 * Constructs a server, accepts incoming connections on the given listener, and
 * handles requests on these connections with the given handler.
 *
 * ```ts
 * import { serveListener } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 *
 * const listener = Deno.listen({ port: 4505 });
 *
 * console.log("server listening on http://localhost:4505");
 *
 * await serveListener(listener, (request) => {
 *   const body = `Your user-agent is:\n\n${request.headers.get(
 *     "user-agent",
 *   ) ?? "Unknown"}`;
 *
 *   return new Response(body, { status: 200 });
 * });
 * ```
 *
 * @param listener The listener to accept connections from.
 * @param handler The handler for individual HTTP requests.
 * @param options Optional serve options.
 *
 * @deprecated This will be removed in 1.0.0. Use {@linkcode Deno.serve} instead.
 */ export async function serveListener(listener, handler, options) {
  const server = new Server({
    handler,
    onError: options?.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  return await server.serve(listener);
}
function hostnameForDisplay(hostname) {
  // If the hostname is "0.0.0.0", we display "localhost" in console
  // because browsers in Windows don't resolve "0.0.0.0".
  // See the discussion in https://github.com/denoland/deno_std/issues/1165
  return hostname === "0.0.0.0" ? "localhost" : hostname;
}
/**
 * Serves HTTP requests with the given handler.
 *
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8000 on hostname "0.0.0.0".
 *
 * The below example serves with the port 8000.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"));
 * ```
 *
 * You can change the listening address by the `hostname` and `port` options.
 * The below example serves with the port 3000.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), { port: 3000 });
 * ```
 *
 * `serve` function prints the message `Listening on http://<hostname>:<port>/`
 * on start-up by default. If you like to change this message, you can specify
 * `onListen` option to override it.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), {
 *   onListen({ port, hostname }) {
 *     console.log(`Server started at http://${hostname}:${port}`);
 *     // ... more info specific to your server ..
 *   },
 * });
 * ```
 *
 * You can also specify `undefined` or `null` to stop the logging behavior.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), { onListen: undefined });
 * ```
 *
 * @param handler The handler for individual HTTP requests.
 * @param options The options. See `ServeInit` documentation for details.
 *
 * @deprecated This will be removed in 1.0.0. Use {@linkcode Deno.serve} instead.
 */ export async function serve(handler, options = {}) {
  let port = options.port ?? 8000;
  if (typeof port !== "number") {
    port = Number(port);
  }
  const hostname = options.hostname ?? "0.0.0.0";
  const server = new Server({
    port,
    hostname,
    handler,
    onError: options.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  const listener = Deno.listen({
    port,
    hostname,
    transport: "tcp"
  });
  const s = server.serve(listener);
  port = server.addrs[0].port;
  if ("onListen" in options) {
    options.onListen?.({
      port,
      hostname
    });
  } else {
    console.log(`Listening on http://${hostnameForDisplay(hostname)}:${port}/`);
  }
  return await s;
}
/**
 * Serves HTTPS requests with the given handler.
 *
 * You must specify `key` or `keyFile` and `cert` or `certFile` options.
 *
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8443 on hostname "0.0.0.0".
 *
 * The below example serves with the default port 8443.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 *
 * const cert = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n";
 * const key = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n";
 * serveTls((_req) => new Response("Hello, world"), { cert, key });
 *
 * // Or
 *
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), { certFile, keyFile });
 * ```
 *
 * `serveTls` function prints the message `Listening on https://<hostname>:<port>/`
 * on start-up by default. If you like to change this message, you can specify
 * `onListen` option to override it.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), {
 *   certFile,
 *   keyFile,
 *   onListen({ port, hostname }) {
 *     console.log(`Server started at https://${hostname}:${port}`);
 *     // ... more info specific to your server ..
 *   },
 * });
 * ```
 *
 * You can also specify `undefined` or `null` to stop the logging behavior.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), {
 *   certFile,
 *   keyFile,
 *   onListen: undefined,
 * });
 * ```
 *
 * @param handler The handler for individual HTTPS requests.
 * @param options The options. See `ServeTlsInit` documentation for details.
 * @returns
 *
 * @deprecated This will be removed in 1.0.0. Use {@linkcode Deno.serve} instead.
 */ export async function serveTls(handler, options) {
  if (!options.key && !options.keyFile) {
    throw new Error("TLS config is given, but 'key' is missing.");
  }
  if (!options.cert && !options.certFile) {
    throw new Error("TLS config is given, but 'cert' is missing.");
  }
  let port = options.port ?? 8443;
  if (typeof port !== "number") {
    port = Number(port);
  }
  const hostname = options.hostname ?? "0.0.0.0";
  const server = new Server({
    port,
    hostname,
    handler,
    onError: options.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  // deno-lint-ignore no-sync-fn-in-async-fn
  const key = options.key || Deno.readTextFileSync(options.keyFile);
  // deno-lint-ignore no-sync-fn-in-async-fn
  const cert = options.cert || Deno.readTextFileSync(options.certFile);
  const listener = Deno.listenTls({
    port,
    hostname,
    cert,
    key,
    transport: "tcp"
  });
  const s = server.serve(listener);
  port = server.addrs[0].port;
  if ("onListen" in options) {
    options.onListen?.({
      port,
      hostname
    });
  } else {
    console.log(`Listening on https://${hostnameForDisplay(hostname)}:${port}/`);
  }
  return await s;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIyNC4wL2h0dHAvc2VydmVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjQgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5pbXBvcnQgeyBkZWxheSB9IGZyb20gXCIuLi9hc3luYy9kZWxheS50c1wiO1xuXG4vKiogVGhyb3duIGJ5IFNlcnZlciBhZnRlciBpdCBoYXMgYmVlbiBjbG9zZWQuICovXG5jb25zdCBFUlJPUl9TRVJWRVJfQ0xPU0VEID0gXCJTZXJ2ZXIgY2xvc2VkXCI7XG5cbi8qKiBEZWZhdWx0IHBvcnQgZm9yIHNlcnZpbmcgSFRUUC4gKi9cbmNvbnN0IEhUVFBfUE9SVCA9IDgwO1xuXG4vKiogRGVmYXVsdCBwb3J0IGZvciBzZXJ2aW5nIEhUVFBTLiAqL1xuY29uc3QgSFRUUFNfUE9SVCA9IDQ0MztcblxuLyoqIEluaXRpYWwgYmFja29mZiBkZWxheSBvZiA1bXMgZm9sbG93aW5nIGEgdGVtcG9yYXJ5IGFjY2VwdCBmYWlsdXJlLiAqL1xuY29uc3QgSU5JVElBTF9BQ0NFUFRfQkFDS09GRl9ERUxBWSA9IDU7XG5cbi8qKiBNYXggYmFja29mZiBkZWxheSBvZiAxcyBmb2xsb3dpbmcgYSB0ZW1wb3JhcnkgYWNjZXB0IGZhaWx1cmUuICovXG5jb25zdCBNQVhfQUNDRVBUX0JBQ0tPRkZfREVMQVkgPSAxMDAwO1xuXG4vKipcbiAqIEluZm9ybWF0aW9uIGFib3V0IHRoZSBjb25uZWN0aW9uIGEgcmVxdWVzdCBhcnJpdmVkIG9uLlxuICpcbiAqIEBkZXByZWNhdGVkIFRoaXMgd2lsbCBiZSByZW1vdmVkIGluIDEuMC4wLiBVc2Uge0BsaW5rY29kZSBEZW5vLlNlcnZlSGFuZGxlckluZm99IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ29ubkluZm8ge1xuICAvKiogVGhlIGxvY2FsIGFkZHJlc3Mgb2YgdGhlIGNvbm5lY3Rpb24uICovXG4gIHJlYWRvbmx5IGxvY2FsQWRkcjogRGVuby5BZGRyO1xuICAvKiogVGhlIHJlbW90ZSBhZGRyZXNzIG9mIHRoZSBjb25uZWN0aW9uLiAqL1xuICByZWFkb25seSByZW1vdGVBZGRyOiBEZW5vLkFkZHI7XG59XG5cbi8qKlxuICogQSBoYW5kbGVyIGZvciBIVFRQIHJlcXVlc3RzLiBDb25zdW1lcyBhIHJlcXVlc3QgYW5kIGNvbm5lY3Rpb24gaW5mb3JtYXRpb25cbiAqIGFuZCByZXR1cm5zIGEgcmVzcG9uc2UuXG4gKlxuICogSWYgYSBoYW5kbGVyIHRocm93cywgdGhlIHNlcnZlciBjYWxsaW5nIHRoZSBoYW5kbGVyIHdpbGwgYXNzdW1lIHRoZSBpbXBhY3RcbiAqIG9mIHRoZSBlcnJvciBpcyBpc29sYXRlZCB0byB0aGUgaW5kaXZpZHVhbCByZXF1ZXN0LiBJdCB3aWxsIGNhdGNoIHRoZSBlcnJvclxuICogYW5kIGNsb3NlIHRoZSB1bmRlcmx5aW5nIGNvbm5lY3Rpb24uXG4gKlxuICogQGRlcHJlY2F0ZWQgVGhpcyB3aWxsIGJlIHJlbW92ZWQgaW4gMS4wLjAuIFVzZSB7QGxpbmtjb2RlIERlbm8uU2VydmVIYW5kbGVyfSBpbnN0ZWFkLlxuICovXG5leHBvcnQgdHlwZSBIYW5kbGVyID0gKFxuICByZXF1ZXN0OiBSZXF1ZXN0LFxuICBjb25uSW5mbzogQ29ubkluZm8sXG4pID0+IFJlc3BvbnNlIHwgUHJvbWlzZTxSZXNwb25zZT47XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgcnVubmluZyBhbiBIVFRQIHNlcnZlci5cbiAqXG4gKiBAZGVwcmVjYXRlZCBUaGlzIHdpbGwgYmUgcmVtb3ZlZCBpbiAxLjAuMC4gVXNlIHtAbGlua2NvZGUgRGVuby5TZXJ2ZUluaXR9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVySW5pdCBleHRlbmRzIFBhcnRpYWw8RGVuby5MaXN0ZW5PcHRpb25zPiB7XG4gIC8qKiBUaGUgaGFuZGxlciB0byBpbnZva2UgZm9yIGluZGl2aWR1YWwgSFRUUCByZXF1ZXN0cy4gKi9cbiAgaGFuZGxlcjogSGFuZGxlcjtcblxuICAvKipcbiAgICogVGhlIGhhbmRsZXIgdG8gaW52b2tlIHdoZW4gcm91dGUgaGFuZGxlcnMgdGhyb3cgYW4gZXJyb3IuXG4gICAqXG4gICAqIFRoZSBkZWZhdWx0IGVycm9yIGhhbmRsZXIgbG9ncyBhbmQgcmV0dXJucyB0aGUgZXJyb3IgaW4gSlNPTiBmb3JtYXQuXG4gICAqL1xuICBvbkVycm9yPzogKGVycm9yOiB1bmtub3duKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+O1xufVxuXG4vKipcbiAqIFVzZWQgdG8gY29uc3RydWN0IGFuIEhUVFAgc2VydmVyLlxuICpcbiAqIEBkZXByZWNhdGVkIFRoaXMgd2lsbCBiZSByZW1vdmVkIGluIDEuMC4wLiBVc2Uge0BsaW5rY29kZSBEZW5vLnNlcnZlfSBpbnN0ZWFkLlxuICovXG5leHBvcnQgY2xhc3MgU2VydmVyIHtcbiAgI3BvcnQ/OiBudW1iZXI7XG4gICNob3N0Pzogc3RyaW5nO1xuICAjaGFuZGxlcjogSGFuZGxlcjtcbiAgI2Nsb3NlZCA9IGZhbHNlO1xuICAjbGlzdGVuZXJzOiBTZXQ8RGVuby5MaXN0ZW5lcj4gPSBuZXcgU2V0KCk7XG4gICNhY2NlcHRCYWNrb2ZmRGVsYXlBYm9ydENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICNodHRwQ29ubmVjdGlvbnM6IFNldDxEZW5vLkh0dHBDb25uPiA9IG5ldyBTZXQoKTtcbiAgI29uRXJyb3I6IChlcnJvcjogdW5rbm93bikgPT4gUmVzcG9uc2UgfCBQcm9taXNlPFJlc3BvbnNlPjtcblxuICAvKipcbiAgICogQ29uc3RydWN0cyBhIG5ldyBIVFRQIFNlcnZlciBpbnN0YW5jZS5cbiAgICpcbiAgICogYGBgdHNcbiAgICogaW1wb3J0IHsgU2VydmVyIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9zZXJ2ZXIudHNcIjtcbiAgICpcbiAgICogY29uc3QgcG9ydCA9IDQ1MDU7XG4gICAqIGNvbnN0IGhhbmRsZXIgPSAocmVxdWVzdDogUmVxdWVzdCkgPT4ge1xuICAgKiAgIGNvbnN0IGJvZHkgPSBgWW91ciB1c2VyLWFnZW50IGlzOlxcblxcbiR7cmVxdWVzdC5oZWFkZXJzLmdldChcbiAgICogICAgXCJ1c2VyLWFnZW50XCIsXG4gICAqICAgKSA/PyBcIlVua25vd25cIn1gO1xuICAgKlxuICAgKiAgIHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwgeyBzdGF0dXM6IDIwMCB9KTtcbiAgICogfTtcbiAgICpcbiAgICogY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7IHBvcnQsIGhhbmRsZXIgfSk7XG4gICAqIGBgYFxuICAgKlxuICAgKiBAcGFyYW0gc2VydmVySW5pdCBPcHRpb25zIGZvciBydW5uaW5nIGFuIEhUVFAgc2VydmVyLlxuICAgKi9cbiAgY29uc3RydWN0b3Ioc2VydmVySW5pdDogU2VydmVySW5pdCkge1xuICAgIHRoaXMuI3BvcnQgPSBzZXJ2ZXJJbml0LnBvcnQ7XG4gICAgdGhpcy4jaG9zdCA9IHNlcnZlckluaXQuaG9zdG5hbWU7XG4gICAgdGhpcy4jaGFuZGxlciA9IHNlcnZlckluaXQuaGFuZGxlcjtcbiAgICB0aGlzLiNvbkVycm9yID0gc2VydmVySW5pdC5vbkVycm9yID8/XG4gICAgICBmdW5jdGlvbiAoZXJyb3I6IHVua25vd24pIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiwgeyBzdGF0dXM6IDUwMCB9KTtcbiAgICAgIH07XG4gIH1cblxuICAvKipcbiAgICogQWNjZXB0IGluY29taW5nIGNvbm5lY3Rpb25zIG9uIHRoZSBnaXZlbiBsaXN0ZW5lciwgYW5kIGhhbmRsZSByZXF1ZXN0cyBvblxuICAgKiB0aGVzZSBjb25uZWN0aW9ucyB3aXRoIHRoZSBnaXZlbiBoYW5kbGVyLlxuICAgKlxuICAgKiBIVFRQLzIgc3VwcG9ydCBpcyBvbmx5IGVuYWJsZWQgaWYgdGhlIHByb3ZpZGVkIERlbm8uTGlzdGVuZXIgcmV0dXJucyBUTFNcbiAgICogY29ubmVjdGlvbnMgYW5kIHdhcyBjb25maWd1cmVkIHdpdGggXCJoMlwiIGluIHRoZSBBTFBOIHByb3RvY29scy5cbiAgICpcbiAgICogVGhyb3dzIGEgc2VydmVyIGNsb3NlZCBlcnJvciBpZiBjYWxsZWQgYWZ0ZXIgdGhlIHNlcnZlciBoYXMgYmVlbiBjbG9zZWQuXG4gICAqXG4gICAqIFdpbGwgYWx3YXlzIGNsb3NlIHRoZSBjcmVhdGVkIGxpc3RlbmVyLlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBpbXBvcnQgeyBTZXJ2ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICAgKlxuICAgKiBjb25zdCBoYW5kbGVyID0gKHJlcXVlc3Q6IFJlcXVlc3QpID0+IHtcbiAgICogICBjb25zdCBib2R5ID0gYFlvdXIgdXNlci1hZ2VudCBpczpcXG5cXG4ke3JlcXVlc3QuaGVhZGVycy5nZXQoXG4gICAqICAgIFwidXNlci1hZ2VudFwiLFxuICAgKiAgICkgPz8gXCJVbmtub3duXCJ9YDtcbiAgICpcbiAgICogICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAgfSk7XG4gICAqIH07XG4gICAqXG4gICAqIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoeyBoYW5kbGVyIH0pO1xuICAgKiBjb25zdCBsaXN0ZW5lciA9IERlbm8ubGlzdGVuKHsgcG9ydDogNDUwNSB9KTtcbiAgICpcbiAgICogY29uc29sZS5sb2coXCJzZXJ2ZXIgbGlzdGVuaW5nIG9uIGh0dHA6Ly9sb2NhbGhvc3Q6NDUwNVwiKTtcbiAgICpcbiAgICogYXdhaXQgc2VydmVyLnNlcnZlKGxpc3RlbmVyKTtcbiAgICogYGBgXG4gICAqXG4gICAqIEBwYXJhbSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgdG8gYWNjZXB0IGNvbm5lY3Rpb25zIGZyb20uXG4gICAqL1xuICBhc3luYyBzZXJ2ZShsaXN0ZW5lcjogRGVuby5MaXN0ZW5lcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLiNjbG9zZWQpIHtcbiAgICAgIHRocm93IG5ldyBEZW5vLmVycm9ycy5IdHRwKEVSUk9SX1NFUlZFUl9DTE9TRUQpO1xuICAgIH1cblxuICAgIHRoaXMuI3RyYWNrTGlzdGVuZXIobGlzdGVuZXIpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLiNhY2NlcHQobGlzdGVuZXIpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLiN1bnRyYWNrTGlzdGVuZXIobGlzdGVuZXIpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBsaXN0ZW5lci5jbG9zZSgpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIExpc3RlbmVyIGhhcyBhbHJlYWR5IGJlZW4gY2xvc2VkLlxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBsaXN0ZW5lciBvbiB0aGUgc2VydmVyLCBhY2NlcHQgaW5jb21pbmcgY29ubmVjdGlvbnMsIGFuZCBoYW5kbGVcbiAgICogcmVxdWVzdHMgb24gdGhlc2UgY29ubmVjdGlvbnMgd2l0aCB0aGUgZ2l2ZW4gaGFuZGxlci5cbiAgICpcbiAgICogSWYgdGhlIHNlcnZlciB3YXMgY29uc3RydWN0ZWQgd2l0aG91dCBhIHNwZWNpZmllZCBwb3J0LCA4MCBpcyB1c2VkLlxuICAgKlxuICAgKiBJZiB0aGUgc2VydmVyIHdhcyBjb25zdHJ1Y3RlZCB3aXRoIHRoZSBob3N0bmFtZSBvbWl0dGVkIGZyb20gdGhlIG9wdGlvbnMsIHRoZVxuICAgKiBub24tcm91dGFibGUgbWV0YS1hZGRyZXNzIGAwLjAuMC4wYCBpcyB1c2VkLlxuICAgKlxuICAgKiBUaHJvd3MgYSBzZXJ2ZXIgY2xvc2VkIGVycm9yIGlmIHRoZSBzZXJ2ZXIgaGFzIGJlZW4gY2xvc2VkLlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBpbXBvcnQgeyBTZXJ2ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICAgKlxuICAgKiBjb25zdCBwb3J0ID0gNDUwNTtcbiAgICogY29uc3QgaGFuZGxlciA9IChyZXF1ZXN0OiBSZXF1ZXN0KSA9PiB7XG4gICAqICAgY29uc3QgYm9keSA9IGBZb3VyIHVzZXItYWdlbnQgaXM6XFxuXFxuJHtyZXF1ZXN0LmhlYWRlcnMuZ2V0KFxuICAgKiAgICBcInVzZXItYWdlbnRcIixcbiAgICogICApID8/IFwiVW5rbm93blwifWA7XG4gICAqXG4gICAqICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogMjAwIH0pO1xuICAgKiB9O1xuICAgKlxuICAgKiBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHsgcG9ydCwgaGFuZGxlciB9KTtcbiAgICpcbiAgICogY29uc29sZS5sb2coXCJzZXJ2ZXIgbGlzdGVuaW5nIG9uIGh0dHA6Ly9sb2NhbGhvc3Q6NDUwNVwiKTtcbiAgICpcbiAgICogYXdhaXQgc2VydmVyLmxpc3RlbkFuZFNlcnZlKCk7XG4gICAqIGBgYFxuICAgKi9cbiAgYXN5bmMgbGlzdGVuQW5kU2VydmUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuI2Nsb3NlZCkge1xuICAgICAgdGhyb3cgbmV3IERlbm8uZXJyb3JzLkh0dHAoRVJST1JfU0VSVkVSX0NMT1NFRCk7XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdGVuZXIgPSBEZW5vLmxpc3Rlbih7XG4gICAgICBwb3J0OiB0aGlzLiNwb3J0ID8/IEhUVFBfUE9SVCxcbiAgICAgIGhvc3RuYW1lOiB0aGlzLiNob3N0ID8/IFwiMC4wLjAuMFwiLFxuICAgICAgdHJhbnNwb3J0OiBcInRjcFwiLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2VydmUobGlzdGVuZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIGxpc3RlbmVyIG9uIHRoZSBzZXJ2ZXIsIGFjY2VwdCBpbmNvbWluZyBjb25uZWN0aW9ucywgdXBncmFkZSB0aGVtXG4gICAqIHRvIFRMUywgYW5kIGhhbmRsZSByZXF1ZXN0cyBvbiB0aGVzZSBjb25uZWN0aW9ucyB3aXRoIHRoZSBnaXZlbiBoYW5kbGVyLlxuICAgKlxuICAgKiBJZiB0aGUgc2VydmVyIHdhcyBjb25zdHJ1Y3RlZCB3aXRob3V0IGEgc3BlY2lmaWVkIHBvcnQsIDQ0MyBpcyB1c2VkLlxuICAgKlxuICAgKiBJZiB0aGUgc2VydmVyIHdhcyBjb25zdHJ1Y3RlZCB3aXRoIHRoZSBob3N0bmFtZSBvbWl0dGVkIGZyb20gdGhlIG9wdGlvbnMsIHRoZVxuICAgKiBub24tcm91dGFibGUgbWV0YS1hZGRyZXNzIGAwLjAuMC4wYCBpcyB1c2VkLlxuICAgKlxuICAgKiBUaHJvd3MgYSBzZXJ2ZXIgY2xvc2VkIGVycm9yIGlmIHRoZSBzZXJ2ZXIgaGFzIGJlZW4gY2xvc2VkLlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBpbXBvcnQgeyBTZXJ2ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICAgKlxuICAgKiBjb25zdCBwb3J0ID0gNDUwNTtcbiAgICogY29uc3QgaGFuZGxlciA9IChyZXF1ZXN0OiBSZXF1ZXN0KSA9PiB7XG4gICAqICAgY29uc3QgYm9keSA9IGBZb3VyIHVzZXItYWdlbnQgaXM6XFxuXFxuJHtyZXF1ZXN0LmhlYWRlcnMuZ2V0KFxuICAgKiAgICBcInVzZXItYWdlbnRcIixcbiAgICogICApID8/IFwiVW5rbm93blwifWA7XG4gICAqXG4gICAqICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogMjAwIH0pO1xuICAgKiB9O1xuICAgKlxuICAgKiBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHsgcG9ydCwgaGFuZGxlciB9KTtcbiAgICpcbiAgICogY29uc3QgY2VydEZpbGUgPSBcIi9wYXRoL3RvL2NlcnRGaWxlLmNydFwiO1xuICAgKiBjb25zdCBrZXlGaWxlID0gXCIvcGF0aC90by9rZXlGaWxlLmtleVwiO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhcInNlcnZlciBsaXN0ZW5pbmcgb24gaHR0cHM6Ly9sb2NhbGhvc3Q6NDUwNVwiKTtcbiAgICpcbiAgICogYXdhaXQgc2VydmVyLmxpc3RlbkFuZFNlcnZlVGxzKGNlcnRGaWxlLCBrZXlGaWxlKTtcbiAgICogYGBgXG4gICAqXG4gICAqIEBwYXJhbSBjZXJ0RmlsZSBUaGUgcGF0aCB0byB0aGUgZmlsZSBjb250YWluaW5nIHRoZSBUTFMgY2VydGlmaWNhdGUuXG4gICAqIEBwYXJhbSBrZXlGaWxlIFRoZSBwYXRoIHRvIHRoZSBmaWxlIGNvbnRhaW5pbmcgdGhlIFRMUyBwcml2YXRlIGtleS5cbiAgICovXG4gIGFzeW5jIGxpc3RlbkFuZFNlcnZlVGxzKGNlcnRGaWxlOiBzdHJpbmcsIGtleUZpbGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLiNjbG9zZWQpIHtcbiAgICAgIHRocm93IG5ldyBEZW5vLmVycm9ycy5IdHRwKEVSUk9SX1NFUlZFUl9DTE9TRUQpO1xuICAgIH1cblxuICAgIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW5UbHMoe1xuICAgICAgcG9ydDogdGhpcy4jcG9ydCA/PyBIVFRQU19QT1JULFxuICAgICAgaG9zdG5hbWU6IHRoaXMuI2hvc3QgPz8gXCIwLjAuMC4wXCIsXG4gICAgICBjZXJ0OiBEZW5vLnJlYWRUZXh0RmlsZVN5bmMoY2VydEZpbGUpLFxuICAgICAga2V5OiBEZW5vLnJlYWRUZXh0RmlsZVN5bmMoa2V5RmlsZSksXG4gICAgICB0cmFuc3BvcnQ6IFwidGNwXCIsXG4gICAgICAvLyBBTFBOIHByb3RvY29sIHN1cHBvcnQgbm90IHlldCBzdGFibGUuXG4gICAgICAvLyBhbHBuUHJvdG9jb2xzOiBbXCJoMlwiLCBcImh0dHAvMS4xXCJdLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2VydmUobGlzdGVuZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEltbWVkaWF0ZWx5IGNsb3NlIHRoZSBzZXJ2ZXIgbGlzdGVuZXJzIGFuZCBhc3NvY2lhdGVkIEhUVFAgY29ubmVjdGlvbnMuXG4gICAqXG4gICAqIFRocm93cyBhIHNlcnZlciBjbG9zZWQgZXJyb3IgaWYgY2FsbGVkIGFmdGVyIHRoZSBzZXJ2ZXIgaGFzIGJlZW4gY2xvc2VkLlxuICAgKi9cbiAgY2xvc2UoKSB7XG4gICAgaWYgKHRoaXMuI2Nsb3NlZCkge1xuICAgICAgdGhyb3cgbmV3IERlbm8uZXJyb3JzLkh0dHAoRVJST1JfU0VSVkVSX0NMT1NFRCk7XG4gICAgfVxuXG4gICAgdGhpcy4jY2xvc2VkID0gdHJ1ZTtcblxuICAgIGZvciAoY29uc3QgbGlzdGVuZXIgb2YgdGhpcy4jbGlzdGVuZXJzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBsaXN0ZW5lci5jbG9zZSgpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIExpc3RlbmVyIGhhcyBhbHJlYWR5IGJlZW4gY2xvc2VkLlxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuI2xpc3RlbmVycy5jbGVhcigpO1xuXG4gICAgdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5QWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cbiAgICBmb3IgKGNvbnN0IGh0dHBDb25uIG9mIHRoaXMuI2h0dHBDb25uZWN0aW9ucykge1xuICAgICAgdGhpcy4jY2xvc2VIdHRwQ29ubihodHRwQ29ubik7XG4gICAgfVxuXG4gICAgdGhpcy4jaHR0cENvbm5lY3Rpb25zLmNsZWFyKCk7XG4gIH1cblxuICAvKiogR2V0IHdoZXRoZXIgdGhlIHNlcnZlciBpcyBjbG9zZWQuICovXG4gIGdldCBjbG9zZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuI2Nsb3NlZDtcbiAgfVxuXG4gIC8qKiBHZXQgdGhlIGxpc3Qgb2YgbmV0d29yayBhZGRyZXNzZXMgdGhlIHNlcnZlciBpcyBsaXN0ZW5pbmcgb24uICovXG4gIGdldCBhZGRycygpOiBEZW5vLkFkZHJbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20odGhpcy4jbGlzdGVuZXJzKS5tYXAoKGxpc3RlbmVyKSA9PiBsaXN0ZW5lci5hZGRyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNwb25kcyB0byBhbiBIVFRQIHJlcXVlc3QuXG4gICAqXG4gICAqIEBwYXJhbSByZXF1ZXN0RXZlbnQgVGhlIEhUVFAgcmVxdWVzdCB0byByZXNwb25kIHRvLlxuICAgKiBAcGFyYW0gY29ubkluZm8gSW5mb3JtYXRpb24gYWJvdXQgdGhlIHVuZGVybHlpbmcgY29ubmVjdGlvbi5cbiAgICovXG4gIGFzeW5jICNyZXNwb25kKFxuICAgIHJlcXVlc3RFdmVudDogRGVuby5SZXF1ZXN0RXZlbnQsXG4gICAgY29ubkluZm86IENvbm5JbmZvLFxuICApIHtcbiAgICBsZXQgcmVzcG9uc2U6IFJlc3BvbnNlO1xuICAgIHRyeSB7XG4gICAgICAvLyBIYW5kbGUgdGhlIHJlcXVlc3QgZXZlbnQsIGdlbmVyYXRpbmcgYSByZXNwb25zZS5cbiAgICAgIHJlc3BvbnNlID0gYXdhaXQgdGhpcy4jaGFuZGxlcihyZXF1ZXN0RXZlbnQucmVxdWVzdCwgY29ubkluZm8pO1xuXG4gICAgICBpZiAocmVzcG9uc2UuYm9keVVzZWQgJiYgcmVzcG9uc2UuYm9keSAhPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUmVzcG9uc2UgYm9keSBhbHJlYWR5IGNvbnN1bWVkLlwiKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcjogdW5rbm93bikge1xuICAgICAgLy8gSW52b2tlIG9uRXJyb3IgaGFuZGxlciB3aGVuIHJlcXVlc3QgaGFuZGxlciB0aHJvd3MuXG4gICAgICByZXNwb25zZSA9IGF3YWl0IHRoaXMuI29uRXJyb3IoZXJyb3IpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAvLyBTZW5kIHRoZSByZXNwb25zZS5cbiAgICAgIGF3YWl0IHJlcXVlc3RFdmVudC5yZXNwb25kV2l0aChyZXNwb25zZSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBgcmVzcG9uZFdpdGgoKWAgY2FuIHRocm93IGZvciB2YXJpb3VzIHJlYXNvbnMsIGluY2x1ZGluZyBkb3duc3RyZWFtIGFuZFxuICAgICAgLy8gdXBzdHJlYW0gY29ubmVjdGlvbiBlcnJvcnMsIGFzIHdlbGwgYXMgZXJyb3JzIHRocm93biBkdXJpbmcgc3RyZWFtaW5nXG4gICAgICAvLyBvZiB0aGUgcmVzcG9uc2UgY29udGVudC4gIEluIG9yZGVyIHRvIGF2b2lkIGZhbHNlIG5lZ2F0aXZlcywgd2UgaWdub3JlXG4gICAgICAvLyB0aGUgZXJyb3IgaGVyZSBhbmQgbGV0IGBzZXJ2ZUh0dHBgIGNsb3NlIHRoZSBjb25uZWN0aW9uIG9uIHRoZVxuICAgICAgLy8gZm9sbG93aW5nIGl0ZXJhdGlvbiBpZiBpdCBpcyBpbiBmYWN0IGEgZG93bnN0cmVhbSBjb25uZWN0aW9uIGVycm9yLlxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZXJ2ZXMgYWxsIEhUVFAgcmVxdWVzdHMgb24gYSBzaW5nbGUgY29ubmVjdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIGh0dHBDb25uIFRoZSBIVFRQIGNvbm5lY3Rpb24gdG8geWllbGQgcmVxdWVzdHMgZnJvbS5cbiAgICogQHBhcmFtIGNvbm5JbmZvIEluZm9ybWF0aW9uIGFib3V0IHRoZSB1bmRlcmx5aW5nIGNvbm5lY3Rpb24uXG4gICAqL1xuICBhc3luYyAjc2VydmVIdHRwKGh0dHBDb25uOiBEZW5vLkh0dHBDb25uLCBjb25uSW5mbzogQ29ubkluZm8pIHtcbiAgICB3aGlsZSAoIXRoaXMuI2Nsb3NlZCkge1xuICAgICAgbGV0IHJlcXVlc3RFdmVudDogRGVuby5SZXF1ZXN0RXZlbnQgfCBudWxsO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBZaWVsZCB0aGUgbmV3IEhUVFAgcmVxdWVzdCBvbiB0aGUgY29ubmVjdGlvbi5cbiAgICAgICAgcmVxdWVzdEV2ZW50ID0gYXdhaXQgaHR0cENvbm4ubmV4dFJlcXVlc3QoKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBDb25uZWN0aW9uIGhhcyBiZWVuIGNsb3NlZC5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0RXZlbnQgPT09IG51bGwpIHtcbiAgICAgICAgLy8gQ29ubmVjdGlvbiBoYXMgYmVlbiBjbG9zZWQuXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXNwb25kIHRvIHRoZSByZXF1ZXN0LiBOb3RlIHdlIGRvIG5vdCBhd2FpdCB0aGlzIGFzeW5jIG1ldGhvZCB0b1xuICAgICAgLy8gYWxsb3cgdGhlIGNvbm5lY3Rpb24gdG8gaGFuZGxlIG11bHRpcGxlIHJlcXVlc3RzIGluIHRoZSBjYXNlIG9mIGgyLlxuICAgICAgdGhpcy4jcmVzcG9uZChyZXF1ZXN0RXZlbnQsIGNvbm5JbmZvKTtcbiAgICB9XG5cbiAgICB0aGlzLiNjbG9zZUh0dHBDb25uKGh0dHBDb25uKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBY2NlcHRzIGFsbCBjb25uZWN0aW9ucyBvbiBhIHNpbmdsZSBuZXR3b3JrIGxpc3RlbmVyLlxuICAgKlxuICAgKiBAcGFyYW0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIHRvIGFjY2VwdCBjb25uZWN0aW9ucyBmcm9tLlxuICAgKi9cbiAgYXN5bmMgI2FjY2VwdChsaXN0ZW5lcjogRGVuby5MaXN0ZW5lcikge1xuICAgIGxldCBhY2NlcHRCYWNrb2ZmRGVsYXk6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICAgIHdoaWxlICghdGhpcy4jY2xvc2VkKSB7XG4gICAgICBsZXQgY29ubjogRGVuby5Db25uO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBXYWl0IGZvciBhIG5ldyBjb25uZWN0aW9uLlxuICAgICAgICBjb25uID0gYXdhaXQgbGlzdGVuZXIuYWNjZXB0KCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgLy8gVGhlIGxpc3RlbmVyIGlzIGNsb3NlZC5cbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLkJhZFJlc291cmNlIHx8XG4gICAgICAgICAgLy8gVExTIGhhbmRzaGFrZSBlcnJvcnMuXG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5JbnZhbGlkRGF0YSB8fFxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuVW5leHBlY3RlZEVvZiB8fFxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuQ29ubmVjdGlvblJlc2V0IHx8XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RDb25uZWN0ZWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gQmFja29mZiBhZnRlciB0cmFuc2llbnQgZXJyb3JzIHRvIGFsbG93IHRpbWUgZm9yIHRoZSBzeXN0ZW0gdG9cbiAgICAgICAgICAvLyByZWNvdmVyLCBhbmQgYXZvaWQgYmxvY2tpbmcgdXAgdGhlIGV2ZW50IGxvb3Agd2l0aCBhIGNvbnRpbnVvdXNseVxuICAgICAgICAgIC8vIHJ1bm5pbmcgbG9vcC5cbiAgICAgICAgICBpZiAoIWFjY2VwdEJhY2tvZmZEZWxheSkge1xuICAgICAgICAgICAgYWNjZXB0QmFja29mZkRlbGF5ID0gSU5JVElBTF9BQ0NFUFRfQkFDS09GRl9ERUxBWTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWNjZXB0QmFja29mZkRlbGF5ICo9IDI7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGFjY2VwdEJhY2tvZmZEZWxheSA+PSBNQVhfQUNDRVBUX0JBQ0tPRkZfREVMQVkpIHtcbiAgICAgICAgICAgIGFjY2VwdEJhY2tvZmZEZWxheSA9IE1BWF9BQ0NFUFRfQkFDS09GRl9ERUxBWTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgZGVsYXkoYWNjZXB0QmFja29mZkRlbGF5LCB7XG4gICAgICAgICAgICAgIHNpZ25hbDogdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5QWJvcnRDb250cm9sbGVyLnNpZ25hbCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycjogdW5rbm93bikge1xuICAgICAgICAgICAgLy8gVGhlIGJhY2tvZmYgZGVsYXkgdGltZXIgaXMgYWJvcnRlZCB3aGVuIGNsb3NpbmcgdGhlIHNlcnZlci5cbiAgICAgICAgICAgIGlmICghKGVyciBpbnN0YW5jZW9mIERPTUV4Y2VwdGlvbiAmJiBlcnIubmFtZSA9PT0gXCJBYm9ydEVycm9yXCIpKSB7XG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuXG4gICAgICBhY2NlcHRCYWNrb2ZmRGVsYXkgPSB1bmRlZmluZWQ7XG5cbiAgICAgIC8vIFwiVXBncmFkZVwiIHRoZSBuZXR3b3JrIGNvbm5lY3Rpb24gaW50byBhbiBIVFRQIGNvbm5lY3Rpb24uXG4gICAgICBsZXQgaHR0cENvbm46IERlbm8uSHR0cENvbm47XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZGVwcmVjYXRlZC1kZW5vLWFwaVxuICAgICAgICBodHRwQ29ubiA9IERlbm8uc2VydmVIdHRwKGNvbm4pO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIENvbm5lY3Rpb24gaGFzIGJlZW4gY2xvc2VkLlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2xvc2luZyB0aGUgdW5kZXJseWluZyBsaXN0ZW5lciB3aWxsIG5vdCBjbG9zZSBIVFRQIGNvbm5lY3Rpb25zLCBzbyB3ZVxuICAgICAgLy8gdHJhY2sgZm9yIGNsb3N1cmUgdXBvbiBzZXJ2ZXIgY2xvc2UuXG4gICAgICB0aGlzLiN0cmFja0h0dHBDb25uZWN0aW9uKGh0dHBDb25uKTtcblxuICAgICAgY29uc3QgY29ubkluZm86IENvbm5JbmZvID0ge1xuICAgICAgICBsb2NhbEFkZHI6IGNvbm4ubG9jYWxBZGRyLFxuICAgICAgICByZW1vdGVBZGRyOiBjb25uLnJlbW90ZUFkZHIsXG4gICAgICB9O1xuXG4gICAgICAvLyBTZXJ2ZSB0aGUgcmVxdWVzdHMgdGhhdCBhcnJpdmUgb24gdGhlIGp1c3QtYWNjZXB0ZWQgY29ubmVjdGlvbi4gTm90ZVxuICAgICAgLy8gd2UgZG8gbm90IGF3YWl0IHRoaXMgYXN5bmMgbWV0aG9kIHRvIGFsbG93IHRoZSBzZXJ2ZXIgdG8gYWNjZXB0IG5ld1xuICAgICAgLy8gY29ubmVjdGlvbnMuXG4gICAgICB0aGlzLiNzZXJ2ZUh0dHAoaHR0cENvbm4sIGNvbm5JbmZvKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVW50cmFja3MgYW5kIGNsb3NlcyBhbiBIVFRQIGNvbm5lY3Rpb24uXG4gICAqXG4gICAqIEBwYXJhbSBodHRwQ29ubiBUaGUgSFRUUCBjb25uZWN0aW9uIHRvIGNsb3NlLlxuICAgKi9cbiAgI2Nsb3NlSHR0cENvbm4oaHR0cENvbm46IERlbm8uSHR0cENvbm4pIHtcbiAgICB0aGlzLiN1bnRyYWNrSHR0cENvbm5lY3Rpb24oaHR0cENvbm4pO1xuXG4gICAgdHJ5IHtcbiAgICAgIGh0dHBDb25uLmNsb3NlKCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBDb25uZWN0aW9uIGhhcyBhbHJlYWR5IGJlZW4gY2xvc2VkLlxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZGRzIHRoZSBsaXN0ZW5lciB0byB0aGUgaW50ZXJuYWwgdHJhY2tpbmcgbGlzdC5cbiAgICpcbiAgICogQHBhcmFtIGxpc3RlbmVyIExpc3RlbmVyIHRvIHRyYWNrLlxuICAgKi9cbiAgI3RyYWNrTGlzdGVuZXIobGlzdGVuZXI6IERlbm8uTGlzdGVuZXIpIHtcbiAgICB0aGlzLiNsaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIHRoZSBsaXN0ZW5lciBmcm9tIHRoZSBpbnRlcm5hbCB0cmFja2luZyBsaXN0LlxuICAgKlxuICAgKiBAcGFyYW0gbGlzdGVuZXIgTGlzdGVuZXIgdG8gdW50cmFjay5cbiAgICovXG4gICN1bnRyYWNrTGlzdGVuZXIobGlzdGVuZXI6IERlbm8uTGlzdGVuZXIpIHtcbiAgICB0aGlzLiNsaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGRzIHRoZSBIVFRQIGNvbm5lY3Rpb24gdG8gdGhlIGludGVybmFsIHRyYWNraW5nIGxpc3QuXG4gICAqXG4gICAqIEBwYXJhbSBodHRwQ29ubiBIVFRQIGNvbm5lY3Rpb24gdG8gdHJhY2suXG4gICAqL1xuICAjdHJhY2tIdHRwQ29ubmVjdGlvbihodHRwQ29ubjogRGVuby5IdHRwQ29ubikge1xuICAgIHRoaXMuI2h0dHBDb25uZWN0aW9ucy5hZGQoaHR0cENvbm4pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgdGhlIEhUVFAgY29ubmVjdGlvbiBmcm9tIHRoZSBpbnRlcm5hbCB0cmFja2luZyBsaXN0LlxuICAgKlxuICAgKiBAcGFyYW0gaHR0cENvbm4gSFRUUCBjb25uZWN0aW9uIHRvIHVudHJhY2suXG4gICAqL1xuICAjdW50cmFja0h0dHBDb25uZWN0aW9uKGh0dHBDb25uOiBEZW5vLkh0dHBDb25uKSB7XG4gICAgdGhpcy4jaHR0cENvbm5lY3Rpb25zLmRlbGV0ZShodHRwQ29ubik7XG4gIH1cbn1cblxuLyoqXG4gKiBBZGRpdGlvbmFsIHNlcnZlIG9wdGlvbnMuXG4gKlxuICogQGRlcHJlY2F0ZWQgVGhpcyB3aWxsIGJlIHJlbW92ZWQgaW4gMS4wLjAuIFVzZSB7QGxpbmtjb2RlIERlbm8uU2VydmVJbml0fSBpbnN0ZWFkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlSW5pdCBleHRlbmRzIFBhcnRpYWw8RGVuby5MaXN0ZW5PcHRpb25zPiB7XG4gIC8qKiBBbiBBYm9ydFNpZ25hbCB0byBjbG9zZSB0aGUgc2VydmVyIGFuZCBhbGwgY29ubmVjdGlvbnMuICovXG4gIHNpZ25hbD86IEFib3J0U2lnbmFsO1xuXG4gIC8qKiBUaGUgaGFuZGxlciB0byBpbnZva2Ugd2hlbiByb3V0ZSBoYW5kbGVycyB0aHJvdyBhbiBlcnJvci4gKi9cbiAgb25FcnJvcj86IChlcnJvcjogdW5rbm93bikgPT4gUmVzcG9uc2UgfCBQcm9taXNlPFJlc3BvbnNlPjtcblxuICAvKiogVGhlIGNhbGxiYWNrIHdoaWNoIGlzIGNhbGxlZCB3aGVuIHRoZSBzZXJ2ZXIgc3RhcnRlZCBsaXN0ZW5pbmcgKi9cbiAgb25MaXN0ZW4/OiAocGFyYW1zOiB7IGhvc3RuYW1lOiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9KSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIEFkZGl0aW9uYWwgc2VydmUgbGlzdGVuZXIgb3B0aW9ucy5cbiAqXG4gKiBAZGVwcmVjYXRlZCBUaGlzIHdpbGwgYmUgcmVtb3ZlZCBpbiAxLjAuMC4gVXNlIHtAbGlua2NvZGUgRGVuby5TZXJ2ZU9wdGlvbnN9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVMaXN0ZW5lck9wdGlvbnMge1xuICAvKiogQW4gQWJvcnRTaWduYWwgdG8gY2xvc2UgdGhlIHNlcnZlciBhbmQgYWxsIGNvbm5lY3Rpb25zLiAqL1xuICBzaWduYWw/OiBBYm9ydFNpZ25hbDtcblxuICAvKiogVGhlIGhhbmRsZXIgdG8gaW52b2tlIHdoZW4gcm91dGUgaGFuZGxlcnMgdGhyb3cgYW4gZXJyb3IuICovXG4gIG9uRXJyb3I/OiAoZXJyb3I6IHVua25vd24pID0+IFJlc3BvbnNlIHwgUHJvbWlzZTxSZXNwb25zZT47XG5cbiAgLyoqIFRoZSBjYWxsYmFjayB3aGljaCBpcyBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIHN0YXJ0ZWQgbGlzdGVuaW5nICovXG4gIG9uTGlzdGVuPzogKHBhcmFtczogeyBob3N0bmFtZTogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgc2VydmVyLCBhY2NlcHRzIGluY29taW5nIGNvbm5lY3Rpb25zIG9uIHRoZSBnaXZlbiBsaXN0ZW5lciwgYW5kXG4gKiBoYW5kbGVzIHJlcXVlc3RzIG9uIHRoZXNlIGNvbm5lY3Rpb25zIHdpdGggdGhlIGdpdmVuIGhhbmRsZXIuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlTGlzdGVuZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICpcbiAqIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW4oeyBwb3J0OiA0NTA1IH0pO1xuICpcbiAqIGNvbnNvbGUubG9nKFwic2VydmVyIGxpc3RlbmluZyBvbiBodHRwOi8vbG9jYWxob3N0OjQ1MDVcIik7XG4gKlxuICogYXdhaXQgc2VydmVMaXN0ZW5lcihsaXN0ZW5lciwgKHJlcXVlc3QpID0+IHtcbiAqICAgY29uc3QgYm9keSA9IGBZb3VyIHVzZXItYWdlbnQgaXM6XFxuXFxuJHtyZXF1ZXN0LmhlYWRlcnMuZ2V0KFxuICogICAgIFwidXNlci1hZ2VudFwiLFxuICogICApID8/IFwiVW5rbm93blwifWA7XG4gKlxuICogICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAgfSk7XG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgdG8gYWNjZXB0IGNvbm5lY3Rpb25zIGZyb20uXG4gKiBAcGFyYW0gaGFuZGxlciBUaGUgaGFuZGxlciBmb3IgaW5kaXZpZHVhbCBIVFRQIHJlcXVlc3RzLlxuICogQHBhcmFtIG9wdGlvbnMgT3B0aW9uYWwgc2VydmUgb3B0aW9ucy5cbiAqXG4gKiBAZGVwcmVjYXRlZCBUaGlzIHdpbGwgYmUgcmVtb3ZlZCBpbiAxLjAuMC4gVXNlIHtAbGlua2NvZGUgRGVuby5zZXJ2ZX0gaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlcnZlTGlzdGVuZXIoXG4gIGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyLFxuICBoYW5kbGVyOiBIYW5kbGVyLFxuICBvcHRpb25zPzogU2VydmVMaXN0ZW5lck9wdGlvbnMsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7IGhhbmRsZXIsIG9uRXJyb3I6IG9wdGlvbnM/Lm9uRXJyb3IgfSk7XG5cbiAgb3B0aW9ucz8uc2lnbmFsPy5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4gc2VydmVyLmNsb3NlKCksIHtcbiAgICBvbmNlOiB0cnVlLFxuICB9KTtcblxuICByZXR1cm4gYXdhaXQgc2VydmVyLnNlcnZlKGxpc3RlbmVyKTtcbn1cblxuZnVuY3Rpb24gaG9zdG5hbWVGb3JEaXNwbGF5KGhvc3RuYW1lOiBzdHJpbmcpIHtcbiAgLy8gSWYgdGhlIGhvc3RuYW1lIGlzIFwiMC4wLjAuMFwiLCB3ZSBkaXNwbGF5IFwibG9jYWxob3N0XCIgaW4gY29uc29sZVxuICAvLyBiZWNhdXNlIGJyb3dzZXJzIGluIFdpbmRvd3MgZG9uJ3QgcmVzb2x2ZSBcIjAuMC4wLjBcIi5cbiAgLy8gU2VlIHRoZSBkaXNjdXNzaW9uIGluIGh0dHBzOi8vZ2l0aHViLmNvbS9kZW5vbGFuZC9kZW5vX3N0ZC9pc3N1ZXMvMTE2NVxuICByZXR1cm4gaG9zdG5hbWUgPT09IFwiMC4wLjAuMFwiID8gXCJsb2NhbGhvc3RcIiA6IGhvc3RuYW1lO1xufVxuXG4vKipcbiAqIFNlcnZlcyBIVFRQIHJlcXVlc3RzIHdpdGggdGhlIGdpdmVuIGhhbmRsZXIuXG4gKlxuICogWW91IGNhbiBzcGVjaWZ5IGFuIG9iamVjdCB3aXRoIGEgcG9ydCBhbmQgaG9zdG5hbWUgb3B0aW9uLCB3aGljaCBpcyB0aGVcbiAqIGFkZHJlc3MgdG8gbGlzdGVuIG9uLiBUaGUgZGVmYXVsdCBpcyBwb3J0IDgwMDAgb24gaG9zdG5hbWUgXCIwLjAuMC4wXCIuXG4gKlxuICogVGhlIGJlbG93IGV4YW1wbGUgc2VydmVzIHdpdGggdGhlIHBvcnQgODAwMC5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgc2VydmUgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICogc2VydmUoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSk7XG4gKiBgYGBcbiAqXG4gKiBZb3UgY2FuIGNoYW5nZSB0aGUgbGlzdGVuaW5nIGFkZHJlc3MgYnkgdGhlIGBob3N0bmFtZWAgYW5kIGBwb3J0YCBvcHRpb25zLlxuICogVGhlIGJlbG93IGV4YW1wbGUgc2VydmVzIHdpdGggdGhlIHBvcnQgMzAwMC5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgc2VydmUgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICogc2VydmUoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwgeyBwb3J0OiAzMDAwIH0pO1xuICogYGBgXG4gKlxuICogYHNlcnZlYCBmdW5jdGlvbiBwcmludHMgdGhlIG1lc3NhZ2UgYExpc3RlbmluZyBvbiBodHRwOi8vPGhvc3RuYW1lPjo8cG9ydD4vYFxuICogb24gc3RhcnQtdXAgYnkgZGVmYXVsdC4gSWYgeW91IGxpa2UgdG8gY2hhbmdlIHRoaXMgbWVzc2FnZSwgeW91IGNhbiBzcGVjaWZ5XG4gKiBgb25MaXN0ZW5gIG9wdGlvbiB0byBvdmVycmlkZSBpdC5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgc2VydmUgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICogc2VydmUoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwge1xuICogICBvbkxpc3Rlbih7IHBvcnQsIGhvc3RuYW1lIH0pIHtcbiAqICAgICBjb25zb2xlLmxvZyhgU2VydmVyIHN0YXJ0ZWQgYXQgaHR0cDovLyR7aG9zdG5hbWV9OiR7cG9ydH1gKTtcbiAqICAgICAvLyAuLi4gbW9yZSBpbmZvIHNwZWNpZmljIHRvIHlvdXIgc2VydmVyIC4uXG4gKiAgIH0sXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIFlvdSBjYW4gYWxzbyBzcGVjaWZ5IGB1bmRlZmluZWRgIG9yIGBudWxsYCB0byBzdG9wIHRoZSBsb2dnaW5nIGJlaGF2aW9yLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBzZXJ2ZSgoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpLCB7IG9uTGlzdGVuOiB1bmRlZmluZWQgfSk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gaGFuZGxlciBUaGUgaGFuZGxlciBmb3IgaW5kaXZpZHVhbCBIVFRQIHJlcXVlc3RzLlxuICogQHBhcmFtIG9wdGlvbnMgVGhlIG9wdGlvbnMuIFNlZSBgU2VydmVJbml0YCBkb2N1bWVudGF0aW9uIGZvciBkZXRhaWxzLlxuICpcbiAqIEBkZXByZWNhdGVkIFRoaXMgd2lsbCBiZSByZW1vdmVkIGluIDEuMC4wLiBVc2Uge0BsaW5rY29kZSBEZW5vLnNlcnZlfSBpbnN0ZWFkLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VydmUoXG4gIGhhbmRsZXI6IEhhbmRsZXIsXG4gIG9wdGlvbnM6IFNlcnZlSW5pdCA9IHt9LFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGxldCBwb3J0ID0gb3B0aW9ucy5wb3J0ID8/IDgwMDA7XG4gIGlmICh0eXBlb2YgcG9ydCAhPT0gXCJudW1iZXJcIikge1xuICAgIHBvcnQgPSBOdW1iZXIocG9ydCk7XG4gIH1cblxuICBjb25zdCBob3N0bmFtZSA9IG9wdGlvbnMuaG9zdG5hbWUgPz8gXCIwLjAuMC4wXCI7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoe1xuICAgIHBvcnQsXG4gICAgaG9zdG5hbWUsXG4gICAgaGFuZGxlcixcbiAgICBvbkVycm9yOiBvcHRpb25zLm9uRXJyb3IsXG4gIH0pO1xuXG4gIG9wdGlvbnM/LnNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsICgpID0+IHNlcnZlci5jbG9zZSgpLCB7XG4gICAgb25jZTogdHJ1ZSxcbiAgfSk7XG5cbiAgY29uc3QgbGlzdGVuZXIgPSBEZW5vLmxpc3Rlbih7XG4gICAgcG9ydCxcbiAgICBob3N0bmFtZSxcbiAgICB0cmFuc3BvcnQ6IFwidGNwXCIsXG4gIH0pO1xuXG4gIGNvbnN0IHMgPSBzZXJ2ZXIuc2VydmUobGlzdGVuZXIpO1xuXG4gIHBvcnQgPSAoc2VydmVyLmFkZHJzWzBdIGFzIERlbm8uTmV0QWRkcikucG9ydDtcblxuICBpZiAoXCJvbkxpc3RlblwiIGluIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zLm9uTGlzdGVuPy4oeyBwb3J0LCBob3N0bmFtZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgTGlzdGVuaW5nIG9uIGh0dHA6Ly8ke2hvc3RuYW1lRm9yRGlzcGxheShob3N0bmFtZSl9OiR7cG9ydH0vYCk7XG4gIH1cblxuICByZXR1cm4gYXdhaXQgcztcbn1cblxuLyoqXG4gKiBJbml0aWFsaXphdGlvbiBwYXJhbWV0ZXJzIGZvciB7QGxpbmtjb2RlIHNlcnZlVGxzfS5cbiAqXG4gKiBAZGVwcmVjYXRlZCBUaGlzIHdpbGwgYmUgcmVtb3ZlZCBpbiAxLjAuMC4gVXNlIHtAbGlua2NvZGUgRGVuby5TZXJ2ZVRsc09wdGlvbnN9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVUbHNJbml0IGV4dGVuZHMgU2VydmVJbml0IHtcbiAgLyoqIFNlcnZlciBwcml2YXRlIGtleSBpbiBQRU0gZm9ybWF0ICovXG4gIGtleT86IHN0cmluZztcblxuICAvKiogQ2VydCBjaGFpbiBpbiBQRU0gZm9ybWF0ICovXG4gIGNlcnQ/OiBzdHJpbmc7XG5cbiAgLyoqIFRoZSBwYXRoIHRvIHRoZSBmaWxlIGNvbnRhaW5pbmcgdGhlIFRMUyBwcml2YXRlIGtleS4gKi9cbiAga2V5RmlsZT86IHN0cmluZztcblxuICAvKiogVGhlIHBhdGggdG8gdGhlIGZpbGUgY29udGFpbmluZyB0aGUgVExTIGNlcnRpZmljYXRlICovXG4gIGNlcnRGaWxlPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFNlcnZlcyBIVFRQUyByZXF1ZXN0cyB3aXRoIHRoZSBnaXZlbiBoYW5kbGVyLlxuICpcbiAqIFlvdSBtdXN0IHNwZWNpZnkgYGtleWAgb3IgYGtleUZpbGVgIGFuZCBgY2VydGAgb3IgYGNlcnRGaWxlYCBvcHRpb25zLlxuICpcbiAqIFlvdSBjYW4gc3BlY2lmeSBhbiBvYmplY3Qgd2l0aCBhIHBvcnQgYW5kIGhvc3RuYW1lIG9wdGlvbiwgd2hpY2ggaXMgdGhlXG4gKiBhZGRyZXNzIHRvIGxpc3RlbiBvbi4gVGhlIGRlZmF1bHQgaXMgcG9ydCA4NDQzIG9uIGhvc3RuYW1lIFwiMC4wLjAuMFwiLlxuICpcbiAqIFRoZSBiZWxvdyBleGFtcGxlIHNlcnZlcyB3aXRoIHRoZSBkZWZhdWx0IHBvcnQgODQ0My5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgc2VydmVUbHMgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICpcbiAqIGNvbnN0IGNlcnQgPSBcIi0tLS0tQkVHSU4gQ0VSVElGSUNBVEUtLS0tLVxcbi4uLlxcbi0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS1cXG5cIjtcbiAqIGNvbnN0IGtleSA9IFwiLS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tXFxuLi4uXFxuLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLVxcblwiO1xuICogc2VydmVUbHMoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwgeyBjZXJ0LCBrZXkgfSk7XG4gKlxuICogLy8gT3JcbiAqXG4gKiBjb25zdCBjZXJ0RmlsZSA9IFwiL3BhdGgvdG8vY2VydEZpbGUuY3J0XCI7XG4gKiBjb25zdCBrZXlGaWxlID0gXCIvcGF0aC90by9rZXlGaWxlLmtleVwiO1xuICogc2VydmVUbHMoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwgeyBjZXJ0RmlsZSwga2V5RmlsZSB9KTtcbiAqIGBgYFxuICpcbiAqIGBzZXJ2ZVRsc2AgZnVuY3Rpb24gcHJpbnRzIHRoZSBtZXNzYWdlIGBMaXN0ZW5pbmcgb24gaHR0cHM6Ly88aG9zdG5hbWU+Ojxwb3J0Pi9gXG4gKiBvbiBzdGFydC11cCBieSBkZWZhdWx0LiBJZiB5b3UgbGlrZSB0byBjaGFuZ2UgdGhpcyBtZXNzYWdlLCB5b3UgY2FuIHNwZWNpZnlcbiAqIGBvbkxpc3RlbmAgb3B0aW9uIHRvIG92ZXJyaWRlIGl0LlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZVRscyB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBjb25zdCBjZXJ0RmlsZSA9IFwiL3BhdGgvdG8vY2VydEZpbGUuY3J0XCI7XG4gKiBjb25zdCBrZXlGaWxlID0gXCIvcGF0aC90by9rZXlGaWxlLmtleVwiO1xuICogc2VydmVUbHMoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwge1xuICogICBjZXJ0RmlsZSxcbiAqICAga2V5RmlsZSxcbiAqICAgb25MaXN0ZW4oeyBwb3J0LCBob3N0bmFtZSB9KSB7XG4gKiAgICAgY29uc29sZS5sb2coYFNlcnZlciBzdGFydGVkIGF0IGh0dHBzOi8vJHtob3N0bmFtZX06JHtwb3J0fWApO1xuICogICAgIC8vIC4uLiBtb3JlIGluZm8gc3BlY2lmaWMgdG8geW91ciBzZXJ2ZXIgLi5cbiAqICAgfSxcbiAqIH0pO1xuICogYGBgXG4gKlxuICogWW91IGNhbiBhbHNvIHNwZWNpZnkgYHVuZGVmaW5lZGAgb3IgYG51bGxgIHRvIHN0b3AgdGhlIGxvZ2dpbmcgYmVoYXZpb3IuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlVGxzIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9zZXJ2ZXIudHNcIjtcbiAqIGNvbnN0IGNlcnRGaWxlID0gXCIvcGF0aC90by9jZXJ0RmlsZS5jcnRcIjtcbiAqIGNvbnN0IGtleUZpbGUgPSBcIi9wYXRoL3RvL2tleUZpbGUua2V5XCI7XG4gKiBzZXJ2ZVRscygoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpLCB7XG4gKiAgIGNlcnRGaWxlLFxuICogICBrZXlGaWxlLFxuICogICBvbkxpc3RlbjogdW5kZWZpbmVkLFxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gaGFuZGxlciBUaGUgaGFuZGxlciBmb3IgaW5kaXZpZHVhbCBIVFRQUyByZXF1ZXN0cy5cbiAqIEBwYXJhbSBvcHRpb25zIFRoZSBvcHRpb25zLiBTZWUgYFNlcnZlVGxzSW5pdGAgZG9jdW1lbnRhdGlvbiBmb3IgZGV0YWlscy5cbiAqIEByZXR1cm5zXG4gKlxuICogQGRlcHJlY2F0ZWQgVGhpcyB3aWxsIGJlIHJlbW92ZWQgaW4gMS4wLjAuIFVzZSB7QGxpbmtjb2RlIERlbm8uc2VydmV9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXJ2ZVRscyhcbiAgaGFuZGxlcjogSGFuZGxlcixcbiAgb3B0aW9uczogU2VydmVUbHNJbml0LFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICghb3B0aW9ucy5rZXkgJiYgIW9wdGlvbnMua2V5RmlsZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlRMUyBjb25maWcgaXMgZ2l2ZW4sIGJ1dCAna2V5JyBpcyBtaXNzaW5nLlwiKTtcbiAgfVxuXG4gIGlmICghb3B0aW9ucy5jZXJ0ICYmICFvcHRpb25zLmNlcnRGaWxlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVExTIGNvbmZpZyBpcyBnaXZlbiwgYnV0ICdjZXJ0JyBpcyBtaXNzaW5nLlwiKTtcbiAgfVxuXG4gIGxldCBwb3J0ID0gb3B0aW9ucy5wb3J0ID8/IDg0NDM7XG4gIGlmICh0eXBlb2YgcG9ydCAhPT0gXCJudW1iZXJcIikge1xuICAgIHBvcnQgPSBOdW1iZXIocG9ydCk7XG4gIH1cblxuICBjb25zdCBob3N0bmFtZSA9IG9wdGlvbnMuaG9zdG5hbWUgPz8gXCIwLjAuMC4wXCI7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoe1xuICAgIHBvcnQsXG4gICAgaG9zdG5hbWUsXG4gICAgaGFuZGxlcixcbiAgICBvbkVycm9yOiBvcHRpb25zLm9uRXJyb3IsXG4gIH0pO1xuXG4gIG9wdGlvbnM/LnNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsICgpID0+IHNlcnZlci5jbG9zZSgpLCB7XG4gICAgb25jZTogdHJ1ZSxcbiAgfSk7XG5cbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1zeW5jLWZuLWluLWFzeW5jLWZuXG4gIGNvbnN0IGtleSA9IG9wdGlvbnMua2V5IHx8IERlbm8ucmVhZFRleHRGaWxlU3luYyhvcHRpb25zLmtleUZpbGUhKTtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1zeW5jLWZuLWluLWFzeW5jLWZuXG4gIGNvbnN0IGNlcnQgPSBvcHRpb25zLmNlcnQgfHwgRGVuby5yZWFkVGV4dEZpbGVTeW5jKG9wdGlvbnMuY2VydEZpbGUhKTtcblxuICBjb25zdCBsaXN0ZW5lciA9IERlbm8ubGlzdGVuVGxzKHtcbiAgICBwb3J0LFxuICAgIGhvc3RuYW1lLFxuICAgIGNlcnQsXG4gICAga2V5LFxuICAgIHRyYW5zcG9ydDogXCJ0Y3BcIixcbiAgICAvLyBBTFBOIHByb3RvY29sIHN1cHBvcnQgbm90IHlldCBzdGFibGUuXG4gICAgLy8gYWxwblByb3RvY29sczogW1wiaDJcIiwgXCJodHRwLzEuMVwiXSxcbiAgfSk7XG5cbiAgY29uc3QgcyA9IHNlcnZlci5zZXJ2ZShsaXN0ZW5lcik7XG5cbiAgcG9ydCA9IChzZXJ2ZXIuYWRkcnNbMF0gYXMgRGVuby5OZXRBZGRyKS5wb3J0O1xuXG4gIGlmIChcIm9uTGlzdGVuXCIgaW4gb3B0aW9ucykge1xuICAgIG9wdGlvbnMub25MaXN0ZW4/Lih7IHBvcnQsIGhvc3RuYW1lIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYExpc3RlbmluZyBvbiBodHRwczovLyR7aG9zdG5hbWVGb3JEaXNwbGF5KGhvc3RuYW1lKX06JHtwb3J0fS9gLFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gYXdhaXQgcztcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsU0FBUyxLQUFLLFFBQVEsb0JBQW9CO0FBRTFDLCtDQUErQyxHQUMvQyxNQUFNLHNCQUFzQjtBQUU1QixtQ0FBbUMsR0FDbkMsTUFBTSxZQUFZO0FBRWxCLG9DQUFvQyxHQUNwQyxNQUFNLGFBQWE7QUFFbkIsdUVBQXVFLEdBQ3ZFLE1BQU0sK0JBQStCO0FBRXJDLGtFQUFrRSxHQUNsRSxNQUFNLDJCQUEyQjtBQThDakM7Ozs7Q0FJQyxHQUNELE9BQU8sTUFBTTtFQUNYLENBQUMsSUFBSSxDQUFVO0VBQ2YsQ0FBQyxJQUFJLENBQVU7RUFDZixDQUFDLE9BQU8sQ0FBVTtFQUNsQixDQUFDLE1BQU0sR0FBRyxNQUFNO0VBQ2hCLENBQUMsU0FBUyxHQUF1QixJQUFJLE1BQU07RUFDM0MsQ0FBQyxpQ0FBaUMsR0FBRyxJQUFJLGtCQUFrQjtFQUMzRCxDQUFDLGVBQWUsR0FBdUIsSUFBSSxNQUFNO0VBQ2pELENBQUMsT0FBTyxDQUFtRDtFQUUzRDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CQyxHQUNELFlBQVksVUFBc0IsQ0FBRTtJQUNsQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEdB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