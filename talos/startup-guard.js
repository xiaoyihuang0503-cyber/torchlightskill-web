/* Classic ES5 bootstrap. It never reads, writes or removes a saved run. */
(function (view, doc) {
  'use strict';
  var owns = Object.prototype.hasOwnProperty;
  var objectPrototype = Object.prototype;
  var arrayPrototype = Array.prototype;

  function install(target, name, value) {
    if (typeof target[name] === 'function') return;
    Object.defineProperty(target, name, { value: value, configurable: true, writable: true });
  }
  install(Object, 'hasOwn', function (object, key) {
    if (object === null || object === undefined) throw new TypeError('Object.hasOwn requires an object');
    return owns.call(Object(object), key);
  });
  install(arrayPrototype, 'at', function (index) {
    if (this === null || this === undefined) throw new TypeError('Array.at requires an object');
    var object = Object(this), length = +object.length, offset = +index;
    length = length !== length || length <= 0 ? 0 : Math.min(Math.floor(length), 9007199254740991);
    offset = offset !== offset || offset === 0 ? 0 : offset > 0 ? Math.floor(offset) : Math.ceil(offset);
    if (offset < 0) offset += length;
    return offset < 0 || offset >= length ? undefined : object[offset];
  });

  function cloneError(message) {
    var error = new Error(message);
    error.name = 'DataCloneError';
    return error;
  }
  install(view, 'structuredClone', function (value) {
    if (arguments.length > 1 && arguments[1] !== undefined) throw cloneError('Clone options are unsupported in compatibility mode');
    var seen = [], copies = [];
    function copy(input) {
      var kind = typeof input, array, prototype, result, keys, index, descriptor;
      if (input === null || kind === 'undefined' || kind === 'boolean' || kind === 'number' || kind === 'string') return input;
      if (kind !== 'object') throw cloneError('Only ordinary object and array state can be cloned');
      array = Array.isArray(input);
      prototype = Object.getPrototypeOf(input);
      if (array ? prototype !== arrayPrototype : prototype !== objectPrototype && prototype !== null) {
        throw cloneError('Unsupported object type in compatibility mode');
      }
      if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(input).length) throw cloneError('Symbol properties are unsupported');
      for (index = 0; index < seen.length; index += 1) if (seen[index] === input) return copies[index];
      result = array ? new Array(input.length) : Object.create(prototype);
      seen.push(input); copies.push(result);
      keys = Object.keys(input);
      for (index = 0; index < keys.length; index += 1) {
        descriptor = Object.getOwnPropertyDescriptor(input, keys[index]);
        if (!owns.call(descriptor, 'value')) throw cloneError('Accessor properties are unsupported');
        Object.defineProperty(result, keys[index], {
          value: copy(descriptor.value), enumerable: true, configurable: true, writable: true
        });
      }
      return result;
    }
    return copy(value);
  });

  var state = 'loading', reason = '', message = '', timer = null, reloadBound = false;
  var files = ('app.js rules.js engine.js session-engine.js interaction.js effects.js goal-guide.js scene3d.js ' +
    'audio.js challenge.js challenge-v2.js challenge-ui.js reward-icons.js rainbow-ui.js startup.js run-journal.js ' +
    'modal-ui.js mobile-ui.js scene-loader.js reference-rules.js reference-ui.js model/prison.js model/materials.js model/projection.js ' +
    'vendor/three/three.module.js vendor/three/three.core.js').split(' ');
  var current = String(view.location.href).split('#')[0].split('?')[0];
  var directory = current.slice(0, current.lastIndexOf('/') + 1);

  function render() {
    var status = doc.getElementById('startup-load-status');
    var reload = doc.getElementById('startup-reload');
    var failed = state === 'failed';
    if (status) {
      status.hidden = state === 'ready';
      status.textContent = failed ? message : state === 'loading' ? '正在准备经营入口，请稍候…' : '';
      status.setAttribute('data-startup-state', state);
      status.setAttribute('data-startup-reason', reason);
    }
    if (reload) {
      reload.hidden = !failed;
      if (!reloadBound) {
        reload.addEventListener('click', reloadPage);
        reloadBound = true;
      }
    }
  }
  function fail(code, text) {
    if (state === 'ready' || state === 'failed') return;
    state = 'failed'; reason = code; message = text;
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
    render();
  }
  function relatedFile(filename) {
    var clean = String(filename || '').split('#')[0].split('?')[0], index;
    for (index = 0; index < files.length; index += 1) {
      if (clean === directory + files[index] || clean === files[index] || clean === './' + files[index]) return true;
    }
    return false;
  }
  function onError(event) {
    var target = event.target;
    var appScript = target && String(target.tagName).toLowerCase() === 'script' &&
      String(target.type).toLowerCase() === 'module' && /(^|\/)app\.js(?:[?#]|$)/.test(String(target.src || ''));
    if (appScript || relatedFile(event.filename)) {
      fail('module-error', '游戏加载失败。请重新加载；若仍无法启动，请使用更新版本的浏览器。');
    }
  }
  function onRejection(event) {
    var stack = event.reason && event.reason.stack, index;
    if (typeof stack !== 'string') return;
    for (index = 0; index < files.length; index += 1) {
      if (stack.indexOf(directory + files[index]) !== -1) {
        fail('module-error', '游戏加载失败。请重新加载；若仍无法启动，请使用更新版本的浏览器。');
        return;
      }
    }
  }
  function reloadPage(event) {
    if (event && event.preventDefault) event.preventDefault();
    var href = String(view.location.href), hashAt = href.indexOf('#');
    var hash = hashAt < 0 ? '' : href.slice(hashAt), base = hashAt < 0 ? href : href.slice(0, hashAt);
    var queryAt = base.indexOf('?'), path = queryAt < 0 ? base : base.slice(0, queryAt);
    var old = queryAt < 0 ? [] : base.slice(queryAt + 1).split('&'), next = [], index;
    for (index = 0; index < old.length; index += 1) {
      if (old[index] && !/^talos-reload(?:=|$)/.test(old[index])) next.push(old[index]);
    }
    next.push('talos-reload=' + String(Date.now()));
    view.location.assign(path + '?' + next.join('&') + hash);
  }
  view.TalosStartupGuard = {
    ready: function () {
      state = 'ready'; reason = ''; message = '';
      if (timer !== null) view.clearTimeout(timer);
      timer = null;
      view.removeEventListener('error', onError, true);
      view.removeEventListener('unhandledrejection', onRejection);
      render();
    },
    unsupported: function () {
      fail('unsupported-browser', '浏览器版本过旧，无法启动游戏。请使用更新版本的浏览器。');
    },
    getStatus: function () { return { state: state, reason: reason }; }
  };
  view.addEventListener('error', onError, true);
  view.addEventListener('unhandledrejection', onRejection);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', render);
  render();
  if (!('noModule' in doc.createElement('script'))) view.TalosStartupGuard.unsupported();
  if (state === 'loading') timer = view.setTimeout(function () {
    fail('timeout', '游戏在 8 秒内未完成加载。请重新加载；若仍无法启动，请检查网络或使用更新版本的浏览器。');
  }, 8000);
}(window, document));
