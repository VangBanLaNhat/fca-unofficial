"use strict";

var generateOfflineThreadingID = require("../utils").generateOfflineThreadingID;

module.exports = function (defaultFuncs, api, ctx) {
  return function setMessageReactionMqtt(reaction, messageID, threadID, callback) {
    var resolveFunc = function () {};
    var rejectFunc = function () {};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    if (!ctx.mqttClient) {
      return callback(new Error("Not connected to MQTT"));
    }

    var reqID = ctx.wsReqNumber + 1;
    ctx.wsReqNumber += 1;
    ctx.wsTaskNumber += 1;

    var taskPayload = {
      thread_key: threadID,
      timestamp_ms: Date.now(),
      message_id: messageID,
      reaction: reaction,
      actor_id: ctx.userID,
      reaction_style: null,
      sync_group: 1,
      send_attribution: Math.random() < 0.5 ? 65537 : 524289
    };

    var task = {
      failure_count: null,
      label: "29",
      payload: JSON.stringify(taskPayload),
      queue_name: JSON.stringify(["reaction", messageID]),
      task_id: ctx.wsTaskNumber
    };

    var content = {
      app_id: "2220391788200892",
      payload: JSON.stringify({
        data_trace_id: null,
        epoch_id: parseInt(generateOfflineThreadingID(), 10),
        tasks: [task],
        version_id: "7158486590867448"
      }),
      request_id: ctx.wsReqNumber,
      type: 3
    };

    var mqttClient = ctx.mqttClient;
    var timeout = setTimeout(function () {
      mqttClient.removeListener("message", handleRes);
      callback(new Error("setMessageReactionMqtt response timeout"));
    }, 10000);

    function handleRes(topic, message) {
      if (topic !== "/ls_resp") return;

      var jsonMsg;
      try {
        jsonMsg = JSON.parse(message.toString());
      } catch (_) {
        return;
      }

      if (jsonMsg.request_id !== reqID) return;

      clearTimeout(timeout);
      mqttClient.removeListener("message", handleRes);
      callback(null, jsonMsg);
    }

    mqttClient.on("message", handleRes);
    mqttClient.publish("/ls_req", JSON.stringify(content), { qos: 1, retain: false });

    return returnPromise;
  };
};
