"use strict";

// Some ESM deps (e.g. meta-messenger.js transitive deps) expect Web Streams globals.
// Node provides them via stream/web, but Jest VM may not expose them on globalThis.
try {
  var web = require("stream/web");
  var buffer = require("buffer");
  var workerThreads = require("worker_threads");
  var util = require("util");

  if (typeof globalThis.ReadableStream === "undefined" && web.ReadableStream) {
    globalThis.ReadableStream = web.ReadableStream;
  }

  if (typeof globalThis.WritableStream === "undefined" && web.WritableStream) {
    globalThis.WritableStream = web.WritableStream;
  }

  if (typeof globalThis.TransformStream === "undefined" && web.TransformStream) {
    globalThis.TransformStream = web.TransformStream;
  }

  if (typeof globalThis.Blob === "undefined" && buffer.Blob) {
    globalThis.Blob = buffer.Blob;
  }

  if (typeof globalThis.File === "undefined" && buffer.File) {
    globalThis.File = buffer.File;
  }

  if (typeof globalThis.MessagePort === "undefined" && workerThreads.MessagePort) {
    globalThis.MessagePort = workerThreads.MessagePort;
  }

  if (typeof globalThis.MessageChannel === "undefined" && workerThreads.MessageChannel) {
    globalThis.MessageChannel = workerThreads.MessageChannel;
  }

  if (typeof globalThis.DOMException === "undefined") {
    if (util.DOMException) {
      globalThis.DOMException = util.DOMException;
    } else {
      // Minimal fallback for libs that only check for the constructor presence.
      globalThis.DOMException = class DOMException extends Error {
        constructor(message, name) {
          super(message || "DOMException");
          this.name = name || "DOMException";
        }
      };
    }
  }
} catch (_) {
  // Ignore in environments where stream/web is unavailable.
}
