// ==UserScript==
// @name         豆包聊天补全思考模式菜单proMax
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  修复了一些bug
// @author       Yitiaoxianyu
// @match        https://www.doubao.com/chat
// @match        https://www.doubao.com/chat/
// @match        https://www.doubao.com/chat/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const THINK_ITEM_ID = 2;
  const THINK_MODEL_KEY = '2';

  function isThinkItem(item) {
    if (!item || typeof item !== 'object') return false;
    return item.item_id === THINK_ITEM_ID || item.model_item_key === THINK_MODEL_KEY || item.name === '思考';
  }

  function buildThinkItemFromTemplate(template) {
    if (!template || typeof template !== 'object') return null;
    try {
      const think = JSON.parse(JSON.stringify(template));
      think.item_id = THINK_ITEM_ID;
      think.model_item_key = THINK_MODEL_KEY;
      think.name = '思考';
      think.sub_title_name = '擅长解决更难的问题';
      think.need_login = false;
      think.new_menu_item_tag = false;
      delete think.tag_list;
      delete think.subscribe_config;
      delete think.model_extra_params;
      return think;
    } catch (e) {
      return null;
    }
  }

  function processModelArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const hasModel = arr.some(item => item && typeof item === 'object' && ('item_id' in item || 'model_item_key' in item) && Object.keys(item).some(k => k !== 'item_id' && k !== 'model_item_key'));
    if (!hasModel) return false;
    if (arr.some(isThinkItem)) return false;
    const template = arr.find(item => item && typeof item === 'object' && ('item_id' in item || 'model_item_key' in item));
    const think = buildThinkItemFromTemplate(template);
    if (!think) return false;
    arr.push(think);
    return true;
  }

  function processSupportModels(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.support_models)) return false;
    const hasThink = obj.support_models.some(item => String(item.item_id) === String(THINK_ITEM_ID) || String(item.model_item_key) === THINK_MODEL_KEY);
    if (!hasThink) {
      obj.support_models.push({ item_id: String(THINK_ITEM_ID), model_item_key: THINK_MODEL_KEY });
      return true;
    }
    return false;
  }

  function processMenuConf(menuConf) {
    if (!menuConf || typeof menuConf !== 'object') return false;
    let changed = false;

    if (Array.isArray(menuConf.item_list)) {
      if (processModelArray(menuConf.item_list)) changed = true;
    }

    if (menuConf.mode_list && Array.isArray(menuConf.mode_list.item_list)) {
      for (const modeItem of menuConf.mode_list.item_list) {
        if (modeItem && Array.isArray(modeItem.conversation_mode_list) && modeItem.conversation_mode_list.includes('chat')) {
          if (modeItem.model_list && Array.isArray(modeItem.model_list.item_list)) {
            if (processModelArray(modeItem.model_list.item_list)) changed = true;
          }
        }
        if (processSupportModels(modeItem)) changed = true;
      }
    }

    if (menuConf.model_list && Array.isArray(menuConf.model_list.item_list)) {
      if (processModelArray(menuConf.model_list.item_list)) changed = true;
    }

    return changed;
  }

  function injectThinkMode(data) {
    try {
      if (!data || typeof data !== 'object') return data;
      const entryList = data?.data?.entry_list;
      if (!Array.isArray(entryList)) return data;

      for (const entry of entryList) {
        if (entry && entry.action_bar_key === 'coco_deep_thinking' && entry.active_switch_conf) {
          const conf = entry.active_switch_conf;
          if (conf.menu_conf) processMenuConf(conf.menu_conf);
          if (conf.menu_conf_v2) processMenuConf(conf.menu_conf_v2);
        }
      }
    } catch (e) {}
    return data;
  }

  function patchResponseText(text) {
    try {
      const data = JSON.parse(text);
      const modified = injectThinkMode(data);
      return JSON.stringify(modified);
    } catch (e) {
      return text;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    if (url.includes('action_bar_v3/brief_list')) {
      return originalFetch(...args).then(response => {
        return response.text().then(text => {
          const patched = patchResponseText(text);
          return new Response(patched, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        });
      });
    }
    return originalFetch(...args);
  };

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__thinkModeUrl = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__thinkModeUrl && this.__thinkModeUrl.includes('action_bar_v3/brief_list')) {
      this.addEventListener('load', function () {
        try {
          const patched = patchResponseText(this.responseText);
          Object.defineProperty(this, 'responseText', { value: patched });
          Object.defineProperty(this, 'response', { value: patched });
        } catch (e) {}
      });
    }
    return originalXHRSend.apply(this, args);
  };

  function deepPatch(obj, depth = 0, visited = new WeakSet()) {
    if (!obj || typeof obj !== 'object' || depth > 30) return;
    if (visited.has(obj)) return;
    visited.add(obj);
    if (Array.isArray(obj)) {
      if (processModelArray(obj)) return;
      obj.forEach(item => deepPatch(item, depth + 1, visited));
      return;
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (key === '_ROUTER_DATA' || key === '__INITIAL_STATE__' || key === '__NUXT__' || key === '__NEXT_DATA__' || key === '__APOLLO_STATE__') continue;
        deepPatch(obj[key], depth + 1, visited);
      }
    }
  }

  function scanAndPatch() {
    if (window._ROUTER_DATA) {
      deepPatch(window._ROUTER_DATA);
    }
  }

  window.addEventListener('DOMContentLoaded', scanAndPatch);
  setInterval(scanAndPatch, 1000);
})();
