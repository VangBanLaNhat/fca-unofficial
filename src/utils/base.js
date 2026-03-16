"use strict";

var type = require("./base-parts/type");
var network = require("./base-parts/network");
var parsing = require("./base-parts/parsing");
var identity = require("./base-parts/identity");
var formatters = require("./base-parts/formatters");
var auth = require("./base-parts/auth");

module.exports = Object.assign(
  {},
  network,
  identity,
  parsing,
  auth,
  formatters,
  type
);
