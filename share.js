const HOME_URL = 'https://torchlightskill.com/';
const assets = {
  card: {url: './assets/talos-share-card-v4.png', name: '刷宝游戏工具箱-塔罗斯监狱-分享图.png', alt: '塔罗斯监狱横向分享图，附免费声明与作者信息'},
  poster: {url: './assets/talos-share-poster-v4.png', name: '刷宝游戏工具箱-塔罗斯监狱-海报.png', alt: '塔罗斯监狱竖版分享海报，附免费声明、作者信息与三个二维码'},
};
const dialog = document.getElementById('site-share');
const preview = document.getElementById('share-preview-image');
const previewNote = document.getElementById('share-preview-note');
const link = document.getElementById('share-link');
const copyButton = document.getElementById('share-copy');
const systemButton = document.getElementById('share-system');
const status = document.getElementById('share-status');
const formats = [...dialog.querySelectorAll('[data-share-format]')];
const prepared = new Map();
const nativeShare = typeof navigator.share === 'function';
const canPrepareFile = nativeShare && typeof navigator.canShare === 'function' && typeof File === 'function';
let selected = 'card';
let sharing = false;
let preparedSelection = null;

link.value = HOME_URL;
systemButton.hidden = !nativeShare;

function say(message) {
  if (dialog.open) status.textContent = message;
}

function manualCopy() {
  link.focus();
  link.select();
  link.setSelectionRange(0, link.value.length);
  say('自动复制不可用，链接已选中，请手动复制。');
}

// Prepare files before a share click; awaiting a fetch inside that click can
// consume the device's brief permission to open its share panel.
function prepareFile(format) {
  if (!prepared.has(format)) {
    const asset = assets[format];
    const work = fetch(asset.url, {credentials: 'omit'})
      .then(async response => {
        if (!response.ok) throw new Error('Image unavailable');
        const blob = await response.blob();
        const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
        const png = [137, 80, 78, 71, 13, 10, 26, 10];
        if (!png.every((byte, index) => signature[index] === byte)) throw new Error('Image is not PNG');
        const file = new File([blob], asset.name, {type: 'image/png'});
        let supported = false;
        try { supported = navigator.canShare({files: [file]}); } catch {}
        return supported ? file : null;
      })
      .catch(error => {
        prepared.delete(format);
        throw error;
      });
    prepared.set(format, work);
  }
  return prepared.get(format);
}

function updateSystemButton() {
  systemButton.disabled = sharing || (canPrepareFile && preparedSelection === undefined);
  systemButton.textContent = sharing ? '正在打开系统分享…' : preparedSelection ? '系统分享这张图' : '系统分享官网链接';
  formats.forEach(button => { button.disabled = sharing; });
}

function selectFormat(format) {
  if (!Object.hasOwn(assets, format) || sharing) return;
  selected = format;
  formats.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shareFormat === format)));
  dialog.dataset.shareFormat = format;
  previewNote.hidden = true;
  preview.alt = assets[format].alt;
  preview.src = assets[format].url;
  preview.hidden = false;
  preparedSelection = canPrepareFile ? undefined : null;
  updateSystemButton();
  if (canPrepareFile) {
    prepareFile(format).then(file => {
      if (selected !== format) return;
      preparedSelection = file;
      updateSystemButton();
    }).catch(() => {
      if (selected !== format) return;
      preparedSelection = null;
      updateSystemButton();
    });
  }
}

document.querySelectorAll('[data-share-open]').forEach(button => button.addEventListener('click', () => {
  status.textContent = '';
  selectFormat(selected);
}));
formats.forEach(button => button.addEventListener('click', () => {
  status.textContent = '';
  selectFormat(button.dataset.shareFormat);
}));
preview.addEventListener('load', () => { previewNote.hidden = true; });
preview.addEventListener('error', () => {
  preview.hidden = true;
  previewNote.hidden = false;
});
link.addEventListener('click', () => link.select());
copyButton.addEventListener('click', async () => {
  if (copyButton.disabled) return;
  copyButton.disabled = true;
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(HOME_URL);
    say('官网链接已复制。');
  } catch {
    if (dialog.open) manualCopy();
  } finally {
    copyButton.disabled = false;
  }
});
systemButton.addEventListener('click', async () => {
  if (!nativeShare || sharing || systemButton.disabled) return;
  const data = preparedSelection
    ? {files: [preparedSelection], title: '塔罗斯监狱 · 刷宝游戏工具箱'}
    : {url: HOME_URL, title: '刷宝游戏工具箱', text: '塔罗斯监狱玩家自制模拟，永久免费，请勿付费。非官方个人二创，体验以正式游戏为准。作者：抖音「爱玩游戏的吉吉罗」 / B站「二零后游戏荒」。'};
  sharing = true;
  updateSystemButton();
  try {
    await navigator.share(data);
    say('已交给系统分享面板。');
  } catch (error) {
    say(error?.name === 'AbortError' ? '已取消分享。' : '系统分享未完成，请下载图片或复制链接。');
  } finally {
    sharing = false;
    updateSystemButton();
  }
});
updateSystemButton();
