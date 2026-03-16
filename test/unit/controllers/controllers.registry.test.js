"use strict";

var fs = require("fs");
var path = require("path");

var controllers = require("../../../src/controllers");

describe("controllers registry", function () {
  test("exports only file-backed controller factories", function () {
    var controllersDir = path.join(__dirname, "../../../src/controllers");
    var files = fs
      .readdirSync(controllersDir)
      .filter(function (name) {
        return name.endsWith(".js") && name !== "index.js";
      })
      .map(function (name) {
        return name.replace(/\.js$/, "");
      })
      .sort();

    var exported = Object.keys(controllers).sort();

    exported.forEach(function (name) {
      expect(files.includes(name)).toBe(true);
      expect(typeof controllers[name]).toBe("function");
    });

    expect(exported.length).toBeGreaterThan(0);
  });

  test("every exported controller is a factory function", function () {
    Object.keys(controllers).forEach(function (name) {
      expect(typeof controllers[name]).toBe("function");
    });
  });
});
