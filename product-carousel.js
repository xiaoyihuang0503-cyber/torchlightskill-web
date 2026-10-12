(() => {
  'use strict';
  const root = document.querySelector('[data-product-carousel]');
  if (!root) return;
  const viewport = root.querySelector('.product-viewport');
  const originals = [...root.querySelectorAll('[data-product]')];
  const count = originals.length;
  if (!count) return;
  const clone = card => {
    const copy = card.cloneNode(true);
    copy.dataset.productClone = 'true';
    copy.removeAttribute('data-product-initial');
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    return copy;
  };
  viewport.prepend(...originals.map(clone));
  viewport.append(...originals.map(clone));
  const cards = [...viewport.querySelectorAll('[data-product]')];
  const logical = index => ((index % count) + count) % count;
  const dots = root.querySelector('.product-dots');
  const status = root.querySelector('.product-position');
  const previous = root.querySelector('[data-product-previous]');
  const next = root.querySelector('[data-product-next]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const originalTabIndexes = new Map();
  let active = count + Math.max(0, originals.findIndex(card => card.hasAttribute('data-product-initial')));
  let settled = 0;
  let programmatic = false;
  let motionStarted = 0;
  let frame = 0;
  let wheelAt = 0;
  let dragging = null;
  let draggedAt = 0;
  let resizeFrame = 0;
  const names = originals.map(card => card.querySelector('h3').textContent.trim());
  const buttons = originals.map((card, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'product-dot';
    button.setAttribute('aria-label', `查看${names[index]}`);
    button.addEventListener('click', () => {
      const delta = index - logical(active);
      const shortest = Math.abs(delta) > count / 2 ? delta - Math.sign(delta) * count : delta;
      go(active + shortest);
    });
    dots.append(button);
    return button;
  });
  cards.forEach((card, index) => {
    card.setAttribute('role', 'group');
    card.setAttribute('aria-roledescription', '产品');
    card.setAttribute('aria-label', `${logical(index) + 1} / ${count}，${names[logical(index)]}`);
    card.tabIndex = card.dataset.productClone ? -1 : 0;
    card.querySelectorAll('a,button').forEach(control => {
      originalTabIndexes.set(control, control.getAttribute('tabindex'));
    });
    card.addEventListener('click', event => {
      if (performance.now() - draggedAt < 250) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (index !== active) {
        event.preventDefault();
        event.stopImmediatePropagation();
        go(index);
      }
    }, true);
    card.addEventListener('keydown', event => {
      if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        go(index);
      }
    });
  });
  function paint(index) {
    active = index;
    cards.forEach((card, i) => {
      const selected = i === index;
      card.classList.toggle('is-active', selected);
      card.classList.toggle('is-neighbor', Math.abs(i - index) === 1);
      card.setAttribute('aria-current', String(selected));

      card.querySelectorAll('a,button').forEach(control => {
        const original = originalTabIndexes.get(control);
        if (!selected || card.dataset.productClone) control.tabIndex = -1;
        else if (original === null) control.removeAttribute('tabindex');
        else control.setAttribute('tabindex', original);
      });
    });
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === logical(index))));
    status.textContent = `${String(logical(index) + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')} · ${names[logical(index)]}`;
  }
  function center(index) {
    const viewportRect = viewport.getBoundingClientRect();
    const cardRect = cards[index].getBoundingClientRect();
    return viewport.scrollLeft + cardRect.left + cardRect.width / 2 - viewportRect.left - viewportRect.width / 2;
  }
  function go(index, instant = false) {
    clearTimeout(settled);
    if (index < 0 || index >= cards.length) {
      const reset = count + logical(active);
      viewport.scrollTo({ left: center(reset), behavior: 'instant' });
      index = reset + (index > active ? 1 : -1);
    }
    if (Math.abs(index - active) > 1) instant = true;
    programmatic = !instant && !reduce.matches;
    motionStarted = performance.now();
    paint(index);
    viewport.scrollTo({ left: center(index), behavior: instant || reduce.matches ? 'instant' : 'smooth' });
    settled = setTimeout(normalize, 180);
  }
  function nearest(force = false) {
    const middle = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    let index = 0;
    let distance = Infinity;
    cards.forEach((card, i) => {
      const rect = card.getBoundingClientRect();
      const delta = Math.abs(rect.left + rect.width / 2 - middle);
      if (delta < distance) { distance = delta; index = i; }
    });
    if (index !== active && (!programmatic || force)) paint(index);
    frame = 0;
  }
  function normalize() {
    if (programmatic && Math.abs(center(active) - viewport.scrollLeft) > 2) {
      if (performance.now() - motionStarted > 2000) { go(active, true); return; }
      settled = setTimeout(normalize, 80);
      return;
    }
    programmatic = false;
    nearest(true);
    if (active < count || active >= count * 2) go(count + logical(active), true);
  }
  viewport.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(() => nearest());
    clearTimeout(settled);
    settled = setTimeout(normalize, 150);
  }, { passive: true });
  previous.addEventListener('click', () => go(active - 1));
  next.addEventListener('click', () => go(active + 1));
  root.addEventListener('keydown', event => {
    if (event.target.closest('dialog,input,textarea')) return;
    let index;
    if (event.key === 'ArrowLeft') index = active - 1;
    if (event.key === 'ArrowRight') index = active + 1;
    if (event.key === 'Home') index = count;
    if (event.key === 'End') index = count * 2 - 1;
    if (index !== undefined) { event.preventDefault(); go(index); }
  });
  // Horizontal trackpad and touch scrolling stay native; mouse wheel cycles products.
  viewport.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || Math.abs(event.deltaY) < 8) return;
    const direction = event.deltaY > 0 ? 1 : -1;
    event.preventDefault();
    if (performance.now() - wheelAt < 400) return;
    wheelAt = performance.now();
    go(active + direction);
  }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    programmatic = false;
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a,button')) return;
    dragging = { x: event.clientX, left: viewport.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', event => {
    if (!dragging) return;
    const distance = event.clientX - dragging.x;
    if (Math.abs(distance) < 6 && !dragging.moved) return;
    dragging.moved = true;
    viewport.classList.add('is-dragging');
    viewport.scrollLeft = dragging.left - distance;
  });
  function releaseDrag() {
    if (!dragging) return;
    const moved = dragging.moved;
    dragging = null;
    viewport.classList.remove('is-dragging');
    if (moved) { draggedAt = performance.now(); nearest(); go(active); }
  }
  window.addEventListener('pointerup', releaseDrag);
  window.addEventListener('pointercancel', releaseDrag);
  window.addEventListener('blur', releaseDrag);
  function geometry() {
    const width = originals[0].offsetWidth;
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const scale = mobile ? .62 : .65;
    const edge = mobile ? 8 : 16;
    const step = Math.min(mobile ? width * .3 : 320, Math.max(0, (viewport.clientWidth - width * scale) / 2 - edge));
    viewport.style.setProperty('--overlap', `${(width - step) / 2}px`);
  }
  const layout = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { geometry(); go(active, true); });
  };
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(layout);
    try { observer.observe(viewport, { box: 'border-box' }); }
    catch { observer.observe(viewport); }
  }
  root.classList.add('is-enhanced');
  geometry();
  go(active, true);
})();
