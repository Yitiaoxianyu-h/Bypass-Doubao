// ==UserScript==
// @name         豆包聊天补全思考模式
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  添加思考模式菜单项
// @author       Yitiaoxianyu
// @match        https://www.doubao.com/chat
// @match        https://www.doubao.com/chat/
// @match        https://www.doubao.com/chat/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    const THINK_ITEM = {
        menu_type: 1,
        name: "思考",
        sub_title_name: "擅长解决更难的问题",
        new_menu_item_tag: false,
        tag: ""
    };
    function patchRouterData() {
        try {
            const layout = window._ROUTER_DATA?.loaderData?.chat_layout?.chat_layout;
            if (!layout) return;
            const menuList = layout.userSetting?.data?.action_bar_menu_config?.menu_item_list;
            if (menuList && Array.isArray(menuList) && !menuList.some(item => item.menu_type === 1)) {
                menuList.push(THINK_ITEM);
                console.log("[Dev] 已添加思考模式菜单项到 _ROUTER_DATA");
            }
        } catch(e) {}
    }
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        return originalXHROpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            if (this._url && (this._url.includes('/chat') || this._url.includes('/user/setting') || this._url.includes('/action_bar_menu_config'))) {
                try {
                    let data = JSON.parse(this.responseText);
                    let modified = false;
                    if (data.data?.action_bar_menu_config?.menu_item_list) {
                        const menu = data.data.action_bar_menu_config.menu_item_list;
                        if (!menu.some(item => item.menu_type === 1)) {
                            menu.push(THINK_ITEM);
                            modified = true;
                        }
                    }
                    if (modified) {
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
            if (url && (url.includes('/chat') || url.includes('/user/setting') || url.includes('/action_bar_menu_config'))) {
                const cloned = response.clone();
                cloned.json().then(data => {
                    let modified = false;
                    if (data.data?.action_bar_menu_config?.menu_item_list) {
                        const menu = data.data.action_bar_menu_config.menu_item_list;
                        if (!menu.some(item => item.menu_type === 1)) {
                            menu.push(THINK_ITEM);
                            modified = true;
                        }
                    }
                    if (modified) {
                        console.log("[Dev] fetch 响应已修改，但需依赖页面重新读取");
                        patchRouterData();
                    }
                }).catch(() => {});
            }
            return response;
        });
    };
    patchRouterData();
    window.addEventListener('DOMContentLoaded', patchRouterData);
    const observer = new MutationObserver(patchRouterData);
    observer.observe(document.body, { childList: true, subtree: true });
})();
