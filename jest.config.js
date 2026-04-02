"use strict";

module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.js"],
  setupFiles: ["<rootDir>/test/jest.setup.js"],
  clearMocks: true,
  restoreMocks: true,
  verbose: true
};
