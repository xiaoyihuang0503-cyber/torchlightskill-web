import * as THREE from '../vendor/three/three.module.js';

/** Shared camera for the entire scene, including HTML interaction rectangles. */
export function fitPrisonCamera(camera,width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  // Narrow windows retain the full board width instead of cropping its two sides.
  // WebGL and DOM hit targets continue to use this one camera.
  camera.zoom=Math.min(1,(width/height)/(16/9));
  camera.aspect=width/height;camera.position.set(0,26,23);camera.up.set(0,1,0);camera.lookAt(0,-.2,0);
  camera.setViewOffset(width,height,0,height*(width<height?.04:.13),width,height);
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
function project(point,camera,width,height){point.project(camera);return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};}

/** Project transformed room corners; editing parent/room position or rotation retains alignment. */
export function projectRoom(room,config,camera,width,height){
  room.root.updateWorldMatrix(true,false);
  const halfWidth=(config.cellPitchX-.08)/2,halfDepth=(config.cellPitchZ-.08)/2,corners=[];
  for(const x of [-halfWidth,halfWidth])for(const z of [-halfDepth,halfDepth])for(const y of [.14,config.wallHeight+.36])corners.push(project(room.root.localToWorld(new THREE.Vector3(x,y,z)),camera,width,height));
  const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),right=Math.max(...corners.map(p=>p.x)),bottom=Math.max(...corners.map(p=>p.y));
  const label=project(room.root.localToWorld(new THREE.Vector3(0,.28,config.cellPitchZ*.18)),camera,width,height);
  const number=project(room.labelAnchor.getWorldPosition(new THREE.Vector3()),camera,width,height);
  // The high masonry bounding box can overlap neighbours in perspective. Only the
  // interior floor is a pointer hit surface; labels stay outside that clipped face.
  const hitX=(config.cellPitchX-.3)/2,hitZ=(config.cellPitchZ-.33)/2;
  const hit=[[-hitX,-hitZ],[hitX,-hitZ],[hitX,hitZ],[-hitX,hitZ]].map(([x,z])=>project(room.root.localToWorld(new THREE.Vector3(x,.24,z)),camera,width,height));
  const hitPolygon=`polygon(${hit.map(p=>`${(p.x-left)/(right-left)*100}% ${(p.y-top)/(bottom-top)*100}%`).join(',')})`;
  return {left,top,width:right-left,height:bottom-top,label,number,corners,hit,hitPolygon};
}

/** Combine repeated static geometry inside each editable group, never across room/door pivots. */
export function batchEditableNodes(root){
  let count=0;const parents=[];root.traverse(node=>{if(node.isGroup)parents.push(node);});
  for(const parent of parents){
    if(parent.name==='Selection'||parent.name==='Number')continue;
    const groups=new Map();
    for(const mesh of parent.children){
      if(!mesh.isMesh||mesh.isInstancedMesh||mesh.name==='Room_hit_area'||Array.isArray(mesh.material))continue;
      const key=`${mesh.geometry.uuid}/${mesh.material.uuid}/${mesh.castShadow}/${mesh.receiveShadow}/${mesh.visible}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
    }
    for(const meshes of groups.values()){
      if(meshes.length<2)continue;const first=meshes[0],batch=new THREE.InstancedMesh(first.geometry,first.material,meshes.length);batch.name=`${parent.name}_static`;batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.visible=first.visible;
      batch.userData.partNames=meshes.map(mesh=>mesh.name);
      meshes.forEach((mesh,index)=>{mesh.updateMatrix();batch.setMatrixAt(index,mesh.matrix);mesh.removeFromParent();});batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();parent.add(batch);count+=meshes.length-1;
    }
  }
  return count;
}
