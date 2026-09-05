import * as THREE from './vendor/three.module.js';
import { HDRLoader } from './vendor/HDRLoader.js';
import { PITCHES, batBasis, random } from './physics.js';

export async function createScene(canvas, onProgress = () => {}) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=0.96;
  const loader=new THREE.TextureLoader(),hdrLoader=new HDRLoader();
  let loaded=0;
  const track=promise=>promise.then(asset=>{onProgress(`Loading the ground and light · ${++loaded}/9`);return asset;});
  const loadedAssets=await Promise.all([
    track(loader.loadAsync('./assets/sparse_grass_diff_1k.jpg')),
    track(loader.loadAsync('./assets/sparse_grass_nor_gl_1k.jpg')),
    track(loader.loadAsync('./assets/sparse_grass_rough_1k.jpg')),
    track(loader.loadAsync('./assets/dirt_diff_1k.jpg')),
    track(loader.loadAsync('./assets/dirt_nor_gl_1k.jpg')),
    track(loader.loadAsync('./assets/dirt_rough_1k.jpg')),
    track(hdrLoader.loadAsync('./assets/noon_grass_1k.hdr')),
    track(hdrLoader.loadAsync('./assets/lythwood_field_1k.hdr')),
    track(hdrLoader.loadAsync('./assets/evening_field_1k.hdr')),
  ]);
  const [turfColor,turfNormal,turfRoughness,earthColor,earthNormal,earthRoughness,daylight,overcastLight,eveningLight]=loadedAssets;
  for(const tex of [turfColor,earthColor])tex.colorSpace=THREE.SRGBColorSpace;
  for(const tex of loadedAssets.slice(0,6)){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());}
  for(const hdr of [daylight,overcastLight,eveningLight])hdr.mapping=THREE.EquirectangularReflectionMapping;
  const scene = new THREE.Scene();scene.background=new THREE.Color('#afc3c9');scene.fog=new THREE.FogExp2('#bacac4',0.008);
  scene.background=daylight;scene.environment=daylight;scene.environmentIntensity=.7;
  const camera=new THREE.PerspectiveCamera(62,1,0.035,400);camera.position.set(0.02,1.72,.98);camera.lookAt(0,.5,-14);
  const ambient=new THREE.HemisphereLight('#dcebf5','#6b7650',.45);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff0d2',3.5);sun.position.set(-16,26,-13);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.camera.near=1;sun.shadow.camera.far=75;sun.shadow.bias=-.00012;sun.shadow.normalBias=.025;sun.shadow.radius=3;sun.target.position.set(0,0,-10);scene.add(sun,sun.target);
  const rng=random(478293);
  const mat=(color,roughness=.85,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  function box(w,h,d,material,x=0,y=0,z=0,parent=scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function cylinder(r1,r2,h,material,x=0,y=0,z=0,parent=scene,segments=12){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function sphere(r,material,x,y,z,parent=scene){const m=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  function texture(kind){
    const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');
    const base=kind==='grass'?[85,106,54]:kind==='wood'?[199,174,122]:[181,157,111];
    const data=ctx.createImageData(1024,1024);
    for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){let n=(rng()-.5)*(kind==='grass'?45:27);if(kind==='wood')n+=Math.sin(x*.25+Math.sin(y*.008))*12;const i=(y*1024+x)*4;for(let j=0;j<3;j++)data.data[i+j]=base[j]+n;data.data[i+3]=255;}ctx.putImageData(data,0,0);
    if(kind==='grass'){for(let i=0;i<38000;i++){const x=rng()*1024,y=rng()*1024;ctx.strokeStyle=`rgba(${60+rng()*50},${90+rng()*50},35,${.2+rng()*.4})`;ctx.lineWidth=.6+rng();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rng()-.5)*5,y-3-rng()*8);ctx.stroke();}}
    if(kind==='pitch'){for(let i=0;i<10000;i++){const x=rng()*1024,y=rng()*1024;ctx.fillStyle=`rgba(73,63,37,${rng()*.16})`;ctx.fillRect(x,y,.5+rng()*2,2+rng()*15);}for(let i=0;i<25;i++){let x=rng()*1024,y=rng()*1024;ctx.strokeStyle='#70614538';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<7;j++){x+=(rng()-.5)*18;y+=rng()*12;ctx.lineTo(x,y);}ctx.stroke();}}
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);return t;
  }
  for(const tex of [turfColor,turfNormal,turfRoughness])tex.repeat.set(100,100);
  const groundMat=new THREE.MeshStandardMaterial({map:turfColor,normalMap:turfNormal,normalScale:new THREE.Vector2(.42,.42),roughnessMap:turfRoughness,color:'#c3d3a5',roughness:1});const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),groundMat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  for(const tex of [earthColor,earthNormal,earthRoughness])tex.repeat.set(1.525,12);
  const pitchMat=new THREE.MeshStandardMaterial({map:earthColor,normalMap:earthNormal,normalScale:new THREE.Vector2(.13,.13),roughnessMap:earthRoughness,color:'#ddc8a3',roughness:1});
  box(3.05,.03,24,pitchMat,0,.009,-9);
  // Adjacent net lanes establish real-world depth and scale.
  const sidePitchMat=pitchMat.clone();sidePitchMat.color.set('#aeb28d');box(3.05,.02,25,sidePitchMat,-6.4,.005,-9);box(3.05,.02,25,sidePitchMat,6.4,.005,-9);
  const chalk=mat('#f5f3e5');
  for(const x of [0,-6.4,6.4]){for(const z of [0,-17.68])box(3.7,.004,.045,chalk,x,.031,z);for(const z of [1.22,-18.9]){box(2.64,.004,.04,chalk,x,.031,z);for(const side of [-1,1])box(.04,.004,2.8,chalk,x+side*1.32,.031,z+(z<0?.4:-.4));}}
  // A few scuffs around guard, subtle enough to remain useful depth cues.
  const scuff=mat('#806f4a');for(let i=0;i<40;i++){const m=box(.015+rng()*.02,.001,.03+rng()*.12,scuff,(rng()-.5)*.65,.034,.3+(rng()-.5)*1.4);m.rotation.y=rng()*1.6;}
  const postMat=mat('#344c38',.58,.45),ropeMat=new THREE.LineBasicMaterial({color:'#2f4333',transparent:true,opacity:.46});
  const lineVertices=[];
  function line(ax,ay,az,bx,by,bz){lineVertices.push(ax,ay,az,bx,by,bz);}
  for(const x of [-9.6,-3.1,3.1,9.6]){
    for(let z=-24;z<=4;z+=7){cylinder(.035,.04,5.8,postMat,x,2.9,z);box(.08,.08,7,postMat,x,5.79,z<4?z+3.5:z-3.5);}
    for(let z=-24;z<=4;z+=.16)line(x,.03,z,x,5.8,z);
    for(let y=.08;y<5.8;y+=.16)line(x,y,-24,x,y,4);
  }
  for(const z of [-24,3.6]){for(let x=-9.6;x<=9.6;x+=.16)line(x,0,z,x,5.8,z);for(let y=.08;y<=5.8;y+=.16)line(-9.6,y,z,9.6,y,z);}
  for(let x=-9.6;x<=9.6;x+=.25)line(x,5.8,-24,x,5.8,4);for(let z=-24;z<=4;z+=.25)line(-9.6,5.8,z,9.6,5.8,z);
  const netGeo=new THREE.BufferGeometry();netGeo.setAttribute('position',new THREE.Float32BufferAttribute(lineVertices,3));const net=new THREE.LineSegments(netGeo,ropeMat);scene.add(net);
  const railMat=mat('#657160',.75,.3);for(const z of [-24,4])for(const x of [-6.35,0,6.35])box(6.4,.065,.065,railMat,x,5.8,z);
  // Dark lower netting is used at real practice facilities to catch rolling balls.
  const skirt=new THREE.MeshStandardMaterial({color:'#244b37',roughness:1,side:THREE.DoubleSide,transparent:true,opacity:.82});
  for(const x of [-9.6,-3.1,3.1,9.6])box(.012,.6,28,skirt,x,.3,-10);box(19.2,.6,.02,skirt,0,.3,-24);
  const screenMat=mat('#e8ece3');box(7,3.6,.12,screenMat,0,1.95,-26.2);for(let x=-3.4;x<=3.4;x+=.18)box(.03,3.6,.02,mat('#d2d9cf'),x,1.95,-26.1);for(const x of [-3.2,3.2]){box(.08,4,.08,railMat,x,1.9,-26.3);box(.12,.1,1.8,railMat,x,.1,-26.3);}
  const wicketMat=mat('#e3c68a',.68),bailMat=mat('#ceb17a');const wicketGroups=[];
  function wicket(x,z){const g=new THREE.Group();g.position.set(x,.04,z);scene.add(g);for(const dx of [-.095,0,.095])cylinder(.0175,.018,.711,wicketMat,dx,.3555,0,g,12);for(const dx of [-.0475,.0475]){const b=cylinder(.012,.012,.10,bailMat,dx,.716,0,g,8);b.rotation.z=Math.PI/2;}wicketGroups.push(g);}
  wicket(0,-18.90);wicket(0,1.22);wicket(-6.4,-18.9);wicket(6.4,-18.9);
  // The photographed tree line in the HDR environment replaces the blocky trees.
  // Instanced grass around the nets, kept outside the playing strip.
  const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.018,0,0,.018,0,0,.004,.16,.024],3));grassGeo.computeVertexNormals();const grassMaterial=new THREE.MeshStandardMaterial({color:'#667e3e',roughness:1,side:THREE.DoubleSide});const grass=new THREE.InstancedMesh(grassGeo,grassMaterial,13000),dummy=new THREE.Object3D();let count=0;while(count<13000){let x=(rng()-.5)*45,z=-30+rng()*48;if(Math.abs(x)<1.7||Math.abs(x-6.4)<1.7||Math.abs(x+6.4)<1.7)continue;dummy.position.set(x,.02,z);dummy.rotation.y=rng()*6.28;dummy.scale.setScalar(.3+rng()*.9);dummy.updateMatrix();grass.setMatrixAt(count++,dummy.matrix);}scene.add(grass);
  const pavilion=mat('#ecece2'),roof=mat('#465444',.8,.15);box(19,4.3,7,pavilion,24,2.15,-37);box(21,.2,9,roof,24,4.35,-37);const glass=mat('#31483e',.32,.15);for(let x=17;x<32;x+=2.7)box(1.9,2.3,.025,glass,x,2,-33.48);box(21,.3,4,mat('#969c89'),24,.15,-31);
  const benchWood=mat('#958366');for(const x of [-13,12]){box(2.9,.10,.55,benchWood,x,.55,-2);box(2.9,.45,.10,benchWood,x,.89,-2.23);for(const side of [-1,1])box(.08,.5,.5,railMat,x+side*1.1,.25,-2);}
  for(let i=0;i<4;i++){const x=i%2?-13:13,z=i<2?-27:8;const pole=cylinder(.08,.11,13,railMat,x,6.5,z);box(.8,.5,.18,mat('#d9e0d6',.4,.2),x,13,z);}
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#82a9be')},bottom:{value:new THREE.Color('#e3e9dd')},cloud:{value:.5}},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`varying vec3 vP;uniform vec3 top;uniform vec3 bottom;uniform float cloud;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec3 d=normalize(vP);float h=max(0.,d.y);vec3 c=mix(bottom,top,pow(h,.48));vec2 p=d.xz/(h+.18)*3.;float f=noise(p)*.5+noise(p*2.)*.25+noise(p*4.)*.125+noise(p*8.)*.0625;float clouds=smoothstep(.44-cloud*.12,.76-cloud*.15,f)*smoothstep(0.,.18,h);c=mix(c,vec3(.95,.96,.93),clouds*.86);gl_FragColor=vec4(c,1.);}`});const sky=new THREE.Mesh(new THREE.SphereGeometry(250,32,16),skyMat);sky.visible=false;scene.add(sky);
  // Proportioned, articulated bowler. The delivery hand meets the simulated release point.
  const bowler=new THREE.Group();scene.add(bowler);const shirt=mat('#efefe5',.92),trousers=mat('#e5e5d7',.95),skin=mat('#9a6445',.84),shoe=mat('#e2e4d7',.7),sole=mat('#53745a'),hair=mat('#302920');
  const torsoGeo=new THREE.LatheGeometry([new THREE.Vector2(.148,0),new THREE.Vector2(.152,.07),new THREE.Vector2(.14,.20),new THREE.Vector2(.165,.37),new THREE.Vector2(.191,.46),new THREE.Vector2(.165,.51)],32);
  const torso=new THREE.Mesh(torsoGeo,shirt);torso.position.y=.94;torso.scale.z=.72;torso.castShadow=true;torso.receiveShadow=true;bowler.add(torso);
  const shoulders=sphere(.205,shirt,0,1.42,0,bowler);shoulders.scale.set(1,.38,.65);cylinder(.060,.073,.12,skin,0,1.53,0,bowler);
  const collar=new THREE.Mesh(new THREE.TorusGeometry(.072,.018,6,24,Math.PI*1.6),shirt);collar.rotation.x=Math.PI/2;collar.position.set(0,1.485,.008);bowler.add(collar);
  const head=sphere(.116,skin,0,1.70,0,bowler);head.scale.set(.84,1.17,.92);const hairMesh=sphere(.117,hair,0,1.765,-.015,bowler);hairMesh.scale.set(.88,.72,.9);sphere(.021,skin,0,1.695,.104,bowler);
  for(const x of [-.096,.096]){const ear=sphere(.019,skin,x,1.694,-.005,bowler);ear.scale.set(.5,1,.7);}
  for(const x of [-.039,.039]){const brow=box(.033,.008,.005,hair,x,1.729,.092,bowler);brow.rotation.z=x>0?.06:-.06;sphere(.006,hair,x,1.714,.101,bowler);}
  const limbs=[];
  function limb(x,y,type){const pivot=new THREE.Group();pivot.position.set(x,y,0);bowler.add(pivot);const isArm=type==='arm';cylinder(isArm?.058:.085,isArm?.049:.067,isArm?.28:.41,isArm?shirt:trousers,0,isArm?-.12:-.20,0,pivot);const lower=new THREE.Group();lower.position.y=isArm?-.27:-.41;pivot.add(lower);cylinder(isArm?.046:.063,isArm?.029:.048,isArm?.29:.42,isArm?skin:trousers,0,isArm?-.14:-.20,0,lower);if(isArm){const hand=sphere(.045,skin,0,-.30,0,lower);hand.scale.set(.7,1.15,.7);}else{box(.12,.08,.24,shoe,0,-.43,.05,lower);box(.123,.021,.245,sole,0,-.473,.05,lower);}limbs.push({pivot,lower});return {pivot,lower};}
  const rightArm=limb(-.225,1.43,'arm'),leftArm=limb(.225,1.43,'arm'),rightLeg=limb(-.105,.96,'leg'),leftLeg=limb(.105,.96,'leg');
  for(const limb of [rightArm,leftArm])sphere(.046,skin,0,0,0,limb.lower);
  for(const limb of [rightLeg,leftLeg])sphere(.069,trousers,0,0,0,limb.lower);
  const heldBall=sphere(.036,mat('#961322',.47),0,-.31,.035,rightArm.lower);
  // A dark seam and stitched rings give the ball a legible rotation.
  const ballGroup=new THREE.Group(),ballMat=mat('#8c1220',.46);const ball=sphere(.036,ballMat,0,0,0,ballGroup);const seamMaterial=mat('#ddb29a',.70);for(const offset of [-.0032,0,.0032]){const seam=new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(.036**2-offset**2)+.00045,.0006,4,72),seamMaterial);seam.position.z=offset;ballGroup.add(seam);}scene.add(ballGroup);ballGroup.visible=false;
  const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.05,20),new THREE.MeshBasicMaterial({color:'#172b1b',transparent:true,opacity:.35,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;scene.add(ballShadow);ballShadow.visible=false;
  const trailPositions=new Float32Array(80*3);const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPositions,3));trailGeo.setDrawRange(0,0);const trail=new THREE.Line(trailGeo,new THREE.LineBasicMaterial({color:'#f8eec2',transparent:true,opacity:.42,depthWrite:false}));trail.frustumCulled=false;scene.add(trail);
  const bounceMarker=new THREE.Mesh(new THREE.RingGeometry(.07,.10,32),new THREE.MeshBasicMaterial({color:'#e5fcae',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));bounceMarker.rotation.x=-Math.PI/2;bounceMarker.visible=false;scene.add(bounceMarker);
  const batGroup=new THREE.Group();scene.add(batGroup);const woodMap=texture('wood');woodMap.repeat.set(.4,1);const wood=new THREE.MeshStandardMaterial({map:woodMap,color:'#ffefc5',roughness:.68,bumpMap:woodMap,bumpScale:.002});
  const shape=new THREE.Shape();shape.moveTo(-.046,-.31);shape.quadraticCurveTo(-.054,-.31,-.054,-.29);shape.lineTo(-.054,.25);shape.quadraticCurveTo(-.05,.30,-.025,.31);shape.lineTo(.025,.31);shape.quadraticCurveTo(.05,.30,.054,.25);shape.lineTo(.054,-.29);shape.quadraticCurveTo(.054,-.31,.046,-.31);shape.closePath();const blade=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.003,bevelThickness:.004}),wood);blade.position.z=-.0125;blade.castShadow=true;blade.receiveShadow=true;batGroup.add(blade);
  const grip=mat('#304734',.98);cylinder(.016,.016,.30,grip,0,.455,0,batGroup,16);for(let y=.31;y<.60;y+=.009){const ring=new THREE.Mesh(new THREE.TorusGeometry(.0163,.0008,4,14),mat('#698058'));ring.rotation.x=Math.PI/2;ring.position.y=y;batGroup.add(ring);}box(.078,.09,.001,mat('#344e38'),0,.15,-.020,batGroup);box(.055,.004,.002,mat('#c7e294'),0,.171,-.021,batGroup);box(.033,.004,.002,mat('#c7e294'),0,.159,-.021,batGroup);
  const gloveMat=mat('#ecefe2',.81),gloveTrim=mat('#738065',.86);for(let i=0;i<2;i++){const g=new THREE.Group();g.position.set(i===0?.025:-.025,.40+i*.11,.012);g.rotation.z=i===0?-.4:.3;batGroup.add(g);const palm=sphere(.042,gloveMat,0,0,0,g);palm.scale.set(1,.85,.7);for(let j=0;j<4;j++){const knuckle=box(.015,.042,.021,gloveMat,(j-1.5)*.016,0,-.022,g);knuckle.rotation.x=.25;box(.014,.002,.022,gloveTrim,(j-1.5)*.016,.006,-.024,g);}const cuff=cylinder(.045,.047,.04,gloveTrim,0,.035,.015,g,12);cuff.rotation.x=.7;}
  const forearms=[cylinder(.038,.052,1,skin),cylinder(.038,.052,1,skin)];
  const sleeves=[cylinder(.066,.082,1,shirt),cylinder(.066,.082,1,shirt)];
  const armUp=new THREE.Vector3(0,1,0),armDelta=new THREE.Vector3();
  function connectArm(mesh,from,to){armDelta.subVectors(to,from);mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.scale.y=armDelta.length();mesh.quaternion.setFromUnitVectors(armUp,armDelta.normalize());}
  const matrix=new THREE.Matrix4();const v1=new THREE.Vector3(),v2=new THREE.Vector3(),v3=new THREE.Vector3();const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),.1);
  function updateBat(b){
    const {n,w,u}=batBasis(b);matrix.makeBasis(v1.set(w.x,w.y,w.z),v2.set(u.x,u.y,u.z),v3.set(-n.x,-n.y,-n.z));
    batGroup.quaternion.setFromRotationMatrix(matrix);batGroup.position.set(b.x,b.y,b.z);batGroup.updateMatrixWorld(true);
    for(let i=0;i<2;i++){
      const side=i===0?1:-1;
      const wrist=batGroup.localToWorld(new THREE.Vector3(side*.025,.40+i*.11,.025));
      const shoulder=new THREE.Vector3(side*.24,1.36,.85);
      const elbow=wrist.clone().lerp(shoulder,.55);elbow.x+=side*.10;elbow.y-=.16;
      connectArm(forearms[i],wrist,elbow);connectArm(sleeves[i],elbow,shoulder);
    }
  }
  function resize(){const rect=canvas.parentElement.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas.parentElement);resize();
  function setEnvironment(c){
    const over=c.weather==='overcast',evening=c.weather==='evening';
    ambient.intensity=over?.62:evening?.28:.45;
    sun.intensity=over?.25:evening?1.4:2.4;
    sun.color.set(evening?'#ffbe84':'#fff2db');sun.position.set(evening?-28:-16,evening?10:26,-13);
    scene.background=scene.environment=over?overcastLight:evening?eveningLight:daylight;
    scene.environmentIntensity=over?.85:evening?.8:.7;
    scene.backgroundIntensity=over?.85:evening?.95:.85;
    scene.fog.color.set(over?'#adb5af':evening?'#ae9d89':'#bacac4');scene.fog.density=over?.010:.006;
    sky.visible=false;
    skyMat.uniforms.top.value.set(over?'#939f9e':evening?'#8394aa':'#82a9be');
    skyMat.uniforms.bottom.value.set(over?'#c3ccc4':evening?'#e5c6a3':'#e3e9dd');skyMat.uniforms.cloud.value=over?1.6:.5;
    pitchMat.color.set(c.pitch==='green'?'#a4ad79':c.pitch==='soft'?'#9d967f':c.pitch==='dry'?'#e8d4b0':'#ddc8a3');
    pitchMat.normalScale.setScalar(c.pitch==='dry'?.22:c.pitch==='soft'?.10:.13);
    pitchMat.roughness=c.pitch==='soft'?.68:1;
    ballMat.roughness=.40+c.age/160;ballMat.color.set(c.age>40?'#681a1c':'#991323');
  }
  function animateBowler(phase,t,c){const arm=c.arm==='left'?-1:1;bowler.position.set(-.195*arm,0,phase==='runup'?-25+Math.min(t/2.2,1)*7.3:-17.7);bowler.rotation.y=0;const running=phase==='runup'&&t<1.78;const stride=running?Math.sin(t*17):0;rightLeg.pivot.rotation.x=stride*.6;leftLeg.pivot.rotation.x=-stride*.6;rightLeg.lower.rotation.x=Math.max(0,-stride)*.8;leftLeg.lower.rotation.x=Math.max(0,stride)*.8;rightArm.pivot.rotation.x=-stride*.65;leftArm.pivot.rotation.x=stride*.65;rightArm.lower.rotation.x=-.15;leftArm.lower.rotation.x=-.15;rightArm.pivot.rotation.z=0;leftArm.pivot.rotation.z=0;bowler.position.y=running?Math.abs(Math.sin(t*17))*.035:0;
    if(phase==='runup'&&t>=1.78){const p=Math.min((t-1.78)/.42,1);const bowling=c.arm==='left'?leftArm:rightArm,other=c.arm==='left'?rightArm:leftArm;bowling.pivot.rotation.x=-p*Math.PI;bowling.pivot.rotation.z=0;bowling.lower.rotation.x=0;other.pivot.rotation.x=-Math.sin(p*Math.PI)*2.2;leftLeg.pivot.rotation.x=.38;rightLeg.pivot.rotation.x=-.4;bowler.position.y=p*(c.bowler.includes('spin')?.13:.18);}
    if(phase==='flight'||phase==='result'){const p=Math.min(t/.5,1);const bowling=c.arm==='left'?leftArm:rightArm;bowling.pivot.rotation.x=-Math.PI-p*2.6;bowler.position.z=-17.7+p*.95;bowler.position.y=(c.bowler.includes('spin')?.13:.18)*Math.max(0,1-t/.22);bowler.rotation.x=Math.sin(p*Math.PI)*.15;leftLeg.pivot.rotation.x=.3*(1-p);rightLeg.pivot.rotation.x=-.3*(1-p);}else bowler.rotation.x=0;
    const bowlingArm=c.arm==='left'?leftArm:rightArm;
    if(heldBall.parent!==bowlingArm.lower)bowlingArm.lower.add(heldBall);
    heldBall.visible=phase==='runup'||phase==='intro'||phase==='ready';
  }
  function updateBall(d,guide){ballGroup.visible=!!d;ballShadow.visible=!!d;bounceMarker.visible=Boolean(d?.bounce)&&guide;trail.visible=guide&&!!d;if(!d)return;ballGroup.position.set(d.p.x,d.p.y,d.p.z);ballGroup.rotation.set(d.time*d.spin*.21,d.time*d.spin,d.time*14);ballShadow.position.set(d.p.x,.037,d.p.z);ballShadow.scale.setScalar(1+d.p.y*.6);ballShadow.material.opacity=Math.max(.06,.36-d.p.y*.055);if(d.bounce)bounceMarker.position.set(d.bounce.x,.041,d.bounce.z);const path=d.path.slice(-45);path.forEach((p,i)=>{trailPositions[i*3]=p.x;trailPositions[i*3+1]=p.y;trailPositions[i*3+2]=p.z;});trailGeo.attributes.position.needsUpdate=true;trailGeo.setDrawRange(0,path.length);}
  const gazeCamera=camera.clone(),gazePoint=new THREE.Vector3(0,.5,-14);
  let lastBallTime=-1;
  function updateGaze(d,dt,isPaused){
    if(isPaused)return;
    if(!d){gazePoint.lerp(new THREE.Vector3(0,.5,-14),1-Math.exp(-dt*3));lastBallTime=-1;}
    else if(!d.resolved&&d.p.z<.45){
      // Read the hand at distance, then follow the actual bounce into the crease.
      const follow=THREE.MathUtils.smoothstep(d.p.z,-10,-2);
      const targetPoint=new THREE.Vector3(d.p.x*follow,THREE.MathUtils.lerp(.8,d.p.y,follow),Math.min(-.25,d.p.z));
      gazePoint.lerp(targetPoint,1-Math.exp(-dt*18));lastBallTime=d.time;
    }else if(d.time-lastBallTime>.65){gazePoint.lerp(new THREE.Vector3(0,.5,-14),1-Math.exp(-dt*2.5));}
    const offset=gazePoint.clone().sub(camera.position);offset.y=Math.max(offset.y,-Math.hypot(offset.x,offset.z)*1.25);
    gazeCamera.position.copy(camera.position);gazeCamera.lookAt(camera.position.clone().add(offset));camera.quaternion.slerp(gazeCamera.quaternion,1-Math.exp(-dt*10));
  }
  // A stable input plane avoids moving the bat merely because your gaze follows the ball.
  function pointerWorld(x,y){return new THREE.Vector3(x*1.18,.35+(y+1)*.65,-.12);}
  function project(p){const v=new THREE.Vector3(p.x,p.y,p.z).project(camera);return{x:(v.x+1)*.5*canvas.clientWidth,y:(1-v.y)*.5*canvas.clientHeight};}
  function getReleasePosition(){bowler.updateMatrixWorld(true);const p=heldBall.getWorldPosition(new THREE.Vector3());return{x:p.x,y:p.y,z:p.z};}
  return { renderer,scene,camera,setEnvironment,updateBat,updateBall,updateGaze,animateBowler,getReleasePosition,pointerWorld,project,render(){renderer.render(scene,camera)},resetWicket(){wicketGroups[1].rotation.set(0,0,0)},hitWicket(){wicketGroups[1].rotation.x=.3} };
}
