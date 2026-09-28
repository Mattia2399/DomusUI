/*
 * Domus UI browser compatibility check.
 *
 * Runs as a classic ES5 script before the app, so it also works on old
 * Android WebViews (Fully Kiosk, wall tablets) where the app itself would stop
 * with a blank page. Domus UI needs Chrome / Android System WebView 111+,
 * Safari 16.4+ or Firefox 128+ (modern CSS colors and JavaScript APIs).
 * When something is missing it shows what to update instead of starting the app.
 */
(function () {
  'use strict';

  function supportsCss(property, value) {
    try {
      return !!(window.CSS && window.CSS.supports && window.CSS.supports(property, value));
    } catch (error) {
      return false;
    }
  }

  var missing = [];
  if (!('noModule' in document.createElement('script'))) missing.push('ES modules');
  if (!supportsCss('color', 'color-mix(in srgb, red, blue)')) missing.push('CSS color-mix()');
  if (!supportsCss('color', 'oklch(50% 0.1 200)')) missing.push('CSS oklch()');
  if (typeof window.structuredClone !== 'function') missing.push('structuredClone()');
  if (typeof Array.prototype.findLast !== 'function') missing.push('Array.findLast()');
  if (typeof Object.hasOwn !== 'function') missing.push('Object.hasOwn()');

  if (missing.length === 0) return;

  window.__DOMUS_UNSUPPORTED_BROWSER__ = true;

  var agent = navigator.userAgent || '';
  var chrome = /Chrome\/(\d+)/.exec(agent);
  var safari = /Version\/(\d+(?:\.\d+)?).*Safari/.exec(agent);
  var firefox = /Firefox\/(\d+)/.exec(agent);
  var detected = chrome
    ? 'Chrome / WebView ' + chrome[1]
    : safari
      ? 'Safari ' + safari[1]
      : firefox
        ? 'Firefox ' + firefox[1]
        : agent;

  var copy = {
    it: {
      title: 'Browser non supportato',
      body:
        'Domus UI richiede un browser più recente: Chrome o Android System WebView 111 o successivo, Safari 16.4 o successivo (iOS/iPadOS 16.4), oppure Firefox 128 o successivo.',
      android:
        'Su tablet Android e con Fully Kiosk Browser aggiorna «Android System WebView» (o Google Chrome) dal Play Store, poi riavvia l’app. Se il dispositivo non riceve più aggiornamenti, usa un altro browser o un dispositivo più recente.',
      detected: 'Browser rilevato',
      missing: 'Funzioni mancanti',
    },
    fr: {
      title: 'Navigateur non pris en charge',
      body:
        'Domus UI nécessite un navigateur plus récent : Chrome ou Android System WebView 111 ou plus, Safari 16.4 ou plus (iOS/iPadOS 16.4), ou Firefox 128 ou plus.',
      android:
        'Sur une tablette Android et avec Fully Kiosk Browser, mettez à jour « Android System WebView » (ou Google Chrome) depuis le Play Store, puis redémarrez l’application. Si l’appareil ne reçoit plus de mises à jour, utilisez un autre navigateur ou un appareil plus récent.',
      detected: 'Navigateur détecté',
      missing: 'Fonctions manquantes',
    },
    en: {
      title: 'Browser not supported',
      body:
        'Domus UI needs a more recent browser: Chrome or Android System WebView 111 or later, Safari 16.4 or later (iOS/iPadOS 16.4), or Firefox 128 or later.',
      android:
        'On Android tablets and in Fully Kiosk Browser, update “Android System WebView” (or Google Chrome) from the Play Store, then restart the app. If the device no longer receives updates, use another browser or a newer device.',
      detected: 'Detected browser',
      missing: 'Missing features',
    },
  };
  var language = String(navigator.language || 'en').slice(0, 2).toLowerCase();
  var text = copy[language] || copy.en;

  function element(tag, style, content) {
    var node = document.createElement(tag);
    node.setAttribute('style', style);
    if (content) node.appendChild(document.createTextNode(content));
    return node;
  }

  function render() {
    var root = document.getElementById('root') || document.body;
    var card = element(
      'div',
      'max-width:560px;margin:10vh auto;padding:28px;border-radius:24px;background:#1c1c1e;color:#f5f5f7;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5;'
    );
    card.appendChild(element('h1', 'margin:0 0 12px;font-size:22px;', text.title));
    card.appendChild(element('p', 'margin:0 0 12px;font-size:15px;', text.body));
    card.appendChild(element('p', 'margin:0 0 16px;font-size:15px;', text.android));
    card.appendChild(element('p', 'margin:0;font-size:12px;color:#a1a1a6;', text.detected + ': ' + detected));
    card.appendChild(element('p', 'margin:4px 0 0;font-size:12px;color:#a1a1a6;', text.missing + ': ' + missing.join(', ')));
    document.body.setAttribute('style', 'margin:0;background:#000;');
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(card);
  }

  if (window.console && window.console.warn) {
    window.console.warn('Domus UI: unsupported browser (' + detected + '). Missing: ' + missing.join(', '));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
