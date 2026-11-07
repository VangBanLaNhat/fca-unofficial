"use strict";

var chromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.8103.38 Safari/537.36";

var defaultUserAgent = chromeUA;
var windowsUserAgent = chromeUA;

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function randomUserAgent() {
  // Only modern Chrome 156/157 variants: one consistent, current browser
  // identity per session. Never a crawler UA or a pre-2023 browser.
  return pick([
    chromeUA,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.8103.38 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
  ]);
}

module.exports = {
  defaultUserAgent: defaultUserAgent,
  windowsUserAgent: windowsUserAgent,
  randomUserAgent: randomUserAgent
};
