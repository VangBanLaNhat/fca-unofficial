"use strict";

var generateOfflineThreadingID = require("../utils").generateOfflineThreadingID;

module.exports = function (defaultFuncs, api, ctx) {
  return function pinMessage(pinMode, messageID, threadID, callback) {
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

    var taskLabel = pinMode ? "430" : "431";
    var queueNamePrefix = pinMode ? "pin_msg_v2_" : "unpin_msg_v2_";

    var taskPayload = {
      thread_key: threadID,
      message_id: messageID,
      timestamp_ms: Date.now()
    };

    var task = {
      failure_count: null,
      label: taskLabel,
      payload: JSON.stringify(taskPayload),
      queue_name: queueNamePrefix + threadID,
      task_id: ctx.wsTaskNumber
    };

    var content = {
      app_id: "2220391788200892",
      payload: JSON.stringify({
        data_trace_id: null,
        epoch_id: parseInt(generateOfflineThreadingID(), 10),
        tasks: [task],
        version_id: "25095469420099952"
      }),
      request_id: ctx.wsReqNumber,
      type: 3
    };

    var mqttClient = ctx.mqttClient;
    var timeout = setTimeout(function () {
      mqttClient.removeListener("message", handleRes);
      callback(new Error("pinMessage MQTT response timeout"));
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
