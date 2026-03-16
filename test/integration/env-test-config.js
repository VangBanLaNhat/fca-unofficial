"use strict";

var path = require("path");

try {
  // Load test-specific env file if present, while keeping pre-set shell env values.
  require("dotenv").config({ path: path.resolve(process.cwd(), "test/config.env") });
} catch (err) {
  if (!err || err.code !== "MODULE_NOT_FOUND") {
    throw err;
  }
}

function required(name) {
  var value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error("Missing required env var: " + name);
  }
  return String(value).trim();
}

function splitList(value) {
  return value
    .split(",")
    .map(function (item) {
      return item.trim();
    })
    .filter(Boolean);
}

module.exports = function loadEnvTestConfig() {
  var userIDs = splitList(required("FCA_TEST_USER_IDS"));
  if (userIDs.length < 1) {
    throw new Error("FCA_TEST_USER_IDS must contain at least 1 comma-separated ID");
  }

  return {
    user: {
      id: required("FCA_TEST_USER_ID"),
      email: required("FCA_TEST_EMAIL"),
      password: required("FCA_TEST_PASSWORD")
    },
    userIDs: userIDs,
    groupID: required("FCA_TEST_GROUP_ID")
  };
};
