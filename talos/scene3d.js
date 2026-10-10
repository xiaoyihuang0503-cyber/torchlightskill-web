import * as THREE from './vendor/three/three.module.js';

const CELLS=[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[5,1],[5,2],[5,3],[4,3],[3,3],[2,3],[1,3],[0,3],[0,2],[0,1]];
const TIER_COLORS=[0xa4a798,0x68abc1,0xa785cf,0xd7a863,0xe08e83,0xbee2b8];
const ATLAS={elephant:[0,.5],lion:[.5,.5],rat:[0,0],wolf:[.5,0]};
const ease=t=>1-Math.pow(1-t,3);

/** Presentation only: one camera projects both the environment and the HTML hit areas. */
export class PrisonScene3D {
  constructor({stage,board,motion=()=>true,fast=()=>false}){
    this.stage=stage;this.board=board;this.motion=motion;this.fast=fast;
    this.ready=false;this.disposed=false;this.cells=[];this.fires=[];this.tweens=[];this.resources=new Set();this.geometries=new Map();
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.frame=this.frame.bind(this);
    try{
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.setClearColor(0x101413,0);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.9;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
      this.canvas=this.renderer.domElement;this.canvas.className='scene-3d-canvas';this.canvas.setAttribute('aria-hidden','true');this.stage.prepend(this.canvas);
      this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(0x101413,60,120);
      this.camera=new THREE.PerspectiveCamera(19.762,16/9,.1,120);this.camera.position.set(0,40,18.8023);this.camera.lookAt(0,0,.15);
      this.camera.updateMatrixWorld();this.makeMaterials();this.makeEnvironment();CELLS.forEach((position,id)=>this.makeCell(position,id));this.batchArchitecture();
      this.ready=true;this.stage.classList.add('three-ready');this.stage.dataset.renderer='three-webgl';this.stage.dataset.projection='perspective';
      this.onLost=event=>{event.preventDefault();this.fallback('webgl-context-lost');};
      this.canvas.addEventListener('webglcontextlost',this.onLost);
      this.onVisibility=()=>{if(document.hidden){cancelAnimationFrame(this.raf);this.raf=null;this.finishTweens();}else this.request();};
      document.addEventListener('visibilitychange',this.onVisibility);
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(stage);this.resize();this.loadTextures();
      this.onHover=event=>{if(this.stage.getAttribute('aria-busy')==='true')return;const id=event.target.closest('[data-room]')?.dataset.room;this.hovered=id===undefined?null:Number(id);if(this.state)this.sync(this.state,this.selection);};
      this.onLeave=()=>{this.hovered=null;if(this.stage.getAttribute('aria-busy')!=='true'&&this.state)this.sync(this.state,this.selection);};
      board.addEventListener('pointerover',this.onHover);board.addEventListener('pointerleave',this.onLeave);
    }catch(error){this.fallback('webgl-unavailable');for(const resource of this.resources)resource.dispose();this.resources.clear();this.renderer?.dispose();}
  }
  get active(){return this.ready&&this.motion()&&!this.reduced.matches&&!document.hidden;}
  material(options){const value=new THREE.MeshStandardMaterial(options);this.resources.add(value);return value;}
  box(width,height,depth){const key=`${width}/${height}/${depth}`;if(!this.geometries.has(key)){const value=new THREE.BoxGeometry(width,height,depth);this.geometries.set(key,value);this.resources.add(value);}return this.geometries.get(key);}
  mesh(parent,geometry,material,x=0,y=0,z=0,shadow=true){const value=new THREE.Mesh(geometry,material);value.position.set(x,y,z);value.castShadow=shadow;value.receiveShadow=true;parent.add(value);return value;}
  block(parent,width,height,depth,material,x=0,y=0,z=0,shadow=true){return this.mesh(parent,this.box(width,height,depth),material,x,y,z,shadow);}
  batchMeshes(parent,meshes,world=false){
    const batches=new Map();for(const mesh of meshes){const key=`${mesh.geometry.uuid}/${mesh.material.uuid}/${mesh.castShadow}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(mesh);}
    for(const values of batches.values()){if(values.length<2)continue;const first=values[0],batch=new THREE.InstancedMesh(first.geometry,first.material,values.length);batch.castShadow=first.castShadow;batch.receiveShadow=true;
      values.forEach((mesh,index)=>{mesh.updateMatrix();batch.setMatrixAt(index,world?mesh.matrixWorld:mesh.matrix);mesh.parent.remove(mesh);});batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();parent.add(batch);
    }
  }
  batchArchitecture(){
    this.scene.updateMatrixWorld(true);const staticMeshes=[];
    this.scene.traverse(mesh=>{if(!mesh.isMesh||mesh.isInstancedMesh)return;let node=mesh,dynamic=false;while(node&&node!==this.scene){if(node.userData.dynamic){dynamic=true;break;}node=node.parent;}if(!dynamic)staticMeshes.push(mesh);});
    this.batchMeshes(this.scene,staticMeshes,true);
    for(const cell of this.cells){for(const {hinge}of cell.doors)this.batchMeshes(hinge,[...hinge.children]);this.batchMeshes(cell.highlight,[...cell.highlight.children]);}
  }
  canvasTexture(draw,size=256){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;draw(canvas.getContext('2d'),size);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;this.resources.add(map);return map;}
  makeMaterials(){
    this.stoneMap=this.canvasTexture((context,size)=>{
      context.fillStyle='#4e5149';context.fillRect(0,0,size,size);
      for(let row=0;row<4;row++)for(let column=-1;column<4;column++){
        const x=column*size/3+(row%2)*size/6,y=row*size/4;
        const shade=70+Math.floor((Math.sin(row*9.7+column*4.3)+1)*12);
        context.fillStyle=`rgb(${shade},${shade+1},${shade-6})`;context.fillRect(x+2,y+2,size/3-4,size/4-4);
        context.strokeStyle='#8b8a7370';context.strokeRect(x+3,y+3,size/3-6,size/4-6);
      }
      for(let i=0;i<3200;i++){const x=(i*71)%size,y=(i*137)%size;context.fillStyle=i%2?'#14181314':'#d0c7ab0d';context.fillRect(x,y,2,1);}
    });
    this.stoneMap.wrapS=this.stoneMap.wrapT=THREE.RepeatWrapping;this.stoneMap.repeat.set(8,8);
    // The entire illustrated world is a flat XZ map. The camera adds perspective exactly once.
    this.floorMaterial=new THREE.MeshBasicMaterial({map:this.stoneMap,color:0xc2c2bd,toneMapped:false});this.resources.add(this.floorMaterial);
    this.stone=this.material({color:0x30322f,roughness:.92});this.stoneDark=this.material({color:0x1b1d1b,roughness:1});
    this.metalMap=this.canvasTexture((context,size)=>{
      context.fillStyle='#a5a7a4';context.fillRect(0,0,size,size);
      for(let i=0;i<5000;i++){const x=(i*73)%size,y=(i*131)%size;context.fillStyle=i%5?'#23292625':'#e7e2d81b';context.fillRect(x,y,i%11===0?12:1,1);}
      for(let i=0;i<22;i++){const x=(i*37)%size;context.strokeStyle='#3a403719';context.beginPath();context.moveTo(x,0);context.lineTo(x+3,size);context.stroke();}
    });
    this.iron=this.material({map:this.metalMap,color:0x3f4541,metalness:.55,roughness:.9});this.ironDark=this.material({map:this.metalMap,color:0x202521,metalness:.35,roughness:.95});
    this.brass=this.material({color:0x535752,metalness:.75,roughness:.6});this.rune=this.material({color:0x766e51,metalness:.25,roughness:.9});
    this.lockMaterial=this.material({color:0xa29d8a,metalness:.35,roughness:.6});
    this.mask=this.canvasTexture((context,size)=>{const g=context.createRadialGradient(size/2,size/2,size*.28,size/2,size/2,size*.49);g.addColorStop(0,'white');g.addColorStop(.75,'white');g.addColorStop(1,'black');context.fillStyle=g;context.fillRect(0,0,size,size);});
    this.glowMap=this.canvasTexture((context,size)=>{const g=context.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);g.addColorStop(0,'#ffffffff');g.addColorStop(.16,'#ffffffc0');g.addColorStop(.5,'#ffffff30');g.addColorStop(1,'#ffffff00');context.fillStyle=g;context.fillRect(0,0,size,size);});
  }
  makeEnvironment(){
    const groundGeometry=new THREE.PlaneGeometry(31,23);this.resources.add(groundGeometry);
    const ground=this.mesh(this.scene,groundGeometry,this.floorMaterial,0,-.035,-.9,false);ground.rotation.x=-Math.PI/2;
    const shadowMaterial=new THREE.ShadowMaterial({color:0x090b0a,opacity:.38,depthWrite:false});this.resources.add(shadowMaterial);
    const shadow=this.mesh(this.scene,groundGeometry,shadowMaterial,0,-.026,-.9,false);shadow.rotation.x=-Math.PI/2;shadow.renderOrder=-1;
    this.scene.add(new THREE.HemisphereLight(0xc2c7c9,0x353632,1.6));
    this.key=new THREE.DirectionalLight(0xd3cfbf,2.0);this.key.position.set(-5,13,7);this.key.castShadow=true;this.key.shadow.mapSize.set(1024,1024);
    Object.assign(this.key.shadow.camera,{left:-15,right:15,top:13,bottom:-13,near:1,far:40});this.key.shadow.bias=-.0006;this.key.shadow.normalBias=.02;this.key.shadow.radius=3;this.scene.add(this.key);
    // Edge light accents and cell geometry share the floor map's camera and world coordinates.
    for(const side of [-1,1]){const light=new THREE.PointLight(0xe8b47a,4,6,2);light.position.set(side*9,1.2,-3);this.scene.add(light);}
    const drain=this.material({color:0x171b1a,roughness:1});
    for(const x of [-7.72,7.72])this.block(this.scene,.045,.012,9.8,drain,x,-.015,-2.36,false);
    for(const z of [-7.28,2.55])this.block(this.scene,15.4,.012,.045,drain,0,-.015,z,false);
    const material=new THREE.SpriteMaterial({map:this.glowMap,color:0xe9ca83,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending});this.resources.add(material);
    this.warden=new THREE.Sprite(material);this.warden.scale.set(.7,.7,1);this.warden.position.set(0,.15,0);this.scene.add(this.warden);
  }
  makeBrazier(x,z){
    const group=new THREE.Group();group.position.set(x,0,z);this.scene.add(group);
    this.block(group,.7,.14,.7,this.stone,0,.07,0);this.block(group,.25,.85,.25,this.ironDark,0,.54,0);
    const bowlGeometry=new THREE.CylinderGeometry(.38,.2,.22,8);this.resources.add(bowlGeometry);this.mesh(group,bowlGeometry,this.iron,0,1.05,0);
    const fireMaterial=this.material({color:0xffa229,emissive:0xff660b,emissiveIntensity:2.5,roughness:1});
    const geometry=new THREE.ConeGeometry(.17,.5,6);this.resources.add(geometry);const flame=this.mesh(group,geometry,fireMaterial,0,1.39,0,false);flame.userData.dynamic=true;
    const light=new THREE.PointLight(0xffac53,35,7,2);light.position.set(0,1.5,0);group.add(light);
    const glowMaterial=new THREE.SpriteMaterial({map:this.glowMap,color:0xffa544,opacity:.55,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});this.resources.add(glowMaterial);
    const glow=new THREE.Sprite(glowMaterial);glow.position.set(0,1.35,0);glow.scale.set(1.15,1.15,1);group.add(glow);
    this.fires.push({light,flame,glow,phase:x+z});
  }
  makeCell([column,row],id){
    const group=new THREE.Group();group.position.set((column-2.5)*2.5,0,(row-1.5)*2.44-2.36);this.scene.add(group);
    this.block(group,2.28,.05,1.85,this.stoneDark,0,.015,0,false);
    this.block(group,2.34,.34,.17,this.stone,0,.17,-.94);this.block(group,2.36,.075,.2,this.brass,0,.39,-.94);
    for(const side of [-1,1]){
      this.block(group,.14,.24,1.85,this.stone,side*1.13,.12,0);
      for(const z of [-.91,.89]){this.block(group,.14,1.31,.14,this.ironDark,side*1.08,.68,z);this.block(group,.2,.08,.2,this.brass,side*1.08,1.39,z);}
      for(let i=0;i<5;i++)this.block(group,.045,1.04,.045,this.iron,side*1.08,.74,-.64+i*.3);
      this.block(group,.07,.07,1.82,this.iron,side*1.08,1.27,0);
    }
    this.block(group,2.3,.075,.085,this.iron,0,1.31,-.9);this.block(group,2.3,.07,.085,this.brass,0,1.35,.91);
    const doors=[];
    for(const side of [-1,1]){
      const hinge=new THREE.Group();hinge.userData.dynamic=true;hinge.position.set(side*1.03,.13,.91);group.add(hinge);const center=-side*.515;
      this.block(hinge,1.04,1.02,.055,this.ironDark,center,.63,-.045);
      this.block(hinge,1.04,.08,.085,this.iron,center,1.10,0);this.block(hinge,1.04,.08,.085,this.iron,center,.12,0);
      for(let i=0;i<6;i++)this.block(hinge,.065,1.06,.065,this.iron,center-.45+i*.18,.63,0);
      this.block(hinge,.065,1.14,.08,this.brass,center-side*.48,.62,0);doors.push({hinge,side});
    }
    const cover=new THREE.Group();cover.userData.dynamic=true;cover.position.y=.38;group.add(cover);
    this.block(cover,2.06,.055,1.67,this.ironDark,0,0,0);
    for(let bar=0;bar<10;bar++)this.block(cover,.022,.03,1.65,this.iron,-.94+bar*.209,.044,0);
    for(const z of [-.63,.66])this.block(cover,2.05,.035,.075,this.brass,0,.037,z);
    const lock=new THREE.Group();lock.userData.dynamic=true;lock.position.set(0,.61,.74);group.add(lock);this.block(lock,.26,.28,.09,this.lockMaterial,0,0,0);
    const shackleGeometry=new THREE.TorusGeometry(.1,.025,6,12,Math.PI);this.resources.add(shackleGeometry);this.mesh(lock,shackleGeometry,this.lockMaterial,0,.16,0,false);
    this.block(lock,.025,.068,.012,this.ironDark,0,-.015,.052,false);
    const highlight=new THREE.Group();highlight.userData.dynamic=true;highlight.position.y=.065;group.add(highlight);
    const highlightMaterial=new THREE.MeshBasicMaterial({color:0xdcc27d,transparent:true,opacity:.85,depthWrite:false});this.resources.add(highlightMaterial);
    for(const z of [-.99,.99])this.block(highlight,2.36,.027,.03,highlightMaterial,0,0,z,false);
    for(const x of [-1.18,1.18])this.block(highlight,.03,.027,2.0,highlightMaterial,x,0,0,false);
    highlight.visible=false;
    const portraitMaterial=new THREE.SpriteMaterial({alphaMap:this.mask,color:0xffffff,transparent:true,opacity:0,depthWrite:false});this.resources.add(portraitMaterial);
    const portrait=new THREE.Sprite(portraitMaterial);portrait.position.set(0,.7,-.02);portrait.scale.set(1.36,1.36,1);group.add(portrait);
    const tierMaterial=new THREE.MeshBasicMaterial({color:0xa4a798,transparent:true,opacity:.28,depthWrite:false});this.resources.add(tierMaterial);
    const tierGeometry=new THREE.RingGeometry(.46,.52,40);this.resources.add(tierGeometry);const tierRing=this.mesh(group,tierGeometry,tierMaterial,0,.06,0,false);tierRing.rotation.x=-Math.PI/2;tierRing.userData.dynamic=true;
    // Low cell walls follow the game's shallow overhead composition; avatars stay readable.
    for(const child of group.children)if(child!==portrait&&child!==lock&&child!==cover){child.scale.y*=.3;child.position.y*=.3;}
    lock.position.y=.55;
    this.cells[id]={group,doors,cover,lock,portrait,highlight,highlightMaterial,tierRing,tierMaterial,open:false,key:null};
  }
  loadTextures(){
    const loader=new THREE.TextureLoader();
    loader.load('./assets/prison-world-topdown-v3.png',map=>{
      if(this.disposed){map.dispose();return;}map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
      this.resources.add(map);this.floorMaterial.map=map;this.floorMaterial.needsUpdate=true;this.stage.dataset.worldTexture='prison-world-topdown-v3';this.request();
    },undefined,()=>{this.stage.dataset.worldTexture='procedural';});
    loader.load('./assets/prisoners-atlas-v1.png',atlas=>{
      if(this.disposed){atlas.dispose();return;}atlas.colorSpace=THREE.SRGBColorSpace;this.resources.add(atlas);this.atlas={};
      for(const [code,[x,y]]of Object.entries(ATLAS)){const map=atlas.clone();map.repeat.set(.5,.5);map.offset.set(x,y);map.needsUpdate=true;this.resources.add(map);this.atlas[code]=map;}
      if(this.state)this.sync(this.state,this.selection);
    },undefined,()=>{this.stage.dataset.portraitTexture='unavailable';});
  }
  sync(state,{selected=0,armed=false,pairTarget=null}={}){
    if(!this.ready)return;this.state=state;this.selection={selected,armed,pairTarget};
    for(const [id,cell]of this.cells.entries()){
      const room=state.rooms[id],prisoner=room?.prisoner;if(!room)continue;cell.open=room.status!=='closed';
      for(const {hinge,side}of cell.doors)hinge.rotation.y=cell.open?-side*1.46:0;cell.lock.visible=!cell.open;cell.cover.visible=!cell.open;cell.cover.scale.z=1;
      cell.portrait.visible=!!prisoner;cell.portrait.material.opacity=prisoner?1:0;cell.portrait.material.map=prisoner?this.atlas?.[prisoner.code]||null:null;cell.portrait.material.needsUpdate=true;
      cell.tierRing.visible=!!prisoner;cell.tierMaterial.color.setHex(TIER_COLORS[prisoner?.tier]||TIER_COLORS[0]);
      const candidate=state.phase==='patrol'&&!state.pending.length&&state.destinations.includes(id);
      const source=armed&&selected===id,target=pairTarget===id,hover=this.hovered===id;
      cell.highlight.visible=source||target||candidate||hover;cell.highlightMaterial.color.setHex(target?0x98d5aa:source?0xf3cf7a:candidate?0xcab778:0x9baea3);
      cell.highlightMaterial.opacity=(source||target) ? .95 : candidate ? .65 : .42;
    }
    const position=this.cells[state.position]?.group.position;if(position)this.warden.position.set(position.x,.17,position.z+1.15);
    this.warden.visible=!!position;this.renderer.shadowMap.needsUpdate=true;this.layout();this.request();
  }
  project(x,y,z){const point=new THREE.Vector3(x,y,z).project(this.camera);return {x:(point.x+1)*this.width/2,y:(1-point.y)*this.height/2};}
  layout(){
    if(!this.ready||!this.width)return;
    for(const [id,cell]of this.cells.entries()){
      const node=this.board.querySelector(`[data-room="${id}"]`);if(!node)continue;const {x,z}=cell.group.position;
      const corners=[];for(const dx of [-1.18,1.18])for(const dz of [-1,1])for(const y of [0,.42])corners.push(this.project(x+dx,y,z+dz));
      const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));const width=Math.max(...corners.map(p=>p.x))-left,height=Math.max(...corners.map(p=>p.y))-top;
      Object.assign(node.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});node.dataset.sceneRoom='true';
      const [column,row]=CELLS[id],label=this.project(x,.06,z+.73);
      const number=row===0?this.project(x,.43,z-1.10):row===3?this.project(x,0,z+1.16):column===0?this.project(x-1.38,.15,z):this.project(x+1.38,.15,z);
      node.style.setProperty('--scene-label-y',`${label.y-top}px`);node.style.setProperty('--scene-number-y',`${number.y-top}px`);node.style.setProperty('--scene-number-x',`${number.x-left}px`);
    }
  }
  resize(){
    if(!this.ready)return;const rect=this.stage.getBoundingClientRect();if(!rect.width||!rect.height)return;
    this.width=rect.width;this.height=rect.height;this.camera.aspect=this.width/this.height;
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    this.renderer.setSize(this.width,this.height,false);this.layout();this.request();
  }
  request(dirty=true){if(dirty)this.dirty=true;if(this.ready&&!this.disposed&&!document.hidden&&!this.raf)this.raf=requestAnimationFrame(this.frame);}
  frame(time){
    this.raf=null;if(!this.ready||this.disposed||document.hidden)return;
    for(const tween of [...this.tweens]){const progress=Math.min(1,(time-tween.start)/tween.duration);tween.update(ease(progress),progress);this.renderer.shadowMap.needsUpdate=true;if(progress===1){this.tweens.splice(this.tweens.indexOf(tween),1);tween.finish();tween.resolve();}}
    if(this.active){for(const fire of this.fires){const flicker=Math.sin(time*.0037+fire.phase)*.07+Math.sin(time*.0093+fire.phase)*.025;fire.light.intensity=35*(1+flicker);fire.flame.scale.y=1+flicker*2;fire.glow.material.opacity=.5+flicker;}}
    if(this.dirty||!this.lastDraw||time-this.lastDraw>32||this.tweens.length){if(this.tweens.length)this.renderer.shadowMap.needsUpdate=true;this.renderer.render(this.scene,this.camera);this.lastDraw=time;this.dirty=false;}
    if((this.active&&this.fires.length)||this.tweens.length)this.request(false);
  }
  tween(duration,update,finish=()=>{}){
    if(!this.active){update(1,1);finish();this.request();return Promise.resolve();}
    return new Promise(resolve=>{this.tweens.push({duration:duration*(this.fast()?.45:1),start:performance.now(),update,finish,resolve});this.request();});
  }
  finishTweens(){for(const tween of this.tweens){tween.update(1,1);tween.finish();tween.resolve();}this.tweens=[];}
  async effectBefore(action,before){
    if(!this.ready)return;const cell=this.cells[action.room];if(!cell)return;
    if(action.type==='visit'&&before.rooms[action.room]?.status==='closed'){
      await this.tween(340,t=>{for(const {hinge,side}of cell.doors)hinge.rotation.y=-side*1.46*t;cell.cover.scale.z=1-t;cell.lock.scale.setScalar(1-t);},()=>{cell.lock.scale.setScalar(1);cell.lock.visible=false;cell.cover.visible=false;});
    }else if(action.type==='eat'){
      const prey=this.cells[action.prey];if(!prey)return;const ghost=new THREE.Sprite(prey.portrait.material.clone());ghost.material.depthTest=false;ghost.renderOrder=10;ghost.scale.copy(prey.portrait.scale);
      const start=prey.portrait.getWorldPosition(new THREE.Vector3()),end=cell.portrait.getWorldPosition(new THREE.Vector3());ghost.position.copy(start);this.scene.add(ghost);
      await this.tween(380,t=>{ghost.position.lerpVectors(start,end,t);ghost.position.y+=Math.sin(Math.PI*t)*1.25;ghost.scale.setScalar(1.36*(1-t*.86));ghost.material.opacity=1-t*.7;prey.portrait.material.opacity=1-t;cell.portrait.scale.setScalar(1.36*(1+Math.sin(Math.PI*t)*.12));},()=>{this.scene.remove(ghost);ghost.material.dispose();prey.portrait.material.opacity=1;cell.portrait.scale.set(1.36,1.36,1);});
    }else if(action.type==='reroll'){
      await this.tween(280,(t,p)=>{cell.portrait.scale.x=1.36*Math.max(.08,Math.abs(Math.cos(p*Math.PI)));cell.tierMaterial.opacity=.28+Math.sin(p*Math.PI)*.55;},()=>{cell.portrait.scale.set(1.36,1.36,1);cell.tierMaterial.opacity=.28;});
    }
  }
  async effectAfter(before,after,action){
    if(!this.ready)return;const changed=after.rooms.filter(room=>room.prisoner&&(before.rooms[room.id].status==='closed'||before.rooms[room.id].prisoner?.code!==room.prisoner.code||before.rooms[room.id].prisoner?.tier!==room.prisoner.tier));
    await Promise.all(changed.map(room=>{const cell=this.cells[room.id],opening=before.rooms[room.id].status==='closed'&&!(action.type==='visit'&&room.id===action.room);if(opening)cell.cover.visible=true;return this.tween(320,(t,p)=>{
      cell.portrait.scale.set(1.36*(1+Math.sin(p*Math.PI)*.1),1.36*(1+Math.sin(p*Math.PI)*.1),1);cell.tierMaterial.opacity=.28+Math.sin(p*Math.PI)*.65;
      if(opening){for(const {hinge,side}of cell.doors)hinge.rotation.y=-side*1.46*t;cell.cover.scale.z=1-t;}
    },()=>{cell.portrait.scale.set(1.36,1.36,1);cell.tierMaterial.opacity=.28;if(opening){cell.cover.visible=false;cell.cover.scale.z=1;}});}));
  }
  fallback(reason){
    this.ready=false;this.stage.classList.remove('three-ready');this.stage.dataset.renderer='css-fallback';this.stage.dataset.rendererReason=reason;
    delete this.stage.dataset.projection;
    this.canvas?.remove();cancelAnimationFrame(this.raf);this.raf=null;this.finishTweens();
    for(const node of this.board.querySelectorAll('[data-scene-room]')){for(const key of ['left','top','width','height'])node.style[key]='';for(const key of ['--scene-label-y','--scene-number-y','--scene-number-x'])node.style.removeProperty(key);delete node.dataset.sceneRoom;}
  }
  dispose(){
    this.disposed=true;this.observer?.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);this.board.removeEventListener('pointerover',this.onHover);this.board.removeEventListener('pointerleave',this.onLeave);this.canvas?.removeEventListener('webglcontextlost',this.onLost);
    this.fallback('disposed');for(const resource of this.resources)resource.dispose();this.resources.clear();this.renderer?.dispose();
  }
}
