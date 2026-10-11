// Optional presentation loads after the game controls. It never owns or changes a run.
export class LazyPrisonScene {
  constructor({options,load=()=>import('./scene3d.js?v=0.6.10-1'),canAttach=()=>true}){
    this.options=options;this.load=load;this.canAttach=canAttach;
    this.instance=null;this.Scene=null;this.latest=null;this.loading=null;this.failed=false;
  }
  start(){
    if(this.loading)return this.loading;
    this.loading=Promise.resolve().then(()=>this.load()).then(module=>{
      if(typeof module.PrisonScene3D!=='function')throw new Error('Scene unavailable');
      this.Scene=module.PrisonScene3D;this.attach();return !this.failed;
    }).catch(()=>{this.failed=true;this.options.stage.dataset.renderer='css-fallback';return false;});
    return this.loading;
  }
  attach(){
    if(this.failed||this.instance||!this.Scene||!this.latest||!this.canAttach())return;
    try{
      this.instance=new this.Scene(this.options);
      this.instance.resize();this.instance.sync(this.latest.state,this.latest.selection);
    }catch{this.failed=true;this.options.stage.dataset.renderer='css-fallback';}
  }
  get ready(){return !!this.instance?.ready;}
  get active(){return !!this.instance?.active;}
  sync(state,selection){this.latest={state,selection};this.attach();this.instance?.sync(state,selection);}
  resize(){this.instance?.resize();}
  request(){this.instance?.request();}
  finishTweens(){this.instance?.finishTweens();}
  effectBefore(...args){return this.instance?.effectBefore(...args)||Promise.resolve();}
  effectAfter(...args){return this.instance?.effectAfter(...args)||Promise.resolve();}
}
