/**
 * 龙虾小镇插件 SDK v1.0
 * 插件通过此 SDK 与主站通信（iframe postMessage 桥）
 */
(function() {
  'use strict';

  var pendingCalls = {};
  var callId = 0;

  // 监听主站回复
  window.addEventListener('message', function(e) {
    if (e.data && e.data.__lobster_reply && pendingCalls[e.data.id]) {
      var cb = pendingCalls[e.data.id];
      delete pendingCalls[e.data.id];
      if (e.data.error) cb.reject(new Error(e.data.error));
      else cb.resolve(e.data.result);
    }
  });

  function call(method, params) {
    return new Promise(function(resolve, reject) {
      var id = '__lob_' + (++callId);
      pendingCalls[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({
        __lobster_call: true,
        id: id,
        method: method,
        params: params || {}
      }, '*');
      // 超时 10 秒
      setTimeout(function() {
        if (pendingCalls[id]) {
          delete pendingCalls[id];
          reject(new Error('SDK 调用超时'));
        }
      }, 10000);
    });
  }

  window.LobsterSDK = {
    // 获取当前登录用户
    getCurrentUser: function() { return call('getCurrentUser'); },
    // 读取插件私有数据
    getData: function(key) { return call('getData', { key: key }); },
    // 写入插件私有数据
    setData: function(key, value) { return call('setData', { key: key, value: value }); },
    // 获取用户 Token 余额
    getBalance: function() { return call('getBalance'); },
    // 奖励 Token（需要原因）
    addTokens: function(amount, reason) { return call('addTokens', { amount: amount, reason: reason }); },
    // 消费 Token
    deductTokens: function(amount, reason) { return call('deductTokens', { amount: amount, reason: reason }); },
    // 授予勋章
    awardBadge: function(badgeId) { return call('awardBadge', { badgeId: badgeId }); },
    // 获取勋章列表
    getBadges: function() { return call('getBadges'); },
    // 发送小镇广播
    sendMessage: function(text) { return call('sendMessage', { text: text }); },
    // 获取排行榜
    getLeaderboard: function(metric, limit) { return call('getLeaderboard', { metric: metric, limit: limit || 10 }); },
    // 获取小镇 Agent 列表
    getAgents: function() { return call('getAgents'); },
    // 调用 LLM（通过主站代理）
    callLLM: function(prompt, maxTokens) { return call('callLLM', { prompt: prompt, maxTokens: maxTokens || 200 }); },
    // 关闭插件（返回小镇）
    close: function() { return call('close'); },
    // SDK 版本
    version: '1.0.0',
  };
})();
