// Presentation navigation only. Game decisions retain their own dialogs and handlers.
export class ModalNavigation {
  constructor({document, ids, canOpen=()=>true, prepare=()=>{}, fallback=()=>null}) {
    this.document=document;this.ids=new Set(ids);this.canOpen=canOpen;this.prepare=prepare;this.fallback=fallback;
    this.opener=null;this.switching=false;
    for(const id of this.ids)document.getElementById(id).addEventListener('close',()=>{
      if(this.switching||this.openDialog())return;
      const target=this.opener?.isConnected&&!this.opener.closest('dialog')?this.opener:this.fallback();
      target?.focus({preventScroll:true});
    });
  }
  openDialog(){return [...this.ids].map(id=>this.document.getElementById(id)).find(dialog=>dialog.open);}
  open(id,opener=null){
    if(!this.ids.has(id)||!this.canOpen(id))return false;
    this.prepare(id);
    if(opener&&!opener.closest('dialog'))this.opener=opener;
    this.closeAll();
    const dialog=this.document.getElementById(id);dialog.showModal();
    dialog.querySelector('[data-initial-focus],.close,button')?.focus({preventScroll:true});
    return true;
  }
  closeAll(){
    this.switching=true;
    try{for(const id of this.ids){const dialog=this.document.getElementById(id);if(dialog.open)dialog.close();}}
    finally{this.switching=false;}
  }
}

// Native buttons remain keyboard-operable. Arrow/Home/End provide tab navigation.
export function initManualTabs(doc){
  const tabs=[...doc.querySelectorAll('#manual-dialog [role="tab"]')];
  const select=tab=>{
    for(const button of tabs){
      const active=button===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      doc.getElementById(button.getAttribute('aria-controls')).hidden=!active;
    }
  };
  for(const [index,tab] of tabs.entries()){
    tab.addEventListener('click',()=>select(tab));
    tab.addEventListener('keydown',event=>{
      const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:
        event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
      if(next===null)return;event.preventDefault();select(tabs[next]);tabs[next].focus();
    });
  }
  if(tabs[0])select(tabs[0]);
}
