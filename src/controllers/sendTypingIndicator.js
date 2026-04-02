"use strict";

module.exports = function (_defaultFuncs, _api, ctx) {
  function publishTypingPacket(wsContent) {
    return new Promise(function (resolve, reject) {
      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(wsContent),
        {},
        function (err, packet) {
          if (err) return reject(err);
          resolve(packet);
        }
      );
    });
  }

  return async function sendTypingIndicatorMqtt(sendTyping, threadID, callback, isGroup) {
    var done = typeof callback === "function" ? callback : function () {};

    try {
      if (!ctx.mqttClient || !ctx.mqttClient.connected) {
        throw new Error("MQTT client is not connected. Call listenMqtt first.");
      }

      if (!threadID) {
        throw new Error("sendTypingIndicatorMqtt requires threadID");
      }

      var isGroupThread =
        typeof isGroup === "boolean"
          ? isGroup
          : String(threadID).length >= 16;

      var wsContent = {
        app_id: 2220391788200892,
        payload: JSON.stringify({
          label: 3,
          payload: JSON.stringify({
            thread_key: String(threadID),
            is_group_thread: +isGroupThread,
            is_typing: +!!sendTyping,
            attribution: 0
          }),
          version: 5849951561777440
        }),
        request_id: 1,
        type: 4
      };

      var packet = await publishTypingPacket(wsContent);
      done(null, packet);
      return packet;
    } catch (err) {
      done(err);
      throw err;
    }
  };
};