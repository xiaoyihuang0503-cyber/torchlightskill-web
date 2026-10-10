import * as THREE from '../vendor/three/three.module.js';
import { createMaterials, makeLabelTexture } from './materials.js?v=0.6.4-1';

export const CELL_LAYOUT = Object.freeze([[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[5,1],[5,2],[5,3],[4,3],[3,3],[2,3],[1,3],[0,3],[0,2],[0,1]].map(Object.freeze));
export const DEFAULTS = Object.freeze({ seed:14, cellPitchX:3, cellPitchZ:3.2, wallHeight:1.25, environment:true, chains:true, props:true, labels:true });

/** 可独立挂到任何 THREE.Scene；不创建 renderer，不读取游戏存档。 */
export function createTalosPrison(options={}) {
  const config={...DEFAULTS,...options};
  for(const key of ['cellPitchX','cellPitchZ','wallHeight']) if(!Number.isFinite(config[key])||config[key]<=0) throw new TypeError(`Invalid ${key}`);
  const root=new THREE.Group(); root.name='Talos_Prison'; root.userData.assetVersion='1.0.0';
  const materials=createMaterials({seed:config.seed}), geometries=new Map(), extraMaterials=new Set(), textures=new Set();
  const rooms=[], flames=[], layers={}, batches=new Map(); let disposed=false;
  function layer(name){const g=new THREE.Group();g.name=name;root.add(g);layers[name]=g;return g;}
  const platform=layer('Platform'), court=layer('Courtyard'), cellLayer=layer('Cells'), chains=layer('Chains'), environment=layer('Shaft'), props=layer('Props'), lighting=layer('Lights');
  const temp=new THREE.Object3D();
  function geo(key,fn){if(!geometries.has(key))geometries.set(key,fn());return geometries.get(key);}
  const cube=geo('cube',()=>new THREE.BoxGeometry(1,1,1));
  function box(parent,name,w,h,d,mat,x=0,y=0,z=0,bevel=false){
    let geometry=cube;
    if(bevel)geometry=geo(`b:${w}:${h}:${d}`,()=>{
      const b=Math.min(.045,w*.14,h*.14,d*.14),s=new THREE.Shape();
      s.moveTo(-w/2+b,-d/2+b);s.lineTo(w/2-b,-d/2+b);s.lineTo(w/2-b,d/2-b);s.lineTo(-w/2+b,d/2-b);s.closePath();
      const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(.005,h-2*b),bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:1,steps:1});g.rotateX(-Math.PI/2);g.center();return g;
    });
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.position.set(x,y,z);if(!bevel)mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function part(parent,name,geometry,mat,x,y,z,scale=[1,1,1],rotation=[0,0,0]){
    // 仅同一可编辑节点内部实例化；不会把牢房搬出自身 Group。
    const key=`${parent.uuid}/${geometry.uuid}/${mat.uuid}`;
    if(!batches.has(key))batches.set(key,{parent,name,geometry,mat,items:[]});
    temp.position.set(x,y,z);temp.rotation.set(...rotation);temp.scale.set(...scale);temp.updateMatrix();
    batches.get(key).items.push({matrix:temp.matrix.clone(),name});
  }
  function bar(parent,name,w,h,d,mat,x,y,z){part(parent,name,cube,mat,x,y,z,[w,h,d]);}
  const boltGeo=geo('bolt',()=>new THREE.CylinderGeometry(.035,.035,.045,6));
  function bolt(parent,x,y,z){part(parent,'Rivets',boltGeo,materials.ironEdge,x,y,z);}
  function flush(){for(const b of batches.values()){
    const mesh=new THREE.InstancedMesh(b.geometry,b.mat,b.items.length);mesh.name=b.name;mesh.castShadow=true;mesh.receiveShadow=true;
    b.items.forEach((item,i)=>mesh.setMatrixAt(i,item.matrix));mesh.userData.partNames=b.items.map(v=>v.name);mesh.computeBoundingSphere();b.parent.add(mesh);
  }batches.clear();}
  const W=config.cellPitchX*6+.9,D=config.cellPitchZ*4+1, H=config.wallHeight;
  box(platform,'Foundation',W,1.15,D,materials.stoneDark,0,-.73,0,true);
  box(platform,'Upper_lip',W+.3,.22,D+.25,materials.stone,0,-.055,0,true);
  box(platform,'Iron_belt',W+.36,.16,D+.31,materials.iron,0,-.61,0,true);
  box(platform,'Lower_lip',W+.12,.24,D+.12,materials.ironEdge,0,-1.26,0,true);
  for(let side of [-1,1]){
    for(let i=0;i<13;i++){const x=(i-6)*1.45;
      bar(platform,'Foundation_blocks',1.39,.53,.15,materials.stone,x,-.89,side*(D/2+.03));
      bar(platform,'Band_clamps',.11,.98,.2,materials.iron,x,-.7,side*(D/2+.14));
      bolt(platform,x,-.015,side*(D/2-.04));
    }
    for(let i=0;i<9;i++)bar(platform,'Side_buttress',.22,.9,.27,materials.iron,side*(W/2+.1),-.7,(i-4)*1.5);
    for(const z of [-D/2+.1,D/2-.1])box(platform,'Corner_cap',.58,.35,.63,materials.ironEdge,side*(W/2-.1),.03,z,true);
  }
  // 中央石板与四圈排水沟，真实几何接缝。
  const cw=config.cellPitchX*4-.34,cd=config.cellPitchZ*2-.42;
  box(court,'Recessed_bed',cw+.3,.07,cd+.3,materials.void,0,.1,0);
  for(let row=0;row<3;row++)for(let col=0;col<6;col++){
    const tw=(cw-.85)/6,td=(cd-.85)/3;
    const tile=box(court,`Flagstone_${row}_${col}`,tw-.013,.09,td-.013,(row+col)%7===0?materials.stoneDark:materials.slab,(col-2.5)*tw,.155+((col*3+row)%5)*.001,(row-1)*td,true);
    tile.rotation.y=((row*7+col)%3-1)*.002;
  }
  for(let side of [-1,1]){
    box(court,'Stone_border',cw+.1,.1,.12,materials.stone,0,.18,side*(cd/2),true);
    box(court,'Stone_border',.12,.1,cd,materials.stone,side*(cw/2),.18,0,true);
    for(let k=0;k<3;k++){
      bar(court,'Gutter_rails',cw-.2,.028,.023,materials.rust,0,.155,side*(cd/2-.12-k*.075));
      bar(court,'Gutter_rails',.023,.028,cd-.2,materials.rust,side*(cw/2-.12-k*.075),.155,0);
    }
    for(let i=0;i<50;i++)bar(court,'Gutter_grating',.018,.027,.32,materials.ironEdge,(i-24.5)*(cw-.3)/50,.175,side*(cd/2-.22));
    for(let i=0;i<24;i++)bar(court,'Gutter_grating',.32,.027,.018,materials.ironEdge,side*(cw/2-.22),.175,(i-11.5)*(cd-.3)/24);
  }
  // 平淡中央留给原玩法UI；裂缝、磨损只做细节。
  for(let i=0;i<13;i++){
    const x=Math.sin(i*27.9)*4.7,z=Math.cos(i*16.3)*2;
    const crack=box(court,'Stone_crack',.4+(i%4)*.13,.003,.011,materials.void,x,.21,z);crack.rotation.y=i*1.27;crack.castShadow=false;
  }
  const lockArc=geo('lockArc',()=>new THREE.TorusGeometry(.09,.022,6,12,Math.PI));
  const cornerGeo=geo('cornerSphere',()=>new THREE.SphereGeometry(.038,6,4));
  const spikeGeo=geo('spike',()=>new THREE.ConeGeometry(.055,.18,4));
  function makeCell(id,[col,row]){
    const group=new THREE.Group();group.name=`Cell_${String(id+1).padStart(2,'0')}`;group.userData.roomId=id;group.userData.editable=true;
    group.position.set((col-2.5)*config.cellPitchX,0,(row-1.5)*config.cellPitchZ);cellLayer.add(group);
    const cellWidth=config.cellPitchX-.08,depth=config.cellPitchZ-.08;
    const structure=new THREE.Group();structure.name='Masonry_and_frame';group.add(structure);
    box(structure,'Sunken_floor',cellWidth-.22,.1,depth-.25,materials.stoneDark,0,.12,0);
    for(let r=0;r<3;r++)for(let c=0;c<3;c++)bar(structure,'Interior_flagstones',(cellWidth-.38)/3-.025,.035,(depth-.35)/3-.025,materials.slab,(c-1)*(cellWidth-.38)/3,.179,(r-1)*(depth-.35)/3);
    for(const sx of [-1,1]){
      box(structure,'Side_wall',.22,H*.5,depth,materials.stone,sx*(cellWidth/2-.09),.22+H*.25,0,true);
      box(structure,'Side_coping',.29,.12,depth+.04,materials.iron,sx*(cellWidth/2-.09),.28+H*.5,0,true);
      for(let z=-1.05;z<1.15;z+=.28){bar(structure,'Side_railings',.055,H*.43,.055,materials.iron,sx*(cellWidth/2-.09),.34+H*.68,z);}
      box(structure,'Side_top_rail',.11,.095,depth,materials.ironEdge,sx*(cellWidth/2-.09),.32+H*.89,0,true);
      for(const sz of [-1,1]){
        const x=sx*(cellWidth/2-.07),z=sz*(depth/2-.09);
        box(structure,'Stone_pier',.31,H+.18,.33,materials.stone,x,.21+H/2,z,true);
        box(structure,'Pier_foot',.43,.22,.44,materials.iron,x,.26,z,true);
        box(structure,'Pier_cap',.43,.12,.45,materials.ironEdge,x,H+.3,z,true);
        box(structure,'Pier_iron_spine',.11,H*.88,.055,materials.iron,x,H/2+.25,z+sz*.19,true);
        for(let r=0;r<4;r++)bar(structure,'Pier_joints',.32,.016,.34,materials.stoneDark,x,.41+r*H*.23,z);
        bolt(structure,x,H+.375,z);
      }
    }
    box(structure,'Rear_wall',cellWidth-.1,H*.48,.2,materials.stone,0,.22+H*.24,-depth/2+.12,true);
    box(structure,'Rear_beam',cellWidth,.14,.23,materials.iron,0,.32+H*.9,-depth/2+.12,true);
    for(let i=0;i<13;i++)bar(structure,'Rear_bars',.045,H*.43,.045,materials.iron,(i-6)*(cellWidth-.4)/12,.31+H*.68,-depth/2+.1);
    for(const z of [-depth/2+.1,depth/2-.1]){
      box(structure,'Lintel',cellWidth+.1,.17,.28,materials.iron,0,H+.18,z,true);
      for(let i=0;i<9;i++)bolt(structure,(i-4)*.29,H+.283,z);
    }
    box(structure,'Doorstep',cellWidth-.2,.12,.32,materials.iron,0,.22,depth/2-.03,true);
    for(let i=0;i<11;i++)bar(structure,'Doorstep_grooves',.035,.025,.25,materials.ironEdge,(i-5)*.23,.29,depth/2-.04);
    const gates=[];
    for(const side of [-1,1]){
      const pivot=new THREE.Group();pivot.name=side<0?'Gate_left':'Gate_right';pivot.position.set(side*(cellWidth/2-.3),.3,depth/2-.14);group.add(pivot);
      const gw=cellWidth/2-.29,cx=-side*gw/2;
      box(pivot,'Gate_lower_plate',gw,.3,.075,materials.iron,cx,.18,0,true);
      for(const y of [.06,H*.49,H*.81])box(pivot,'Gate_crossbar',gw,.07,.1,materials.ironEdge,cx,y,0,true);
      for(let i=0;i<7;i++)bar(pivot,'Gate_bars',.045,H*.84,.055,materials.iron,cx+(i-3)*gw/7,H*.43,0);
      box(pivot,'Meeting_stile',.075,H*.9,.12,materials.ironEdge,-side*(gw-.04),H*.45,0,true);
      for(let i=0;i<5;i++)part(pivot,'Gate_rivets',cornerGeo,materials.brass,cx+(i-2)*gw/5,.2,.06);
      gates.push(pivot);
    }
    const shutter=new THREE.Group();shutter.name='Retractable_shutter';shutter.position.set(0,.62,-depth/2+.27);group.add(shutter);
    const shutterDepth=depth-.49;
    box(shutter,'Black_iron_cover',cellWidth-.46,.065,shutterDepth,materials.stoneDark,0,0,shutterDepth/2,true);
    for(let i=0;i<9;i++)bar(shutter,'Shutter_panel_seams',.018,.018,shutterDepth,materials.iron,(i-4)*(cellWidth-.6)/8,.045,shutterDepth/2);
    for(const z of [.24,shutterDepth-.23])box(shutter,'Shutter_cross_strap',cellWidth-.43,.045,.105,materials.iron,0,.06,z,true);
    const lock=new THREE.Group();lock.name='Lock';lock.position.set(0,.76,depth/2+.04);lock.scale.setScalar(1.35);lock.rotation.x=-.65;group.add(lock);
    box(lock,'Lock_body',.22,.24,.12,materials.brass,0,0,0,true);
    const arc=new THREE.Mesh(lockArc,materials.brass);arc.position.y=.12;arc.name='Lock_shackle';lock.add(arc);
    box(lock,'Keyhole',.025,.065,.009,materials.void,0,-.015,.069);
    const furniture=new THREE.Group();furniture.name='Cell_furniture';group.add(furniture);
    box(furniture,'Bunk_frame',.7,.08,1.34,materials.iron,-.8,.38,-.32,true);
    box(furniture,'Bunk_mattress',.63,.08,1.25,materials.warmStone,-.8,.46,-.32,true);
    box(furniture,'Pillow',.52,.085,.28,materials.stone,-.8,.53,-.72,true);
    for(const z of [-.86,.24])bar(furniture,'Bunk_legs',.06,.23,.06,materials.iron,-.8,.26,z);
    const bowl=geo('bowl',()=>new THREE.CylinderGeometry(.19,.12,.14,12,1,true));
    part(furniture,'Water_bowl',bowl,materials.rust,.85,.25,-.88);
    const highlight=new THREE.Group();highlight.name='Selection';highlight.position.y=H+.04;group.add(highlight);
    const selectionMat=materials.selection.clone();extraMaterials.add(selectionMat);
    for(const z of [-depth/2,depth/2])box(highlight,'Selection_edge',cellWidth,.025,.04,selectionMat,0,.32,z);
    for(const x of [-cellWidth/2,cellWidth/2])box(highlight,'Selection_edge',.04,.025,depth,selectionMat,x,.32,0);
    highlight.visible=false;
    const portraitAnchor=new THREE.Group();portraitAnchor.name='Portrait_anchor';portraitAnchor.position.set(0,.72,-.1);group.add(portraitAnchor);
    const floorAnchor=new THREE.Group();floorAnchor.name='Floor_anchor';floorAnchor.position.y=.21;group.add(floorAnchor);
    const labelAnchor=new THREE.Group();labelAnchor.name='Label_anchor';
    const lx=row===0||row===3?0:(col===0?-1.7:1.7),lz=row===0?-1.76:row===3?1.76:0;
    labelAnchor.position.set(lx,.21,lz);group.add(labelAnchor);
    const labelGroup=new THREE.Group();labelGroup.name='Number';labelAnchor.add(labelGroup);
    if(typeof document!=='undefined'){
      const map=makeLabelTexture(String(id+1));textures.add(map);const mat=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,depthTest:false,side:THREE.DoubleSide});extraMaterials.add(mat);
      const p=new THREE.Mesh(geo('number',()=>new THREE.PlaneGeometry(.55,.44)),mat);p.rotation.x=-Math.PI/2;p.name='Room_number';p.renderOrder=4;labelGroup.add(p);
    }
    const pickMesh=box(group,'Room_hit_area',cellWidth,.015,depth,new THREE.MeshBasicMaterial({visible:false}),0,.24,0);extraMaterials.add(pickMesh.material);pickMesh.userData.roomId=id;pickMesh.castShadow=false;
    const cell={id,root:group,structure,gates,doors:gates,shutter,lock,furniture,highlight,selectionMat,portraitAnchor,floorAnchor,labelAnchor,labelGroup,pickMesh,open:0,targetOpen:0};rooms.push(cell);
    // 从固定俯角看，门均朝画面下方，与参考中的读图方向一致。
  }
  CELL_LAYOUT.forEach((p,id)=>makeCell(id,p));
  // 平台外支撑与实际链环；相邻环交替 90 度。
  const linkGeo=geo('chainLink',()=>{const g=new THREE.TorusGeometry(.18,.052,6,12);g.scale(1,1.5,1);return g;});
  for(const side of [-1,1])for(const z of [-4.65,-1.6,1.6,4.65]){
    box(chains,'Outrigger',5,.42,.66,materials.stoneDark,side*(W/2+2.45),-.5,z,true);
    box(chains,'Outrigger_iron',5,.12,.7,materials.iron,side*(W/2+2.45),-.23,z,true);
    const a=new THREE.Vector3(side*(W/2-.15),-.1,z),b=new THREE.Vector3(side*15,2.25,z-.9);
    for(let i=0;i<22;i++){
      const t=i/21,p=a.clone().lerp(b,t);p.y-=Math.sin(t*Math.PI)*.65;
      part(chains,'Suspension_chain',linkGeo,materials.iron,p.x,p.y,p.z,[1,1,1],[Math.PI/2,i%2*Math.PI/2,Math.PI/2]);
    }
    box(chains,'Anchor_plate',.48,.72,.95,materials.ironEdge,side*(W/2+.08),-.07,z,true);
  }
  // 下沉的井壁与扶壁，独立层可隐藏。
  box(environment,'Abyss',40,.1,32,materials.void,0,-8.5,0);
  for(const side of [-1,1]){
    box(environment,'Shaft_side_wall',1.4,10,27,materials.warmStone,side*15.8,-3,0,true);
    box(environment,'Shaft_end_wall',32,10,1.4,materials.warmStone,0,-3,side*12.5,true);
    for(let j=0;j<9;j++)for(let i=0;i<15;i++){
      const z=(i-7)*1.75+(j%2)*.82;
      bar(environment,'Shaft_masonry',.1,.9,1.68,j%3?materials.warmStone:materials.stoneDark,side*15.04,-7+j*1.05,z);
      bar(environment,'End_masonry',1.94,.9,.1,j%3?materials.warmStone:materials.stoneDark,(i-7)*2.1+(j%2),-7+j*1.05,side*11.74);
    }
    for(let i=-2;i<=2;i++){
      box(environment,'Gothic_buttress',.95,10,.7,materials.stoneDark,side*14.7,-3,i*5,true);
      box(environment,'Buttress_belt',1.05,.35,.85,materials.iron,side*14.7,-.5,i*5,true);
      box(environment,'Shaft_cross_rib',29,.26,.25,materials.iron,0,-1.5,side*(10.2+i*.15),true);
    }
  }
  const brazierBowl=geo('brazier',()=>new THREE.CylinderGeometry(.28,.18,.23,10));
  const fireGeo=geo('fire',()=>new THREE.ConeGeometry(.15,.6,7));
  const torches=[[-8.7,-5.55],[8.7,-5.55],[-8.7,5.5],[8.7,5.5],[-13.8,-4.8],[13.8,-4.8],[-13.8,4.8],[13.8,4.8]];
  torches.forEach(([x,z],i)=>{
    const g=new THREE.Group();g.name=`Brazier_${i+1}`;g.position.set(x,0,z);props.add(g);
    box(g,'Pedestal',.5,.17,.5,materials.stone,0,.2,0,true);box(g,'Stem',.15,.65,.15,materials.iron,0,.56,0,true);
    const bowl=new THREE.Mesh(brazierBowl,materials.rust);bowl.name='Bowl';bowl.position.y=.94;g.add(bowl);
    for(let k=0;k<8;k++){const a=k*Math.PI/4;part(g,'Brazier_crown',spikeGeo,materials.iron,Math.cos(a)*.24,1.14,Math.sin(a)*.24);}
    const flame=new THREE.Mesh(fireGeo,materials.flame);flame.name='Flame';flame.position.y=1.28;g.add(flame);
    const core=new THREE.Mesh(geo('fireCore',()=>new THREE.ConeGeometry(.07,.36,6)),materials.glow);core.position.y=1.19;g.add(core);
    const light=new THREE.PointLight(0xff9f42,i<4?15:45,8,2);light.position.set(x,1.7,z);lighting.add(light);
    flames.push({flame,light,base:light.intensity,phase:i*1.7});
  });
  const hemi=new THREE.HemisphereLight(0xafbdce,0x40301f,1.65);hemi.name='Sky_fill';lighting.add(hemi);
  const key=new THREE.DirectionalLight(0xc9d5df,3.0);key.name='Cold_key';key.position.set(-7,16,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-17,right:17,top:16,bottom:-16,near:1,far:60});key.shadow.bias=-.0003;key.shadow.normalBias=.035;lighting.add(key);
  const rim=new THREE.DirectionalLight(0xb9783c,1.05);rim.name='Warm_rim';rim.position.set(10,6,-8);lighting.add(rim);key.target.name='Key_target';rim.target.name='Rim_target';lighting.add(key.target,rim.target);
  flush();
  environment.visible=config.environment;chains.visible=config.chains;props.visible=config.props;
  rooms.forEach(c=>{c.labelGroup.visible=config.labels;});
  function cell(id){if(!Number.isInteger(id)||id<0||id>=16)throw new RangeError('roomId must be 0..15');return rooms[id];}
  function pose(c,value){c.open=THREE.MathUtils.clamp(value,0,1);c.gates[0].rotation.y=-c.open*1.42;c.gates[1].rotation.y=c.open*1.42;c.lock.visible=c.open<.05;c.shutter.scale.z=Math.max(.001,1-c.open);c.shutter.visible=c.open<.995;}
  function setDoor(id,value,{animate=false}={}){const c=cell(id);if(!Number.isFinite(value))throw new TypeError('Door value must be finite');c.targetOpen=THREE.MathUtils.clamp(value,0,1);if(!animate)pose(c,c.targetOpen);}
  function setRoomState(id,{status='closed'}={}){setDoor(id,status==='closed'?0:1);}
  function setSelection({selected=null,target=null,candidates=[]}={}){for(const c of rooms){c.highlight.visible=c.id===selected||c.id===target||candidates.includes(c.id);c.selectionMat.color.set(c.id===target?0x87cac3:c.id===selected?0xe4ba6a:0xaaa08b);}}
  function update(delta=0,time=0){if(!Number.isFinite(delta)||delta<0||!Number.isFinite(time))throw new TypeError('Animation time must be finite and delta nonnegative');for(const c of rooms)if(Math.abs(c.open-c.targetOpen)>.0001)pose(c,THREE.MathUtils.damp(c.open,c.targetOpen,9,delta));for(const f of flames){const v=Math.sin(time*4.7+f.phase)*.09+Math.sin(time*11.3+f.phase)*.04;f.flame.scale.set(1-v*.3,1+v,1-v*.3);f.light.intensity=f.base*(1+v);}}
  function getRoomAnchor(id,kind='portrait',target=new THREE.Vector3()){const c=cell(id),map={portrait:c.portraitAnchor,floor:c.floorAnchor,label:c.labelAnchor};if(!map[kind])throw new TypeError('Unknown anchor');root.updateMatrixWorld(true);return map[kind].getWorldPosition(target);}
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.isLight)o.dispose?.();});for(const g of geometries.values())g.dispose();materials.dispose();extraMaterials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();}
  return {root,rooms,layers,materials,config,lights:{key,hemi,rim},setDoor,setRoomState,setSelection,getRoomAnchor,update,dispose};
}
