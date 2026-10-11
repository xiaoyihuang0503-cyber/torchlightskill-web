// Independent entry notice: presentation only, with no game imports or save access.
(function (doc) {
  'use strict';
  function init() {
    var dialog = doc.getElementById('author-notice-dialog');
    if (!dialog) return;
    var lastOpener = null, fallback = false, focusGuard = false, confirmed = false;
    function findAttribute(node, name) {
      while (node && node !== doc) {
        if (node.hasAttribute && node.hasAttribute(name)) return node;
        node = node.parentNode;
      }
      return null;
    }
    function isOpen() { return dialog.hasAttribute('open'); }
    function focusClose() {
      var button = dialog.querySelector('[data-author-notice-confirm]');
      if (button) button.focus();
    }
    function open(opener) {
      if (isOpen()) return;
      lastOpener = opener || null;
      fallback = false;
      try {
        if (typeof dialog.showModal !== 'function') throw new Error('Dialog unavailable');
        dialog.showModal();
      } catch (error) {
        fallback = true;
        dialog.classList.add('author-notice-fallback');
        dialog.setAttribute('open', '');
        dialog.setAttribute('aria-modal', 'true');
      }
      focusClose();
    }
    function close() {
      if (!confirmed) return;
      if (!isOpen()) return;
      if (!fallback && typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      dialog.classList.remove('author-notice-fallback');
      var target = lastOpener || doc.getElementById('startup-menu');
      if (target && target.isConnected !== false) target.focus();
      lastOpener = null;
    }
    doc.addEventListener('click', function (event) {
      if (isOpen() && fallback && !dialog.contains(event.target)) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      var opener = findAttribute(event.target, 'data-author-notice-open');
      if (!opener) return;
      event.preventDefault(); event.stopPropagation(); open(opener);
    }, true);
    doc.addEventListener('pointerdown', function (event) {
      if (isOpen() && fallback && !dialog.contains(event.target)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    dialog.addEventListener('click', function (event) {
      if (findAttribute(event.target, 'data-author-notice-confirm')) {
        confirmed = true;
        doc.documentElement.removeAttribute('data-author-notice-pending');
        close();
      }
      event.stopPropagation();
    });
    doc.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close();
      } else if (fallback && event.key === 'Tab') {
        var links = dialog.querySelectorAll('button,a[href]'), first = links[0], last = links[links.length - 1];
        if ((event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        }
      }
    }, true);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    doc.addEventListener('focusin', function (event) {
      if (!fallback || !isOpen() || focusGuard || dialog.contains(event.target)) return;
      focusGuard = true; focusClose(); focusGuard = false;
    });
    var avatars = dialog.querySelectorAll('[data-author-avatar]');
    for (var i = 0; i < avatars.length; i++) avatars[i].addEventListener('error', function () { this.hidden = true; });
    // Upgrade the visible first layer to a native modal after parsing.
    dialog.removeAttribute('open');
    open(null);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
}(document));
