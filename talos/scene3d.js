import * as THREE from './vendor/three/three.module.js';
import {createTalosPrison} from './model/prison.js?v=0.6.4-1';
import {projectRoom, fitPrisonCamera, batchEditableNodes} from './model/projection.js?v=0.6.9-1';

const TIER_COLORS=[0xa4a798,0x68abc1,0xa785cf,0xd7a863,0xe08e83,0xe7abd6];
const ATLAS={elephant:[0,.5],lion:[.5,.5],rat:[0,0],wolf:[.5,0]};
const PORTRAIT_SIZE=1.9;
const ease=t=>1-Math.pow(1-t,3);

/** Solid mesh strokes retain width in WebGL; these belong to the gameplay adapter. */
export function createRoomAccent(room,config,keep=value=>value,shared={}){
  const group=new THREE.Group();group.name='Gameplay_selection';group.position.y=config.wallHeight+.405;room.root.add(group);
  const geometry=shared.box||keep(new THREE.BoxGeometry(1,1,1)),plane=shared.plane||keep(new THREE.PlaneGeometry(1,1));
  const basic=opacity=>keep(new THREE.MeshBasicMaterial({color:0xffd69a,transparent:true,opacity,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
  const edgeMaterial=basic(.94),cornerMaterial=basic(1),haloMaterial=basic(.13),fillMaterial=basic(.075);
  const edges=keep(new THREE.InstancedMesh(geometry,edgeMaterial,4)),corners=keep(new THREE.InstancedMesh(geometry,cornerMaterial,8)),halo=keep(new THREE.InstancedMesh(geometry,haloMaterial,4));
  edges.name='Solid_selection_edges';corners.name='Weighted_selection_corners';halo.name='Selection_edge_wash';
  const fill=new THREE.Mesh(plane,fillMaterial);fill.name='Selection_tint';fill.rotation.x=-Math.PI/2;fill.position.y=-.021;
  const width=config.cellPitchX-.08,depth=config.cellPitchZ-.08;fill.scale.set(width-.12,depth-.12,1);
  group.add(halo,fill,edges,corners);group.visible=false;
  const accent={group,edges,corners,halo,fill,edgeMaterial,cornerMaterial,haloMaterial,fillMaterial,width,depth,mode:'none'};
  setRoomAccent(accent,{});return accent;
}

function accentBorder(mesh,width,depth,thickness){
  const object=new THREE.Object3D();let index=0;
  for(const sign of [-1,1]){object.position.set(0,0,sign*depth/2);object.scale.set(width, .035, thickness);object.updateMatrix();mesh.setMatrixAt(index++,object.matrix);}
  for(const sign of [-1,1]){object.position.set(sign*width/2,0,0);object.scale.set(thickness,.035,depth);object.updateMatrix();mesh.setMatrixAt(index++,object.matrix);}
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
}

/** Target > selected > hover > candidate > route; no state or hit geometry is changed. */
export function setRoomAccent(accent,{selected=false,target=false,hover=false,candidate=false,route=false}={}){
  const mode=target?'target':selected?'selected':hover?'hover':candidate?'candidate':route?'route':'none';
  accent.group.visible=mode!=='none';if(mode===accent.mode&&accent.initialized)return;accent.mode=mode;accent.initialized=true;
  const strong=mode==='target'||mode==='selected',color=mode==='target'?0xa9e2d5:strong?0xffd69a:mode==='hover'?0xe8dcc5:mode==='candidate'?0xc8b187:0xad9272;
  for(const material of [accent.edgeMaterial,accent.cornerMaterial,accent.haloMaterial,accent.fillMaterial])material.color.setHex(color);
  accent.edgeMaterial.opacity=strong?1:mode==='hover'?.82:mode==='candidate'?.52:.36;
  accent.haloMaterial.opacity=strong?.14:.05;accent.fillMaterial.opacity=strong?.075:0;
  accent.corners.visible=strong||mode==='hover';accent.halo.visible=strong;accent.fill.visible=strong;
  const thickness=strong?.115:mode==='hover'?.075:.045;
  accentBorder(accent.edges,accent.width,accent.depth,thickness);accentBorder(accent.halo,accent.width,accent.depth,.23);
  const object=new THREE.Object3D(),length=strong?.62:.44,weight=strong?.15:.10;let index=0;
  for(const sx of [-1,1])for(const sz of [-1,1]){
    object.position.set(sx*(accent.width/2-length/2+weight/2),.006,sz*accent.depth/2);object.scale.set(length,.04,weight);object.updateMatrix();accent.corners.setMatrixAt(index++,object.matrix);
    object.position.set(sx*accent.width/2,.006,sz*(accent.depth/2-length/2+weight/2));object.scale.set(weight,.04,length);object.updateMatrix();accent.corners.setMatrixAt(index++,object.matrix);
  }
  accent.corners.instanceMatrix.needsUpdate=true;accent.corners.computeBoundingSphere();
}

/** Presentation adapter. Game state remains owned by the host, including during animations. */
export class PrisonScene3D {
  constructor({stage,board,motion=()=>true,fast=()=>false}){
    this.stage=stage;this.board=board;this.motion=motion;this.fast=fast;
    this.ready=false;this.disposed=false;this.cells=[];this.tweens=[];this.resources=new Set();
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.frame=this.frame.bind(this);
    try{
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.setClearColor(0x100e0a,1);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
      this.canvas=this.renderer.domElement;this.canvas.className='scene-3d-canvas';this.canvas.setAttribute('aria-hidden','true');this.stage.prepend(this.canvas);
      this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(0x14110d,.013);
      this.camera=new THREE.PerspectiveCamera(32,16/9,.1,160);
      this.asset=createTalosPrison({labels:false});this.scene.add(this.asset.root);
      // Batches stay inside their editable node. Door pivots and room transforms remain independent.
      this.batchCount=batchEditableNodes(this.asset.root);
      this.asset.lights.key.shadow.mapSize.set(1024,1024);
      this.makePresentation();
      this.ready=true;this.stage.classList.add('three-ready');
      Object.assign(this.stage.dataset,{renderer:'three-webgl',projection:'perspective',sceneAsset:'talos-editable-v1',worldTexture:'procedural-3d'});
      this.onLost=event=>{event.preventDefault();this.fallback('webgl-context-lost');};
      this.canvas.addEventListener('webglcontextlost',this.onLost);
      this.onVisibility=()=>{if(document.hidden){cancelAnimationFrame(this.raf);this.raf=null;this.previousFrame=0;this.finishTweens();}else this.request();};
      document.addEventListener('visibilitychange',this.onVisibility);
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(stage);this.resize();this.loadTextures();
      this.onHover=event=>{if(this.stage.getAttribute('aria-busy')==='true')return;const id=event.target.closest('[data-room]')?.dataset.room;this.hovered=id===undefined?null:Number(id);if(this.state)this.sync(this.state,this.selection);};
      this.onLeave=()=>{this.hovered=null;if(this.stage.getAttribute('aria-busy')!=='true'&&this.state)this.sync(this.state,this.selection);};
      this.onFocus=event=>{const id=event.target.closest('[data-room]')?.dataset.room;this.focused=id===undefined?null:Number(id);if(this.stage.getAttribute('aria-busy')!=='true'&&this.state)this.sync(this.state,this.selection);};
      this.onBlur=()=>{this.focused=null;if(this.stage.getAttribute('aria-busy')!=='true'&&this.state)this.sync(this.state,this.selection);};
      board.addEventListener('pointerover',this.onHover);board.addEventListener('pointerleave',this.onLeave);
      board.addEventListener('focusin',this.onFocus);board.addEventListener('focusout',this.onBlur);
    }catch(error){this.fallback('webgl-unavailable');this.releaseResources();this.renderer?.dispose();}
  }
  get active(){return this.ready&&this.motion()&&!this.reduced.matches&&!document.hidden;}
  keep(resource){this.resources.add(resource);return resource;}
  canvasTexture(draw,size=128){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;draw(canvas.getContext('2d'),size);const map=this.keep(new THREE.CanvasTexture(canvas));map.colorSpace=THREE.SRGBColorSpace;return map;}
  makePresentation(){
    const mask=this.canvasTexture((context,size)=>{const g=context.createRadialGradient(size/2,size/2,size*.28,size/2,size/2,size*.49);g.addColorStop(0,'white');g.addColorStop(.75,'white');g.addColorStop(1,'black');context.fillStyle=g;context.fillRect(0,0,size,size);});
    const glow=this.canvasTexture((context,size)=>{const g=context.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);g.addColorStop(0,'#ffffffff');g.addColorStop(.2,'#ffffffa0');g.addColorStop(1,'#ffffff00');context.fillStyle=g;context.fillRect(0,0,size,size);});
    const tierGeometry=this.keep(new THREE.RingGeometry(.65,.73,40));
    const accentGeometry={box:this.keep(new THREE.BoxGeometry(1,1,1)),plane:this.keep(new THREE.PlaneGeometry(1,1))};
    this.cells=this.asset.rooms.map(room=>{
      const portraitMaterial=this.keep(new THREE.SpriteMaterial({alphaMap:mask,color:0xffffff,transparent:true,opacity:0,depthWrite:false}));
      const portrait=new THREE.Sprite(portraitMaterial);portrait.name='Gameplay_prisoner';portrait.scale.set(PORTRAIT_SIZE,PORTRAIT_SIZE,1);room.portraitAnchor.add(portrait);
      const tierMaterial=this.keep(new THREE.MeshBasicMaterial({color:TIER_COLORS[0],transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide}));
      const tierRing=new THREE.Mesh(tierGeometry,tierMaterial);tierRing.name='Gameplay_rarity';tierRing.rotation.x=-Math.PI/2;tierRing.position.y=.014;room.floorAnchor.add(tierRing);
      const accent=createRoomAccent(room,this.asset.config,value=>this.keep(value),accentGeometry);
      return {...room,group:room.root,portrait,tierRing,tierMaterial,accent,open:false,key:null};
    });
    const material=this.keep(new THREE.SpriteMaterial({map:glow,color:0xe9ca83,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.warden=new THREE.Sprite(material);this.warden.name='Gameplay_position';this.warden.scale.set(.64,.64,1);this.scene.add(this.warden);
  }
  loadTextures(){
    new THREE.TextureLoader().load('./assets/prisoners-atlas-v1.png',atlas=>{
      if(this.disposed||!this.ready){atlas.dispose();return;}atlas.colorSpace=THREE.SRGBColorSpace;this.keep(atlas);this.atlas={};
      for(const [code,[x,y]]of Object.entries(ATLAS)){const map=atlas.clone();map.repeat.set(.5,.5);map.offset.set(x,y);map.needsUpdate=true;this.keep(map);this.atlas[code]=map;}
      this.stage.dataset.portraitTexture='ready';if(this.state)this.sync(this.state,this.selection);
    },undefined,()=>{this.stage.dataset.portraitTexture='unavailable';});
  }
  sync(state,{selected=0,armed=false,pairTarget=null,routeRooms=[]}={}){
    if(!this.ready)return;this.state=state;this.selection={selected,armed,pairTarget,routeRooms};
    const candidates=state.phase==='patrol'&&!state.pending.length?state.destinations:[];
    for(const [id,cell]of this.cells.entries()){
      const room=state.rooms[id],prisoner=room?.prisoner;if(!room)continue;const open=room.status!=='closed';
      // Initial/read-save sync and committed transitions only. Hover never restarts a moving gate.
      if(cell.open!==open||!this.hasSynced){this.asset.setDoor(id,open?1:0);cell.open=open;}
      cell.portrait.visible=!!prisoner;cell.portrait.material.opacity=prisoner?1:0;
      const key=prisoner?.code||null;if(cell.key!==key||cell.portrait.material.map!==(prisoner?this.atlas?.[key]||null:null)){
        cell.key=key;cell.portrait.material.map=prisoner?this.atlas?.[key]||null:null;cell.portrait.material.needsUpdate=true;
      }
      cell.tierRing.visible=!!prisoner;cell.tierMaterial.color.setHex(TIER_COLORS[prisoner?.tier]||TIER_COLORS[0]);
      const source=selected===id,target=pairTarget===id,candidate=candidates.includes(id),hover=this.hovered===id||this.focused===id,route=routeRooms.includes(id);
      cell.highlight.visible=false;
      if(cell.accent)setRoomAccent(cell.accent,{selected:source,target,candidate,hover,route});
    }
    this.hasSynced=true;
    this.stage.dataset.sceneSelection=this.cells.filter(cell=>cell.accent?.group.visible).map(cell=>`${cell.id}:${cell.accent.mode}`).join(',');
    const position=Number.isInteger(state.position)?this.asset.getRoomAnchor(state.position,'floor'):null;
    if(position){const forward=new THREE.Vector3(0,.15,this.asset.config.cellPitchZ*.45);forward.applyQuaternion(this.cells[state.position].group.getWorldQuaternion(new THREE.Quaternion()));this.warden.position.copy(position).add(forward);}
    this.warden.visible=!!position;this.renderer.shadowMap.needsUpdate=true;this.layout();this.request();
  }
  layout(){
    if(!this.ready||!this.width)return;this.asset.root.updateMatrixWorld(true);
    for(const [id,cell]of this.cells.entries()){
      const node=this.board.querySelector(`[data-room="${id}"]`);if(!node)continue;
      const p=projectRoom(cell,this.asset.config,this.camera,this.width,this.height);
      Object.assign(node.style,{left:`${p.left}px`,top:`${p.top}px`,width:`${p.width}px`,height:`${p.height}px`});node.dataset.sceneRoom='true';
      node.style.setProperty('--scene-label-y',`${p.label.y-p.top}px`);node.style.setProperty('--scene-number-y',`${p.number.y-p.top}px`);node.style.setProperty('--scene-number-x',`${p.number.x-p.left}px`);
      node.style.setProperty('--scene-label-x',`${p.label.x-p.left}px`);
      node.style.setProperty('--scene-hit-polygon',p.hitPolygon);
    }
    this.stage.dataset.sceneRoomCount=String(this.board.querySelectorAll('[data-scene-room]').length);
  }
  resize(){
    if(!this.ready)return;const rect=this.stage.getBoundingClientRect();if(!rect.width||!rect.height)return;
    this.width=rect.width;this.height=rect.height;fitPrisonCamera(this.camera,this.width,this.height);
    this.renderer.setSize(this.width,this.height,false);this.layout();this.request();
  }
  request(dirty=true){if(dirty)this.dirty=true;if(this.ready&&!this.disposed&&!document.hidden&&!this.raf)this.raf=requestAnimationFrame(this.frame);}
  frame(time){
    this.raf=null;if(!this.ready||this.disposed||document.hidden)return;
    const delta=this.previousFrame?Math.min(.05,(time-this.previousFrame)/1000):0;this.previousFrame=time;
    for(const tween of [...this.tweens]){const progress=Math.min(1,(time-tween.start)/tween.duration);tween.update(ease(progress),progress);this.renderer.shadowMap.needsUpdate=true;if(progress===1){this.tweens.splice(this.tweens.indexOf(tween),1);tween.finish();tween.resolve();}}
    if(this.active){this.asset.update(delta,time/1000);for(const cell of this.cells)if(cell.accent&&['selected','target'].includes(cell.accent.mode))cell.accent.haloMaterial.opacity=.14+Math.sin(time*.0026)*.025;}
    if(this.dirty||!this.lastDraw||time-this.lastDraw>=32||this.tweens.length){this.renderer.render(this.scene,this.camera);this.lastDraw=time;this.dirty=false;Object.assign(this.stage.dataset,{sceneCalls:String(this.renderer.info.render.calls),sceneTriangles:String(this.renderer.info.render.triangles),sceneBatched:String(this.batchCount)});}
    if(this.active||this.tweens.length)this.request(false);
  }
  tween(duration,update,finish=()=>{}){
    if(!this.active){update(1,1);finish();this.request();return Promise.resolve();}
    return new Promise(resolve=>{this.tweens.push({duration:duration*(this.fast()?.45:1),start:performance.now(),update,finish,resolve});this.request();});
  }
  finishTweens(){for(const tween of this.tweens){tween.update(1,1);tween.finish();tween.resolve();}this.tweens=[];}
  async effectBefore(action,before){
    if(!this.ready)return;const cell=this.cells[action.room];if(!cell)return;
    if(action.type==='visit'&&before.rooms[action.room]?.status==='closed'){
      await this.tween(380,t=>this.asset.setDoor(action.room,t),()=>this.asset.setDoor(action.room,1));
    }else if(action.type==='eat'){
      const prey=this.cells[action.prey];if(!prey)return;
      if(!before.rooms[action.prey]?.prisoner){
        // Pulse the cage and visible eater without creating a concealed animal sprite.
        const accent=prey.accent,previous=accent?{group:accent.group.visible,fill:accent.fill.visible,fillOpacity:accent.fillMaterial.opacity,edgeOpacity:accent.edgeMaterial.opacity}:null;
        if(accent){accent.group.visible=true;accent.fill.visible=true;}
        await this.tween(340,t=>{
          const pulse=Math.sin(Math.PI*t),size=PORTRAIT_SIZE*(1+pulse*.12);cell.portrait.scale.set(size,size,1);
          if(accent){accent.fillMaterial.opacity=.075+pulse*.17;accent.edgeMaterial.opacity=.75+pulse*.25;}
        },()=>{
          cell.portrait.scale.set(PORTRAIT_SIZE,PORTRAIT_SIZE,1);
          if(accent){accent.group.visible=previous.group;accent.fill.visible=previous.fill;accent.fillMaterial.opacity=previous.fillOpacity;accent.edgeMaterial.opacity=previous.edgeOpacity;}
        });
        return;
      }
      const ghost=new THREE.Sprite(prey.portrait.material.clone());ghost.material.depthTest=false;ghost.renderOrder=10;ghost.scale.copy(prey.portrait.scale);
      const start=prey.portrait.getWorldPosition(new THREE.Vector3()),end=cell.portrait.getWorldPosition(new THREE.Vector3());ghost.position.copy(start);this.scene.add(ghost);this.ghosts??=new Set();this.ghosts.add(ghost);
      await this.tween(380,t=>{ghost.position.lerpVectors(start,end,t);ghost.position.y+=Math.sin(Math.PI*t)*1.25;ghost.scale.set(PORTRAIT_SIZE*(1-t*.86),PORTRAIT_SIZE*(1-t*.86),1);ghost.material.opacity=1-t*.7;prey.portrait.material.opacity=1-t;cell.portrait.scale.set(PORTRAIT_SIZE*(1+Math.sin(Math.PI*t)*.12),PORTRAIT_SIZE*(1+Math.sin(Math.PI*t)*.12),1);},()=>{ghost.removeFromParent();ghost.material.dispose();this.ghosts.delete(ghost);prey.portrait.material.opacity=1;cell.portrait.scale.set(PORTRAIT_SIZE,PORTRAIT_SIZE,1);});
    }else if(action.type==='reroll'){
      await this.tween(280,(t,p)=>{cell.portrait.scale.x=PORTRAIT_SIZE*Math.max(.08,Math.abs(Math.cos(p*Math.PI)));cell.tierMaterial.opacity=.4+Math.sin(p*Math.PI)*.5;},()=>{cell.portrait.scale.set(PORTRAIT_SIZE,PORTRAIT_SIZE,1);cell.tierMaterial.opacity=.4;});
    }
  }
  async effectAfter(before,after,action){
    if(!this.ready)return;
    const changed=after.rooms.filter(room=>before.rooms[room.id].status==='closed'&&room.status!=='closed'||room.prisoner&&(before.rooms[room.id].prisoner?.id!==room.prisoner.id||before.rooms[room.id].prisoner?.code!==room.prisoner.code||before.rooms[room.id].prisoner?.tier!==room.prisoner.tier));
    await Promise.all(changed.map(room=>{
      const cell=this.cells[room.id],opening=before.rooms[room.id].status==='closed'&&!(action.type==='visit'&&room.id===action.room);
      if(opening)this.asset.setDoor(room.id,0);
      return this.tween(340,(t,p)=>{const size=PORTRAIT_SIZE*(1+Math.sin(p*Math.PI)*.1);cell.portrait.scale.set(size,size,1);cell.tierMaterial.opacity=.4+Math.sin(p*Math.PI)*.5;if(opening)this.asset.setDoor(room.id,t);},()=>{cell.portrait.scale.set(PORTRAIT_SIZE,PORTRAIT_SIZE,1);cell.tierMaterial.opacity=.4;if(opening)this.asset.setDoor(room.id,1);});
    }));
  }
  fallback(reason){
    this.ready=false;this.stage.classList.remove('three-ready');this.stage.dataset.renderer='css-fallback';this.stage.dataset.rendererReason=reason;
    delete this.stage.dataset.projection;delete this.stage.dataset.sceneAsset;
    this.canvas?.remove();cancelAnimationFrame(this.raf);this.raf=null;this.finishTweens();
    for(const node of this.board.querySelectorAll('[data-scene-room]')){for(const key of ['left','top','width','height'])node.style[key]='';for(const key of ['--scene-label-y','--scene-label-x','--scene-number-y','--scene-number-x','--scene-hit-polygon'])node.style.removeProperty(key);delete node.dataset.sceneRoom;}
  }
  releaseResources(){
    // Remove host-owned objects before disposing the asset's architecture and materials.
    for(const cell of this.cells){cell.portrait.removeFromParent();cell.tierRing.removeFromParent();cell.accent?.group.removeFromParent();}
    this.warden?.removeFromParent();for(const ghost of this.ghosts||[]){ghost.removeFromParent();ghost.material.dispose();}this.ghosts?.clear();
    for(const resource of this.resources)resource.dispose();this.resources.clear();this.asset?.dispose();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.observer?.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);this.board.removeEventListener('pointerover',this.onHover);this.board.removeEventListener('pointerleave',this.onLeave);this.board.removeEventListener('focusin',this.onFocus);this.board.removeEventListener('focusout',this.onBlur);this.canvas?.removeEventListener('webglcontextlost',this.onLost);
    this.fallback('disposed');this.releaseResources();this.renderer?.dispose();
  }
}
