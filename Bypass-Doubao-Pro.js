// ==UserScript==
// @name         豆包聊天补全思考模式菜单pro
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  检测并添加思考模式菜单项
// @author       Yitiaoxianyu
// @match        https://www.doubao.com/chat
// @match        https://www.doubao.com/chat/
// @match        https://www.doubao.com/chat/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const THINK_ITEM_TEMPLATE = {
        menu_type: 1,
        name: "思考",
        sub_title_name: "擅长解决更难的问题",
        icon: { uri: "", url: "" },
        dark_mode_icon: { uri: "", url: "" },
        active_icon: { uri: "", url: "" },
        active_dark_mode_icon: { uri: "", url: "" },
        agent_mode: 2,
        need_login: false,
        new_menu_item_tag: false,
        tag: ""
    };

    let thinkItemReady = false;
    let THINK_ITEM = null;

    function buildThinkItem(refItem) {
        if (thinkItemReady) return THINK_ITEM;
        THINK_ITEM = JSON.parse(JSON.stringify(THINK_ITEM_TEMPLATE));
        if (refItem) {
            if (refItem.icon) THINK_ITEM.icon = refItem.icon;
            if (refItem.dark_mode_icon) THINK_ITEM.dark_mode_icon = refItem.dark_mode_icon;
            if (refItem.active_icon) THINK_ITEM.active_icon = refItem.active_icon;
            if (refItem.active_dark_mode_icon) THINK_ITEM.active_dark_mode_icon = refItem.active_dark_mode_icon;
        }
        thinkItemReady = true;
        return THINK_ITEM;
    }

    // 递归查找对象中的 modeSelectData
    function findModeSelectData(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 10) return null;
        if (obj.modeSelectData && obj.modeSelectData.modeSelectConfig) {
            return obj.modeSelectData;
        }
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const val = obj[key];
                if (val && typeof val === 'object' && !Array.isArray(val)) {
                    const result = findModeSelectData(val, depth + 1);
                    if (result) return result;
                }
            }
        }
        return null;
    }

    function patchMenuItemList(list) {
        if (!list || !Array.isArray(list)) return false;
        if (list.some(item => item.menu_type === 1)) return false;
        buildThinkItem(list[0]);
        list.push(JSON.parse(JSON.stringify(THINK_ITEM)));
        return true;
    }

    function patchResponseData(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 10) return false;
        let modified = false;

        if (obj.modeSelectConfig?.menu_item_list) {
            if (patchMenuItemList(obj.modeSelectConfig.menu_item_list)) {
                modified = true;
            }
        }

        if (obj.menu_item_list && Array.isArray(obj.menu_item_list)) {
            if (patchMenuItemList(obj.menu_item_list)) {
                modified = true;
            }
        }

        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const val = obj[key];
                if (val && typeof val === 'object' && !Array.isArray(val)) {
                    if (patchResponseData(val, depth + 1)) {
                        modified = true;
                    }
                }
            }
        }

        return modified;
    }

    function patchRouterData() {
        try {
            if (!window._ROUTER_DATA) return;
            const modeSelectData = findModeSelectData(window._ROUTER_DATA);
            if (modeSelectData?.modeSelectConfig?.menu_item_list) {
                const list = modeSelectData.modeSelectConfig.menu_item_list;
                if (!list.some(item => item.menu_type === 1)) {
                    buildThinkItem(list[0]);
                    list.push(JSON.parse(JSON.stringify(THINK_ITEM)));
                    console.log("[Dev] 已添加思考模式菜单项到 _ROUTER_DATA");
                }
            }
        } catch(e) {
            console.log("[Dev] patchRouterData 错误:", e);
        }
    }

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        return originalXHROpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            if (this._url && (
                this._url.includes('/chat') ||
                this._url.includes('/user/setting') ||
                this._url.includes('/mode_select') ||
                this._url.includes('/action_bar') ||
                this._url.includes('/modeSelect')
            )) {
                try {
                    const data = JSON.parse(this.responseText);
                    if (patchResponseData(data)) {
                        Object.defineProperty(this, 'responseText', {
                            get: () => JSON.stringify(data),
                            configurable: true
                        });
                        Object.defineProperty(this, 'response', {
                            get: () => data,
                            configurable: true
                        });
                        console.log("[Dev] 已通过 XHR 拦截添加思考模式菜单项");
                    }
                } catch(e) {}
            }
        });
        return originalXHRSend.call(this, body);
    };

    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url && (
                url.includes('/chat') ||
                url.includes('/user/setting') ||
                url.includes('/mode_select') ||
                url.includes('/action_bar') ||
                url.includes('/modeSelect')
            )) {
                const cloned = response.clone();
                return cloned.json().then(data => {
                    if (patchResponseData(data)) {
                        console.log("[Dev] 已通过 fetch 拦截添加思考模式菜单项");
                        return new Response(JSON.stringify(data), {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers
                        });
                    }
                    return response;
                }).catch(() => response);
            }
            return response;
        });
    };

    patchRouterData();
    window.addEventListener('DOMContentLoaded', patchRouterData);

    const observer = new MutationObserver(patchRouterData);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    let retryCount = 0;
    const timer = setInterval(() => {
        patchRouterData();
        retryCount++;
        if (retryCount > 30) clearInterval(timer);
    }, 1000);

})();
