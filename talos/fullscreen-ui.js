// Independent presentation controls. No run, save, audio or game actions.
const instances=new WeakMap();

export function initFullscreenUI(doc=globalThis.document){
  if(!doc?.body||!doc.documentElement)return null;
  if(instances.has(doc))return instances.get(doc);
  const root=doc.documentElement,view=doc.defaultView||globalThis;
  const orientation=view.screen?.orientation;
  const request=root.requestFullscreen||root.webkitRequestFullscreen;
  const exit=doc.exitFullscreen||doc.webkitExitFullscreen||doc.webkitCancelFullScreen;
  const events=new AbortController();
  let busy=false,requestedHere=false,ownedFullscreen=false,orientationAttempted=false,
    orientationLocked=false,destroyed=false;
  const hint=doc.createElement('aside');hint.id='fullscreen-ui-hint';hint.hidden=true;
  hint.className='fullscreen-ui-hint';hint.setAttribute('aria-labelledby','fullscreen-ui-hint-title');
  hint.innerHTML='<button type="button" class="fullscreen-ui-hint-close" data-fullscreen-hint-close aria-label="关闭全屏提示">×</button><h2 id="fullscreen-ui-hint-title">全屏提示</h2><p id="fullscreen-ui-hint-message" role="status" aria-live="polite" aria-atomic="true"></p><p>请从右上角菜单选择在系统浏览器中打开，再点全屏。</p><p>Android：浏览器菜单 → 添加到主屏幕。<br>iPhone：Safari 分享 → 添加到主屏幕。</p><small>从主屏幕启动可减少浏览器栏；部分内置浏览器会保留自己的顶部栏。</small><button type="button" class="fullscreen-ui-hint-dismiss" data-fullscreen-hint-close>知道了</button>';
  doc.body.append(hint);
  const message=hint.querySelector('#fullscreen-ui-hint-message');
  const currentElement=()=>doc.fullscreenElement||doc.webkitFullscreenElement||null;
  const active=()=>Boolean(currentElement()||doc.webkitIsFullScreen);
  const ownActive=()=>currentElement()===root||Boolean(doc.webkitIsFullScreen&&!currentElement());
  function hideHint(){try{hint.hidePopover?.();}catch{}hint.hidden=true;}
  function showHint(text){
    if(destroyed)return;message.textContent=text;hint.hidden=false;
    // Non-modal top layer keeps a settings-triggered failure visible above its dialog.
    if(typeof hint.showPopover==='function'){
      try{hint.setAttribute('popover','manual');hint.showPopover();return;}catch{hint.removeAttribute('popover');}
    }
    // Older engines: place the fixed note inside the current modal rather than behind it.
    const dialogs=[...doc.querySelectorAll('dialog[open]')];
    (dialogs.at(-1)||doc.body).append(hint);
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
      const label=enabled?'退出全屏':'全屏';
      button.setAttribute('aria-pressed',String(enabled));
      button.setAttribute('aria-label',enabled?'退出全屏':'进入全屏');
      button.title=enabled?'退出全屏':'进入全屏';button.disabled=busy;
      const copy=button.querySelector('[data-fullscreen-label]');if(copy)copy.textContent=label;
    }
  }
  function fail(text){requestedHere=false;orientationAttempted=false;showHint(text);}
  function toggleFromClick(){
    if(busy||destroyed)return;
    if(active()){
      if(typeof exit!=='function'){showHint('请使用系统返回或退出全屏手势离开全屏。');return;}
      busy=true;sync();
      try{
        // Called in the click handler, before any promise or asynchronous work.
        const result=exit.call(doc);
        Promise.resolve(result).catch(()=>showHint('浏览器未能退出全屏，请使用系统返回或退出全屏手势。'))
          .finally(()=>{busy=false;if(!destroyed)sync();});
      }catch{busy=false;showHint('浏览器未能退出全屏，请使用系统返回或退出全屏手势。');sync();}
      return;
    }
    if(typeof request!=='function'){
      showHint('当前浏览器不支持网页全屏。');return;
    }
    busy=true;requestedHere=true;orientationAttempted=false;sync();
    try{
      // Request the whole document directly inside a real user click.
      const result=request.call(root);
      Promise.resolve(result).then(()=>{if(!destroyed)sync();})
        .catch(()=>fail('当前浏览器未能进入网页全屏。可使用系统浏览器重试。'))
        .finally(()=>{busy=false;if(!destroyed)sync();});
    }catch{busy=false;fail('当前浏览器未能进入网页全屏。可使用系统浏览器重试。');sync();}
  }
  function clicked(event){
    const target=event.target?.closest?.('[data-fullscreen-toggle],[data-fullscreen-hint-close],#fullscreen-ui-hint');
    if(!target)return;
    // Do not let header/hint clicks cancel a selected game action or close another dialog.
    event.stopImmediatePropagation();
    if(target.hasAttribute('data-fullscreen-toggle')){
      event.preventDefault();
      if(event.isTrusted!==false)toggleFromClick();
    }else if(target.hasAttribute('data-fullscreen-hint-close')){
      event.preventDefault();hideHint();
    }
  }
  doc.addEventListener('click',clicked,{capture:true,signal:events.signal});
  doc.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!hint.hidden&&!active()){
      event.stopImmediatePropagation();hideHint();
    }
  },{capture:true,signal:events.signal});
  for(const name of ['fullscreenchange','webkitfullscreenchange'])doc.addEventListener(name,sync,{signal:events.signal});
  for(const name of ['fullscreenerror','webkitfullscreenerror'])doc.addEventListener(name,()=>{
    if(!busy)return;busy=false;fail('当前浏览器未能进入网页全屏。可使用系统浏览器重试。');sync();
  },{signal:events.signal});
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
