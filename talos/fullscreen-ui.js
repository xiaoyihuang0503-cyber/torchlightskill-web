// Independent presentation controls. No run, save, audio or game actions.
const instances=new WeakMap();
const informationDialogs=new Set(['menu-dialog','manual-dialog','run-dialog','settings-dialog','audio-dialog',
  'calibration-dialog','editor-dialog','changelog-dialog','rules-dialog']);

// Fullscreen and device rotation are independent. Copy is based on the current surface,
// while actual fullscreen support is always feature-detected below.
export function fullscreenGuide({userAgent='',platform='',maxTouchPoints=0,landscape=false,standalone=false,reason='unsupported'}={}){
  const ios=/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1);
  const safari=ios&&/Safari/i.test(userAgent)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  if(ios){
    return {
      ios,title:reason==='exit'?'退出全屏':landscape?'横屏已就绪':'横屏游玩',
      message:reason==='exit'?'浏览器未能退出全屏。请使用系统返回或退出全屏手势。':
        landscape?'当前已经横屏，可以直接继续经营。':'当前为竖屏。横屏游玩无需先进入网页全屏。',
      rotation:landscape?'横屏布局已启用，收起侧栏可获得更大的操作区域。':'从屏幕右上角下滑打开控制中心，关闭「竖排方向锁定」，再把手机横过来。网页无法替你切换系统方向锁。',
      browserTitle:standalone?'主屏幕 App 已启动':'减少浏览器栏',
      browser:standalone?'当前已从主屏幕 App 启动；系统状态栏可能仍会显示。':
        `${safari?'在 Safari':'使用 Safari 打开本页后'}点「分享」→「添加到主屏幕」；若有「作为网页 App 打开」，请开启，再从主屏幕图标启动。`,
      note:standalone?'横屏与网页全屏是两个独立功能。':`${safari?'Safari 的地址栏由浏览器控制。':'地址栏由浏览器控制。'}全屏按钮无法保证隐藏它；添加到主屏幕后可用 App 方式打开。`,
    };
  }
  const android=/Android/i.test(userAgent);
  return {
    ios:false,title:'全屏显示',
    message:reason==='exit'?'浏览器未能退出全屏。请使用系统返回或退出全屏手势。':
      reason==='denied'?'浏览器未允许本次网页全屏。你仍可直接继续经营。':'当前浏览器未提供网页全屏。你仍可直接继续经营。',
    rotation:android?(landscape?'当前已经横屏，收起侧栏可扩大操作区域。':'关闭系统方向锁后横向转动手机，即可使用横屏布局。'):'',
    browserTitle:android?'减少浏览器栏':'继续经营',
    browser:android?'可在浏览器菜单选择「添加到主屏幕」，从主屏幕图标启动。':'收起两侧栏，可使用更大的操作区域。全屏失败不会改变本局。',
    note:android?'横屏无需网页全屏；浏览器栏能否隐藏取决于浏览器。':'可稍后通过全屏入口重试。',
  };
}

export function initFullscreenUI(doc=globalThis.document){
  if(!doc?.body||!doc.documentElement)return null;
  if(instances.has(doc))return instances.get(doc);
  const root=doc.documentElement,view=doc.defaultView||globalThis;
  const orientation=view.screen?.orientation;
  const request=root.requestFullscreen||root.webkitRequestFullscreen;
  const exit=doc.exitFullscreen||doc.webkitExitFullscreen||doc.webkitCancelFullScreen;
  const events=new AbortController();
  let busy=false,requestedHere=false,ownedFullscreen=false,orientationAttempted=false,
    orientationLocked=false,destroyed=false,hintReason='unsupported',attempt=0,failedAttempt=-1,operation='enter';
  const hint=doc.createElement('aside');hint.id='fullscreen-ui-hint';hint.hidden=true;
  hint.className='fullscreen-ui-hint';hint.setAttribute('aria-labelledby','fullscreen-ui-hint-title');
  hint.setAttribute('role','dialog');hint.setAttribute('aria-modal','false');
  hint.innerHTML='<header class="fullscreen-ui-hint-heading"><span class="fullscreen-ui-hint-kicker">DISPLAY</span><h2 id="fullscreen-ui-hint-title">横屏与显示</h2><button type="button" class="fullscreen-ui-hint-close" data-fullscreen-hint-close aria-label="关闭显示说明">×</button></header><div class="fullscreen-ui-hint-body"><p id="fullscreen-ui-hint-message" role="status" aria-live="polite" aria-atomic="true"></p><p id="fullscreen-ui-hint-rotation"></p><section><h3 id="fullscreen-ui-hint-browser-title"></h3><p id="fullscreen-ui-hint-browser"></p></section><small id="fullscreen-ui-hint-note"></small></div><footer class="fullscreen-ui-hint-actions"><button type="button" class="fullscreen-ui-hint-play" data-fullscreen-hint-play>收起侧栏继续玩</button><button type="button" class="fullscreen-ui-hint-dismiss" data-fullscreen-hint-close>关闭说明</button></footer>';
  doc.body.append(hint);
  const message=hint.querySelector('#fullscreen-ui-hint-message');
  const currentElement=()=>doc.fullscreenElement||doc.webkitFullscreenElement||null;
  const active=()=>Boolean(currentElement()||doc.webkitIsFullScreen);
  const ownActive=()=>currentElement()===root||Boolean(doc.webkitIsFullScreen&&!currentElement());
  const landscape=()=>view.matchMedia?.('(orientation: landscape)').matches??view.innerWidth>view.innerHeight;
  const guide=()=>fullscreenGuide({userAgent:view.navigator?.userAgent,platform:view.navigator?.platform,
    maxTouchPoints:view.navigator?.maxTouchPoints,landscape:landscape(),
    standalone:Boolean(view.navigator?.standalone||view.matchMedia?.('(display-mode: standalone)').matches||
      (view.matchMedia?.('(display-mode: fullscreen)').matches&&!active())),reason:hintReason});
  function updateHint(){
    const copy=guide();
    hint.querySelector('#fullscreen-ui-hint-title').textContent=copy.title;message.textContent=copy.message;
    const rotation=hint.querySelector('#fullscreen-ui-hint-rotation');rotation.textContent=copy.rotation;rotation.hidden=!copy.rotation;
    hint.querySelector('#fullscreen-ui-hint-browser-title').textContent=copy.browserTitle;
    hint.querySelector('#fullscreen-ui-hint-browser').textContent=copy.browser;
    hint.querySelector('#fullscreen-ui-hint-note').textContent=copy.note;
    const game=doc.getElementById('game-screen');
    hint.querySelector('[data-fullscreen-hint-play]').hidden=!game||game.hidden||game.inert||
      [...doc.querySelectorAll('dialog[open]')].some(dialog=>!informationDialogs.has(dialog.id));
  }
  function hideHint(){try{hint.hidePopover?.();}catch{}hint.hidden=true;}
  function showHint(reason){
    if(destroyed)return;hintReason=reason;updateHint();hint.hidden=false;
    doc.body.append(hint);
    // Non-modal top layer keeps a settings-triggered failure visible above its dialog.
    if(typeof hint.showPopover==='function'){
      try{hint.setAttribute('popover','manual');hint.showPopover();return;}catch{hint.removeAttribute('popover');}
    }
    // Older engines: place the fixed note inside the current modal rather than behind it.
    const dialogs=[...doc.querySelectorAll('dialog[open]')];
    (dialogs.at(-1)||doc.body).append(hint);
  }
  function continueImmersive(){
    const game=doc.getElementById('game-screen');
    if(!game||game.hidden||game.inert)return hideHint();
    hideHint();
    // Close information pages only. Reward/delivery dialogs have gameplay handlers.
    for(const dialog of doc.querySelectorAll('dialog[open]'))if(informationDialogs.has(dialog.id))dialog.close();
    const control=doc.getElementById('immersive-toggle');
    if(control&&!control.checked&&!control.disabled){
      control.checked=true;control.dispatchEvent(new view.Event('change',{bubbles:true}));
    }
  }
  function unlockOrientation(){
    if(!orientationLocked)return;
    orientationLocked=false;
    try{orientation?.unlock?.();}catch{}
  }
  function tryLandscape(){
    if(!requestedHere||!ownActive()||orientationAttempted||typeof orientation?.lock!=='function')return;
    orientationAttempted=true;
    try{
      Promise.resolve(orientation.lock('landscape')).then(()=>{
        if(!destroyed&&requestedHere&&ownActive()){orientationLocked=true;}
        else{try{orientation.unlock?.();}catch{}}
      }).catch(()=>{});
    }catch{}
  }
  function sync(){
    const enabled=active();
    root.classList.toggle('fullscreen-ui-active',enabled);
    if(requestedHere&&ownActive()){ownedFullscreen=true;hideHint();tryLandscape();}
    else if(ownedFullscreen){
      requestedHere=false;ownedFullscreen=false;orientationAttempted=false;unlockOrientation();
    }
    for(const button of doc.querySelectorAll('[data-fullscreen-toggle]')){
      const help=typeof request!=='function'&&guide().ios;
      const label=enabled?'退出全屏':help?'横屏 / 显示':'全屏';
      button.setAttribute('aria-pressed',String(enabled));
      button.setAttribute('aria-label',enabled?'退出全屏':help?'横屏与显示帮助':'进入全屏');
      button.title=enabled?'退出全屏':help?'横屏与显示帮助':'进入全屏';button.disabled=busy;
      const copy=button.querySelector('[data-fullscreen-label]');if(copy)copy.textContent=label;
    }
  }
  function fail(reason,id=attempt){
    requestedHere=false;orientationAttempted=false;
    // A native fullscreenerror and the rejected promise can describe the same click.
    // Do not reopen a note that the player already dismissed for that attempt.
    if(id===failedAttempt)return;failedAttempt=id;showHint(reason);
  }
  function toggleFromClick(){
    if(busy||destroyed)return;
    if(active()){
      if(typeof exit!=='function'){showHint('exit');return;}
      busy=true;operation='exit';const currentAttempt=++attempt;sync();
      try{
        // Called in the click handler, before any promise or asynchronous work.
        const result=exit.call(doc);
        Promise.resolve(result).catch(()=>fail('exit',currentAttempt))
          .finally(()=>{busy=false;if(!destroyed)sync();});
      }catch{busy=false;fail('exit',currentAttempt);sync();}
      return;
    }
    if(typeof request!=='function'){
      showHint('unsupported');return;
    }
    busy=true;operation='enter';requestedHere=true;orientationAttempted=false;const currentAttempt=++attempt;sync();
    try{
      // Request the whole document directly inside a real user click.
      const result=request.call(root);
      Promise.resolve(result).then(()=>{if(!destroyed)sync();})
        .catch(()=>fail('denied',currentAttempt))
        .finally(()=>{busy=false;if(!destroyed)sync();});
    }catch{busy=false;fail('denied',currentAttempt);sync();}
  }
  function clicked(event){
    const target=event.target?.closest?.('[data-fullscreen-toggle],[data-fullscreen-hint-close],[data-fullscreen-hint-play],#fullscreen-ui-hint');
    if(!target)return;
    // Do not let header/hint clicks cancel a selected game action or close another dialog.
    event.stopImmediatePropagation();
    if(target.hasAttribute('data-fullscreen-toggle')){
      event.preventDefault();
      if(event.isTrusted!==false)toggleFromClick();
    }else if(target.hasAttribute('data-fullscreen-hint-play')){
      event.preventDefault();continueImmersive();
    }else if(target.hasAttribute('data-fullscreen-hint-close')){
      event.preventDefault();hideHint();
    }
  }
  doc.addEventListener('click',clicked,{capture:true,signal:events.signal});
  doc.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!hint.hidden){
      event.preventDefault();event.stopImmediatePropagation();hideHint();
    }
  },{capture:true,signal:events.signal});
  for(const name of ['fullscreenchange','webkitfullscreenchange'])doc.addEventListener(name,sync,{signal:events.signal});
  for(const name of ['fullscreenerror','webkitfullscreenerror'])doc.addEventListener(name,()=>{
    if(!busy)return;busy=false;fail(operation==='exit'?'exit':'denied');sync();
  },{signal:events.signal});
  const resized=()=>{if(!hint.hidden)updateHint();};
  view.addEventListener?.('resize',resized,{signal:events.signal});
  orientation?.addEventListener?.('change',resized,{signal:events.signal});
  sync();
  const api=Object.freeze({
    getStatus:()=>({active:active(),supported:typeof request==='function',busy,orientationLocked}),
    hideHint,
    destroy:()=>{
      if(destroyed)return;destroyed=true;events.abort();unlockOrientation();hint.remove();
      root.classList.remove('fullscreen-ui-active');instances.delete(doc);
    },
  });
  instances.set(doc,api);return api;
}

export const fullscreenUI=initFullscreenUI();
