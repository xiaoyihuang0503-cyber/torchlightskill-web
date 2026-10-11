/* Mobile layout is transient UI state. It never reads or writes a run or preferences. */
export const MOBILE_LANDSCAPE_QUERY='(orientation: landscape) and (max-height: 500px) and (max-width: 1100px)';
export const MOBILE_PORTRAIT_QUERY='(orientation: portrait) and (max-width: 600px)';

// Older MediaQueryList objects expose addListener instead of EventTarget methods.
// Own the abort cleanup so both forms have the same lifetime.
export function listenMediaChange(query,callback,{signal}={}) {
  if(!query||signal?.aborted)return ()=>{};
  let remove;
  if(typeof query.addEventListener==='function'){
    query.addEventListener('change',callback);
    remove=()=>query.removeEventListener?.('change',callback);
  }else if(typeof query.addListener==='function'){
    query.addListener(callback);
    remove=()=>query.removeListener?.(callback);
  }else return ()=>{};
  let listening=true;
  const stop=()=>{
    if(!listening)return;
    listening=false;remove();signal?.removeEventListener?.('abort',stop);
  };
  signal?.addEventListener?.('abort',stop,{once:true});
  return stop;
}

export class MobilePrisonUI {
  constructor({onLayout=()=>{}}={}) {
    this.onLayout=onLayout;
    this.landscape=matchMedia(MOBILE_LANDSCAPE_QUERY);
    this.portrait=matchMedia(MOBILE_PORTRAIT_QUERY);
    this.panels={journalHidden:true,sidebarHidden:true};
    this.utility=null;
    this.active=this.landscape.matches||this.portrait.matches;
    this.abort=new AbortController();
    this.frames=0;
    this.toolAttributes=new Map();
    this.screen=document.getElementById('game-screen');
    this.viewport=this.screen?.querySelector('.game-viewport');
    this.stage=this.screen?.querySelector('.game-stage');
    if(!this.screen||!this.viewport||!this.stage)return;
    this.mount();
    const options={signal:this.abort.signal};
    listenMediaChange(this.landscape,()=>this.modeChanged(),options);
    listenMediaChange(this.portrait,()=>this.modeChanged(),options);
    window.addEventListener('resize',()=>this.scheduleViewport(),options);
    window.visualViewport?.addEventListener('resize',()=>this.scheduleViewport(),options);
    window.visualViewport?.addEventListener('scroll',()=>this.scheduleViewport(),options);
    document.addEventListener('click',event=>this.clicked(event),{...options,capture:true});
    document.addEventListener('keydown',event=>this.keyed(event),{...options,capture:true});
    this.contentObserver=new MutationObserver(()=>{
      this.prepareTools();
      this.updateCounts();
      if(this.toolDialog.open)this.toolDialog.close();
    });
    for(const id of ['tools','tool-count','rainbow-count']){
      const node=document.getElementById(id);
      if(node)this.contentObserver.observe(node,{childList:true,subtree:true,characterData:true});
    }
    this.roomObserver=new MutationObserver(()=>this.updateRooms());
    const board=document.getElementById('board');
    if(board)this.roomObserver.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-label','aria-pressed']});
    this.visibilityObserver=new MutationObserver(()=>{
      if(this.screen.hidden){this.closeUtilities();this.panels.journalHidden=true;this.panels.sidebarHidden=true;}
      this.updateScrim();this.onLayout();
    });
    this.visibilityObserver.observe(this.screen,{attributes:true,attributeFilter:['hidden']});
    this.floatObserver=new MutationObserver(()=>this.scheduleViewport());
    for(const id of ['context-actions','goal-tooltip','journal-tooltip','mechanics-tooltip']){
      const node=document.getElementById(id);
      if(node)this.floatObserver.observe(node,{attributes:true,attributeFilter:['hidden','style'],childList:true,subtree:true});
    }
    this.updateModeClasses();
    this.prepareTools();
    this.updateCounts();
    this.updateRooms();
    this.measureViewport();
  }

  /* app.syncLayout uses this result, while stored desktop preferences stay untouched. */
  layout(desktopPreferences) {
    this.updateModeClasses();
    this.updateScrim();
    return this.active?{...desktopPreferences,...this.panels}:desktopPreferences;
  }

  togglePanel(key) {
    if(!this.active||!Object.hasOwn(this.panels,key))return false;
    this.closeUtilities();
    this.panels[key]=!this.panels[key];
    this.updateScrim();
    this.onLayout();
    return true;
  }

  setImmersive(hidden) {
    if(!this.active)return false;
    this.closeUtilities();
    this.panels.journalHidden=!!hidden;
    this.panels.sidebarHidden=!!hidden;
    this.updateScrim();
    this.onLayout();
    return true;
  }

  mount() {
    this.scrim=document.createElement('button');
    this.scrim.type='button';this.scrim.className='mobile-panel-scrim';this.scrim.hidden=true;
    this.scrim.setAttribute('aria-label','收起打开的面板');
    /* Same stacking context as the HUD drawers, so the scrim stays below them. */
    this.stage.append(this.scrim);
    this.actions=document.createElement('div');this.actions.className='mobile-hud-actions';
    for(const [kind,label,id] of [['tools','牢房 / 刑具','mobile-tools-toggle'],['rainbow','绮彩收容','mobile-rainbow-toggle']]){
      const button=document.createElement('button');button.type='button';button.id=id;
      button.dataset.mobileUtility=kind;button.setAttribute('aria-expanded','false');
      const panel=this.stage.querySelector(kind==='tools'?'.game-tools':'.game-rainbow');
      if(panel){panel.id ||= `mobile-${kind}-panel`;button.setAttribute('aria-controls',panel.id);}
      const copy=document.createElement('span');copy.textContent=label;
      const count=document.createElement('small');count.dataset.mobileCount=kind;
      button.append(copy,count);this.actions.append(button);
    }
    this.viewport.append(this.actions);
    /* Large alternate room targets activate the existing board button, with identical guards. */
    this.roomPicker=document.createElement('details');this.roomPicker.className='mobile-room-picker';
    const summary=document.createElement('summary');summary.textContent='选择牢房';
    this.roomChoices=document.createElement('div');this.roomChoices.className='mobile-room-choices';
    this.roomPicker.append(summary,this.roomChoices);this.stage.querySelector('.game-tools')?.prepend(this.roomPicker);
    this.notes=[];
    for(const host of [document.querySelector('.startup-content'),this.viewport]){
      if(!host)continue;
      const note=document.createElement('p');note.className='mobile-orientation-note';
      note.textContent='竖屏已显示完整牢笼；横屏操作更舒适。';
      host.prepend(note);this.notes.push(note);
    }
    this.toolDialog=document.createElement('dialog');this.toolDialog.id='mobile-tool-dialog';
    this.toolDialog.setAttribute('aria-labelledby','mobile-tool-title');
    const heading=document.createElement('div');heading.className='dialog-heading';
    this.toolTitle=document.createElement('h2');this.toolTitle.id='mobile-tool-title';
    const close=document.createElement('button');close.type='button';close.className='close';
    close.setAttribute('aria-label','关闭刑具说明');close.textContent='×';
    close.addEventListener('click',()=>this.toolDialog.close(),{signal:this.abort.signal});
    this.toolCopy=document.createElement('div');this.toolCopy.className='mobile-tool-copy';
    heading.append(this.toolTitle,close);this.toolDialog.append(heading,this.toolCopy);document.body.append(this.toolDialog);
    this.toolDialog.addEventListener('click',event=>{
      if(event.target!==this.toolDialog)return;
      const r=this.toolDialog.getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.toolDialog.close();
    },{signal:this.abort.signal});
  }

  modeChanged() {
    const active=this.landscape.matches||this.portrait.matches;
    if(active&&!this.active)this.panels={journalHidden:true,sidebarHidden:true};
    this.active=active;
    this.closeUtilities();
    this.updateModeClasses();this.prepareTools();this.updateScrim();
    this.onLayout();this.scheduleViewport();
  }

  updateModeClasses() {
    this.screen?.classList.toggle('mobile-landscape',this.landscape.matches);
    this.screen?.classList.toggle('mobile-portrait',this.portrait.matches);
    document.documentElement.classList.toggle('mobile-ui-active',this.active);
  }

  updateCounts() {
    for(const [kind,id] of [['tools','tool-count'],['rainbow','rainbow-count']]){
      const count=this.actions?.querySelector(`[data-mobile-count="${kind}"]`);
      if(count)count.textContent=document.getElementById(id)?.textContent?.trim()||'0';
    }
  }

  updateRooms() {
    if(!this.roomChoices)return;
    const buttons=[];
    for(const room of document.querySelectorAll('#board .room[data-room]')){
      const button=document.createElement('button');button.type='button';button.className='mobile-room-choice';
      button.dataset.mobileRoom=room.dataset.room;
      const label=room.getAttribute('aria-label')||`${Number(room.dataset.room)+1} 号牢房`;
      button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',room.getAttribute('aria-pressed')||'false');
      const number=document.createElement('strong');number.textContent=`${Number(room.dataset.room)+1} 号`;
      const copy=document.createElement('small');copy.textContent=label.replace(/^\d+\s*号\s*/,'');
      button.append(number,copy);buttons.push(button);
    }
    this.roomChoices.replaceChildren(...buttons);
  }

  prepareTools() {
    if(!this.screen)return;
    for(const tool of this.toolAttributes.keys())if(!tool.isConnected)this.toolAttributes.delete(tool);
    for(const tool of this.screen.querySelectorAll('#tools .tool')){
      if(this.active){
        if(!this.toolAttributes.has(tool))this.toolAttributes.set(tool,Object.fromEntries(['tabindex','role','aria-label','aria-haspopup'].map(key=>[key,tool.getAttribute(key)])));
        tool.tabIndex=0;tool.setAttribute('role','button');tool.setAttribute('aria-haspopup','dialog');
        tool.setAttribute('aria-label',`查看${tool.querySelector('strong')?.textContent||'刑具'}说明`);
      }else if(this.toolAttributes.has(tool))this.restoreTool(tool);
    }
  }

  restoreTool(tool) {
    for(const [key,value] of Object.entries(this.toolAttributes.get(tool)||{}))value===null?tool.removeAttribute(key):tool.setAttribute(key,value);
    this.toolAttributes.delete(tool);
  }

  showTool(tool) {
    if(!this.active||this.screen.hidden||this.stage.getAttribute('aria-busy')==='true'||document.querySelector('dialog[open]'))return;
    const description=tool.querySelector('p');if(!description)return;
    this.toolTitle.textContent=tool.querySelector('strong')?.textContent||'刑具说明';
    this.toolCopy.replaceChildren(description.cloneNode(true));this.toolDialog.showModal();
  }

  clicked(event) {
    if(!this.active||this.screen.hidden)return;
    if(this.toolDialog.open&&event.target.closest('#mobile-tool-dialog')){
      if(event.target.closest('.close'))this.toolDialog.close();
      else if(event.target===this.toolDialog){
        const r=this.toolDialog.getBoundingClientRect();
        if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.toolDialog.close();
      }
      event.stopImmediatePropagation();return;
    }
    const utility=event.target.closest('[data-mobile-utility]');
    if(utility&&this.actions.contains(utility)){
      event.preventDefault();event.stopImmediatePropagation();
      this.panels={journalHidden:true,sidebarHidden:true};this.onLayout();
      this.utility=this.utility===utility.dataset.mobileUtility?null:utility.dataset.mobileUtility;
      this.updateUtility();return;
    }
    if(event.target===this.scrim){event.preventDefault();event.stopImmediatePropagation();this.closePanels();return;}
    const choice=event.target.closest('[data-mobile-room]');
    if(choice&&this.roomChoices.contains(choice)){
      event.preventDefault();event.stopImmediatePropagation();
      if(this.stage.getAttribute('aria-busy')!=='true'){
        const room=document.querySelector(`#board .room[data-room="${choice.dataset.mobileRoom}"]`);
        this.closeUtilities();room?.click();
      }
      return;
    }
    const tool=event.target.closest('#tools .tool');
    if(tool){event.stopImmediatePropagation();this.showTool(tool);}
  }

  keyed(event) {
    if(!this.active||this.screen.hidden)return;
    if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&(this.utility||!this.panels.journalHidden||!this.panels.sidebarHidden)){
      event.preventDefault();event.stopImmediatePropagation();this.closePanels();return;
    }
    if((event.key==='Enter'||event.key===' ')&&!event.repeat){
      const tool=event.target.closest('#tools .tool');
      if(tool){event.preventDefault();event.stopImmediatePropagation();this.showTool(tool);}
    }
  }

  closePanels() {
    const restore=this.utility?this.actions.querySelector(`[data-mobile-utility="${this.utility}"]`):document.getElementById(!this.panels.journalHidden?'journal-toggle':'sidebar-toggle');
    this.panels={journalHidden:true,sidebarHidden:true};this.closeUtilities();this.updateScrim();this.onLayout();
    restore?.focus({preventScroll:true});
  }

  closeUtilities() {
    this.utility=null;this.updateUtility();
    if(this.toolDialog?.open)this.toolDialog.close();
  }

  updateUtility() {
    if(!this.screen)return;
    for(const kind of ['tools','rainbow']){
      this.screen.classList.toggle(`mobile-${kind}-open`,this.active&&this.utility===kind);
      this.actions?.querySelector(`[data-mobile-utility="${kind}"]`)?.setAttribute('aria-expanded',String(this.active&&this.utility===kind));
    }
    this.updateScrim();
  }

  updateScrim() {
    if(this.scrim)this.scrim.hidden=!(this.active&&!this.screen.hidden&&(this.utility||!this.panels.journalHidden||!this.panels.sidebarHidden));
    if(this.actions)this.actions.hidden=this.active&&(!this.panels.journalHidden||!this.panels.sidebarHidden);
  }

  scheduleViewport() {
    if(!this.frames)this.frames=requestAnimationFrame(()=>{this.frames=0;this.measureViewport();});
  }

  measureViewport() {
    const view=window.visualViewport;
    const height=view?.height||innerHeight,top=view?.offsetTop||0;
    document.documentElement.style.setProperty('--mobile-visible-height',`${height}px`);
    document.documentElement.style.setProperty('--mobile-visible-top',`${top}px`);
    if(!this.active)return;
    /* Re-clamp existing menus after address-bar/keyboard changes; never recreate them. */
    const left=view?.offsetLeft||0,width=view?.width||innerWidth,margin=8;
    for(const id of ['context-actions','goal-tooltip','journal-tooltip','mechanics-tooltip']){
      const tip=document.getElementById(id);if(!tip||tip.hidden)continue;
      const desiredTop=id==='mechanics-tooltip'?document.getElementById('lab-settings').getBoundingClientRect().bottom+12:parseFloat(tip.style.top);
      const available=id==='mechanics-tooltip'?top+height-Math.max(top+margin,desiredTop)-margin:height-margin*2;
      const maxHeight=`${Math.max(44,available)}px`;
      if(tip.style.getPropertyValue('--mobile-tip-height')!==maxHeight)tip.style.setProperty('--mobile-tip-height',maxHeight);
      const r=tip.getBoundingClientRect();
      const desiredLeft=parseFloat(tip.style.left);
      const x=Math.max(left+margin,Math.min(Number.isFinite(desiredLeft)?desiredLeft:r.left,left+width-r.width-margin));
      const y=Math.max(top+margin,Math.min(Number.isFinite(desiredTop)?desiredTop:r.top,top+height-r.height-margin));
      const nextLeft=`${Math.round(x)}px`,nextTop=`${Math.round(y)}px`;
      if(tip.style.getPropertyValue('--mobile-tip-left')!==nextLeft)tip.style.setProperty('--mobile-tip-left',nextLeft);
      if(tip.style.getPropertyValue('--mobile-tip-top')!==nextTop)tip.style.setProperty('--mobile-tip-top',nextTop);
      tip.dataset.mobileClamped='true';
    }
  }

  destroy() {
    this.abort.abort();this.contentObserver?.disconnect();this.roomObserver?.disconnect();this.visibilityObserver?.disconnect();this.floatObserver?.disconnect();
    if(this.frames)cancelAnimationFrame(this.frames);
    this.closeUtilities();
    for(const tool of this.toolAttributes.keys())this.restoreTool(tool);
    for(const node of [this.scrim,this.actions,this.roomPicker,this.toolDialog,...(this.notes||[])])node?.remove();
    this.screen?.classList.remove('mobile-landscape','mobile-portrait');
    for(const id of ['context-actions','goal-tooltip','journal-tooltip','mechanics-tooltip']){
      const tip=document.getElementById(id);
      for(const key of ['--mobile-tip-height','--mobile-tip-left','--mobile-tip-top'])tip?.style.removeProperty(key);
      if(tip)delete tip.dataset.mobileClamped;
    }
    document.documentElement.classList.remove('mobile-ui-active');
    document.documentElement.style.removeProperty('--mobile-visible-height');document.documentElement.style.removeProperty('--mobile-visible-top');
  }
}
