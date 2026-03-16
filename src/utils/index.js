"use strict";

var fs = require("fs");
var path = require("path");

var moduleFiles = fs
  .readdirSync(__dirname)
  .filter(function (name) {
    return name.endsWith(".js") && name !== "index.js";
  })
  .sort();

module.exports = moduleFiles.reduce(function (acc, fileName) {
  return Object.assign(acc, require(path.join(__dirname, fileName)));
}, {});
