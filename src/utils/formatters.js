"use strict";

var attachments = require("./format-attachments");
var messages = require("./format-messages");
var events = require("./format-events");
var threads = require("./format-threads");
var presence = require("./format-presence");
var core = require("./format-core");

module.exports = Object.assign(
  {},
  attachments,
  messages,
  events,
  threads,
  presence,
  core
);
