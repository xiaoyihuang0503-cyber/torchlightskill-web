const HOME_URL='https://torchlightskill.com/';
const ASSETS=Object.freeze({
  card:{url:new URL('./assets/share/talos-share-card-v3.png',import.meta.url).href,name:'TorchlightSkill-塔罗斯监狱-分享图.png',alt:'塔罗斯监狱横向分享图：永久免费，请勿付费；附作者抖音、B站与官网二维码'},
  poster:{url:new URL('./assets/share/talos-share-poster-v3.png',import.meta.url).href,name:'TorchlightSkill-塔罗斯监狱-海报.png',alt:'塔罗斯监狱竖版海报：永久免费，请勿付费；附二创声明、作者抖音、B站与官网二维码'},
});
const QR_URL=new URL('./assets/share/torchlightskill-home-qr.svg',import.meta.url).href;

// Standalone UI: no simulation imports, save access or game actions.
export function initGameShare(doc=globalThis.document){
  const dialog=doc?.getElementById('game-share-dialog');
  if(!dialog)return null;
  const find=id=>doc.getElementById(id);
  const preview=find('game-share-preview'),previewNote=find('game-share-preview-note'),
    link=find('game-share-link'),copyButton=find('game-share-copy'),
    systemButton=find('game-share-system'),status=find('game-share-status');
  if(![preview,previewNote,link,copyButton,systemButton,status].every(Boolean))return null;
  const formats=[...dialog.querySelectorAll('[data-game-share-format]')];
  const prepared=new Map(),nav=globalThis.navigator;
  const nativeShare=typeof nav?.share==='function';
  const canPrepareFile=nativeShare&&typeof nav.canShare==='function'&&typeof File==='function';
  let selected='card',sharing=false,preparedSelection=null,previewEpoch=0,lastOpener=null;
  link.value=HOME_URL;
  systemButton.hidden=!nativeShare;
  const qr=find('game-share-qr');if(qr)qr.src=QR_URL;
  for(const anchor of dialog.querySelectorAll('[data-game-share-download]')){
    const asset=ASSETS[anchor.dataset.gameShareDownload];
    if(asset){anchor.href=asset.url;anchor.download=asset.name;}
  }
  function say(message){if(dialog.open)status.textContent=message;}
  function manualCopy(){
    link.focus();link.select();link.setSelectionRange(0,link.value.length);
    say('自动复制不可用，链接已选中，请手动复制。');
  }
  // Prepare before the real share click to retain transient user activation.
  function prepareFile(format){
    if(!prepared.has(format)){
      const asset=ASSETS[format];
      const work=fetch(asset.url,{credentials:'omit'}).then(async response=>{
        if(!response.ok)throw Error('Image unavailable');
        const blob=await response.blob();
        const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());
        if(![137,80,78,71,13,10,26,10].every((byte,index)=>signature[index]===byte))throw Error('Image is not PNG');
        const file=new File([blob],asset.name,{type:'image/png'});
        let supported=false;try{supported=nav.canShare({files:[file]});}catch{}
        return supported?file:null;
      }).catch(error=>{prepared.delete(format);throw error;});
      prepared.set(format,work);
    }
    return prepared.get(format);
  }
  function updateSystemButton(){
    systemButton.disabled=sharing||(canPrepareFile&&preparedSelection===undefined);
    systemButton.textContent=sharing?'正在打开系统分享…':preparedSelection?'系统分享这张图':'系统分享官网链接';
    formats.forEach(button=>{button.disabled=sharing;});
  }
  function selectFormat(format){
    if(!Object.hasOwn(ASSETS,format)||sharing)return;
    const epoch=++previewEpoch;selected=format;
    formats.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.gameShareFormat===format)));
    dialog.dataset.gameShareFormat=format;previewNote.hidden=true;
    preview.alt=ASSETS[format].alt;preview.src=ASSETS[format].url;preview.hidden=false;
    preparedSelection=canPrepareFile?undefined:null;updateSystemButton();
    if(canPrepareFile)prepareFile(format).then(file=>{
      if(epoch!==previewEpoch||selected!==format)return;
      preparedSelection=file;updateSystemButton();
    }).catch(()=>{
      if(epoch!==previewEpoch||selected!==format)return;
      preparedSelection=null;updateSystemButton();
    });
  }
  function open(opener=null){
    if(!dialog.open){
      try{dialog.showModal();}catch{return false;}
      lastOpener=opener;
    }
    status.textContent='';selectFormat(selected);
    dialog.querySelector('[data-game-share-close]')?.focus({preventScroll:true});
    return true;
  }
  function close(){if(dialog.open)dialog.close();}
  function openClick(event){
    const opener=event.target.closest?.('[data-game-share-open]');
    if(!opener)return;
    event.preventDefault();event.stopPropagation();open(opener);
  }
  function dialogClick(event){
    // Keep sharing controls out of the game's delegated operation handlers.
    event.stopPropagation();
    if(event.target.closest?.('[data-game-share-close]')){close();return;}
    if(event.target===dialog){
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
    }
  }
  doc.addEventListener('click',openClick,true);
  dialog.addEventListener('click',dialogClick);
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
  // Escape keeps the browser's native cancel/close behavior.
  dialog.addEventListener('close',()=>{
    previewEpoch++;
    if(lastOpener?.isConnected)lastOpener.focus({preventScroll:true});
    lastOpener=null;
  });
  formats.forEach(button=>button.addEventListener('click',()=>{
    status.textContent='';selectFormat(button.dataset.gameShareFormat);
  }));
  preview.addEventListener('load',()=>{previewNote.hidden=true;});
  preview.addEventListener('error',()=>{preview.hidden=true;previewNote.hidden=false;});
  link.addEventListener('click',()=>link.select());
  copyButton.addEventListener('click',async()=>{
    if(copyButton.disabled)return;copyButton.disabled=true;
    try{
      if(typeof nav?.clipboard?.writeText!=='function')throw Error('Clipboard unavailable');
      await nav.clipboard.writeText(HOME_URL);say('官网链接已复制。');
    }catch{if(dialog.open)manualCopy();}
    finally{copyButton.disabled=false;}
  });
  systemButton.addEventListener('click',async()=>{
    if(!nativeShare||sharing||systemButton.disabled)return;
    const data=preparedSelection?{files:[preparedSelection],title:'塔罗斯监狱 · TorchlightSkill'}:
      {url:HOME_URL,title:'塔罗斯监狱 · TorchlightSkill',text:'塔罗斯监狱玩家自制模拟，永久免费，请勿付费。非官方个人二创，体验以正式游戏为准。作者：抖音「爱玩游戏的吉吉罗」 / B站「二零后游戏荒」。'};
    sharing=true;updateSystemButton();
    try{await nav.share(data);say('已交给系统分享面板。');}
    catch(error){say(error?.name==='AbortError'?'已取消分享。':'系统分享未完成，请下载图片或复制链接。');}
    finally{sharing=false;updateSystemButton();}
  });
  updateSystemButton();
  return Object.freeze({open,close});
}

export const gameShare=initGameShare();
