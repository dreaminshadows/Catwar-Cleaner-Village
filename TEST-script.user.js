// ==UserScript==
// @name           Catwar Cleaner & Alerts
// @namespace      http://tampermonkey.net/
// @version        5.1
// @description    Подсветка статусов (вкл/выкл) + уведомления по московскому времени.
// @author         dreaminshadows | Бейлиз (https://catwar.net/cat1638466)
// @match          *://catwar.su/*
// @match          *://catwar.net/*
// @match          *://cw3.space/*
// @updateURL      https://raw.githubusercontent.com/dreaminshadows/Catwar-Cleaner-Village/main/TEST-script.user.js
// @downloadURL    https://raw.githubusercontent.com/dreaminshadows/Catwar-Cleaner-Village/main/TEST-script.user.js
// @run-at         document-end
// @grant          none
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // БЛОК 1: УВЕДОМЛЕНИЯ ПО ВРЕМЕНИ (МОСКВА)
    // ==========================================
    const MOSCOW_TIMEZONE = 'Europe/Moscow';
    
    // Тексты уведомлений
    const ALERT_TEXT_LONG = 'Рекомендуется почистить локации: Фруктовый сад, Цветочная клумба, Пшеничное поле, Дремучий лес.';
    const ALERT_TEXT_SHORT = 'Рекомендуется почистить локации: Фруктовый сад, Дремучий лес.';
    
    let dismissedAlerts = new Set();

    function getMoscowTime() {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('ru-RU', {
            timeZone: MOSCOW_TIMEZONE, hour: 'numeric', minute: 'numeric', hour12: false
        });
        const parts = formatter.formatToParts(now);
        let hour = 0, minute = 0;
        parts.forEach(part => {
            if (part.type === 'hour') hour = parseInt(part.value, 10);
            if (part.type === 'minute') minute = parseInt(part.value, 10);
        });
        return { hour, minute };
    }

    function showAlert(alertId, text) {
        if (dismissedAlerts.has(alertId)) return;
        if (document.getElementById('cw-alert-' + alertId)) return;

        // НОВОЕ: Удаляем все старые уведомления, чтобы новое заменило старое
        document.querySelectorAll('.cw-alert-box').forEach(el => el.remove());

        const alertBox = document.createElement('div');
        alertBox.id = 'cw-alert-' + alertId;
        alertBox.className = 'cw-alert-box';
        
        alertBox.style.cssText = `
            position: fixed; right: 20px; top: 50%; transform: translateY(-50%);
            background: rgba(30, 30, 30, 0.95); color: #fff; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            font-family: Arial, sans-serif; font-size: 14px; z-index: 99999;
            border-left: 4px solid #4caf50; display: flex; align-items: center;
            gap: 15px; max-width: 320px; animation: cwSlideIn 0.3s ease-out;
        `;

        if (!document.getElementById('cw-alert-style')) {
            const style = document.createElement('style');
            style.id = 'cw-alert-style';
            style.innerHTML = `@keyframes cwSlideIn { from { opacity: 0; transform: translateY(-50%) translateX(50px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }`;
            document.head.appendChild(style);
        }

        const textContainer = document.createElement('div');
        textContainer.style.lineHeight = '1.4';
        textContainer.textContent = text; // Используем переданный текст
        alertBox.appendChild(textContainer);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `background: transparent; border: none; color: #aaa; font-size: 24px; cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0; transition: color 0.2s;`;
        closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseout = () => closeBtn.style.color = '#aaa';
        closeBtn.onclick = () => { alertBox.remove(); dismissedAlerts.add(alertId); };
        
        alertBox.appendChild(closeBtn);
        document.body.appendChild(alertBox);
    }

    function checkTime() {
        if (!document.getElementById('cages')) return;
        const { hour, minute } = getMoscowTime();
        
        if (hour === 11) showAlert('alert-11', ALERT_TEXT_LONG);
        if (hour === 15) showAlert('alert-15', ALERT_TEXT_LONG);
        if (hour === 16 && minute >= 30) showAlert('alert-1630', ALERT_TEXT_SHORT);
    }

    setInterval(checkTime, 10000);
    setTimeout(checkTime, 1000);


    // ==========================================
    // БЛОК 2: РЕЖИМ ЧИСТИЛЬЩИКА (ПОДСВЕТКА)
    // ==========================================
    const STORAGE_KEY_COLORS = 'cw_status_colors';
    const STORAGE_KEY_ENABLED = 'cw_cleaner_enabled';

    const HIGHLIGHT_COLORS = {
        online: 'rgba(76, 175, 80, 0.9)', offline: 'rgba(158, 158, 158, 0.9)',
        sleeping: 'rgba(244, 67, 54, 0.9)', banned: 'rgba(0, 0, 0, 0.9)', deleted: 'rgba(0, 0, 0, 0.9)'
    };
    const BORDER_WIDTH = '4px';
    const ACTIVE_STATUSES = { online: true, offline: true, sleeping: true, banned: true, deleted: true };

    let isEnabled = localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
    let referenceColors = {};

    try {
        const savedColors = localStorage.getItem(STORAGE_KEY_COLORS);
        if (savedColors) {
            referenceColors = JSON.parse(savedColors);
            for (let key in referenceColors) {
                if (Array.isArray(referenceColors[key])) referenceColors[key] = referenceColors[key].map(Number);
            }
        }
    } catch (e) {}

    function saveReferenceColors() { localStorage.setItem(STORAGE_KEY_COLORS, JSON.stringify(referenceColors)); }

    function parseColor(colorStr) {
        if (!colorStr) return null;
        let match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        match = colorStr.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (match) return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
        return null;
    }

    function isColorSimilar(c1, c2) {
        if (!c1 || !c2) return false;
        const tolerance = 25;
        return Math.abs(c1[0] - c2[0]) <= tolerance && Math.abs(c1[1] - c2[1]) <= tolerance && Math.abs(c1[2] - c2[2]) <= tolerance;
    }

    function updateReferenceColors() {
        const cages = document.querySelectorAll('td.cage');
        let updated = false;
        cages.forEach(cage => {
            const onlineSpan = cage.querySelector('.online');
            if (!onlineSpan) return;
            const statusSpan = onlineSpan.querySelector('span');
            if (!statusSpan) return;

            const statusText = statusSpan.textContent.toLowerCase();
            const computedColor = window.getComputedStyle(statusSpan).color;
            const rgbArray = parseColor(computedColor);
            if (!rgbArray) return;

            let type = null;
            if (statusText.includes('в игре') || statusText.includes('онлайн')) type = 'online';
            else if (statusText.includes('спит')) type = 'sleeping';
            else if (statusText.includes('удален') || statusText.includes('удалён') || statusText.includes('удалении')) type = 'deleted';
            else if (statusText.includes('заблокирован')) type = 'banned';
            else if (statusText.includes('отошел') || statusText.includes('недавно') || statusText.includes('не в сети')) type = 'offline';

            if (type) {
                if (!referenceColors[type] || !isColorSimilar(referenceColors[type], rgbArray)) {
                    referenceColors[type] = rgbArray;
                    updated = true;
                }
            }
        });
        if (updated) saveReferenceColors();
    }

    function clearAllHighlights() {
        document.querySelectorAll('td.cage').forEach(cage => { cage.style.boxShadow = ''; cage.style.backgroundColor = ''; });
    }

    function applyHighlights() {
        if (!isEnabled) { clearAllHighlights(); return; }
        const cages = document.querySelectorAll('td.cage');
        cages.forEach(cage => {
            const cageItems = cage.querySelector('.cage_items');
            if (cageItems && cageItems.style.background && cageItems.style.background.includes('things/')) {
                if (cage.style.boxShadow) { cage.style.boxShadow = ''; cage.style.backgroundColor = ''; } return;
            }
            const onlineSpan = cage.querySelector('.online');
            if (!onlineSpan) { if (cage.style.boxShadow) { cage.style.boxShadow = ''; cage.style.backgroundColor = ''; } return; }
            const statusSpan = onlineSpan.querySelector('span');
            if (!statusSpan) { if (cage.style.boxShadow) { cage.style.boxShadow = ''; cage.style.backgroundColor = ''; } return; }

            const computedColor = window.getComputedStyle(statusSpan).color;
            const currentRgb = parseColor(computedColor);
            if (!currentRgb) return;

            let detectedType = null;
            for (const [type, refRgb] of Object.entries(referenceColors)) {
                if (isColorSimilar(currentRgb, refRgb)) { detectedType = type; break; }
            }

            if (detectedType && ACTIVE_STATUSES[detectedType]) {
                const highlightColor = HIGHLIGHT_COLORS[detectedType];
                const newBoxShadow = `inset 0 0 0 ${BORDER_WIDTH} ${highlightColor}`;
                let bgOpacity = '0.15';
                if (highlightColor.includes('0, 0, 0')) bgOpacity = '0.3';
                const newBgColor = highlightColor.replace(/[\d.]+\)$/, `${bgOpacity})`);

                if (cage.style.boxShadow !== newBoxShadow) cage.style.boxShadow = newBoxShadow;
                if (cage.style.backgroundColor !== newBgColor) cage.style.backgroundColor = newBgColor;
            } else {
                if (cage.style.boxShadow) { cage.style.boxShadow = ''; cage.style.backgroundColor = ''; }
            }
        });
    }

    function createToggleButton() {
        const nav = document.querySelector('.game-topbar-nav');
        if (!nav || document.getElementById('cw-status-toggle-btn')) return;

        const btn = document.createElement('a');
        btn.id = 'cw-status-toggle-btn';
        btn.href = 'javascript:void(0)';
        btn.style.cssText = `color: inherit; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; font-family: inherit; font-size: inherit; padding: 0 10px; font-weight: bold;`;

        function updateBtnText() {
            if (isEnabled) { btn.textContent = 'Режим чистильщика: ON'; btn.style.opacity = '1'; }
            else { btn.textContent = 'Режим чистильщика: OFF'; btn.style.opacity = '0.5'; }
        }
        updateBtnText();

        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            isEnabled = !isEnabled;
            localStorage.setItem(STORAGE_KEY_ENABLED, isEnabled);
            updateBtnText();
            applyHighlights();
        };
        nav.appendChild(btn);
    }


    // ==========================================
    // БЛОК 3: ПАНЕЛЬ ТЕСТИРОВАНИЯ
    // ==========================================
    function createTestPanel() {
        if (document.getElementById('cw-test-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'cw-test-panel';
        panel.style.cssText = `
            position: fixed; left: 10px; bottom: 10px; background: rgba(20, 20, 20, 0.9);
            color: #fff; padding: 10px; border-radius: 6px; font-family: Arial, sans-serif;
            font-size: 12px; z-index: 100000; display: flex; flex-direction: column;
            gap: 6px; border: 1px solid #555; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            opacity: 0.7; transition: opacity 0.2s;
        `;
        panel.onmouseenter = () => panel.style.opacity = '1';
        panel.onmouseleave = () => panel.style.opacity = '0.7';

        const title = document.createElement('div');
        title.textContent = 'ТЕСТ УВЕДОМЛЕНИЙ';
        title.style.cssText = 'font-weight: bold; font-size: 10px; color: #888; margin-bottom: 2px; text-align: center; letter-spacing: 1px;';
        panel.appendChild(title);

        const btn11 = document.createElement('button');
        btn11.textContent = 'Показать (11:00)';
        btn11.style.cssText = 'padding: 4px 8px; cursor: pointer; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px; font-size: 11px;';
        btn11.onclick = () => { dismissedAlerts.delete('alert-11'); showAlert('alert-11', ALERT_TEXT_LONG); };
        panel.appendChild(btn11);

        const btn15 = document.createElement('button');
        btn15.textContent = 'Показать (15:00)';
        btn15.style.cssText = 'padding: 4px 8px; cursor: pointer; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px; font-size: 11px;';
        btn15.onclick = () => { dismissedAlerts.delete('alert-15'); showAlert('alert-15', ALERT_TEXT_LONG); };
        panel.appendChild(btn15);

        const btn1630 = document.createElement('button');
        btn1630.textContent = 'Показать (16:30)';
        btn1630.style.cssText = 'padding: 4px 8px; cursor: pointer; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px; font-size: 11px;';
        btn1630.onclick = () => { dismissedAlerts.delete('alert-1630'); showAlert('alert-1630', ALERT_TEXT_SHORT); };
        panel.appendChild(btn1630);

        const btnClear = document.createElement('button');
        btnClear.textContent = 'Скрыть все';
        btnClear.style.cssText = 'padding: 4px 8px; margin-top: 4px; cursor: pointer; background: #c62828; color: #fff; border: none; border-radius: 3px; font-size: 11px; font-weight: bold;';
        btnClear.onclick = () => {
            document.querySelectorAll('.cw-alert-box').forEach(el => el.remove());
            dismissedAlerts.clear();
        };
        panel.appendChild(btnClear);

        document.body.appendChild(panel);
    }


    // ==========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    setTimeout(createToggleButton, 500);
    setTimeout(createTestPanel, 1000);

    setInterval(() => {
        try {
            createToggleButton();
            if (document.getElementById('cages') && isEnabled) {
                updateReferenceColors();
                applyHighlights();
            }
        } catch (err) {}
    }, 200);

})();
