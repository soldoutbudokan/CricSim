import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL,fileURLToPath} from 'node:url';
// Run the actual entrypoint with a deterministic frame scheduler and real physics.
// Rendering, audio and the DOM are stand-ins; this does not verify WebGL output.
const root=fileURLToPath(new URL('..',import.meta.url));
const html=await fs.readFile(path.join(root,'dist/index.html'),'utf8');
const code=await fs.readFile(path.join(root,'dist/game.js'),'utf8');
const ids=new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));
async function boot(saved='eco',battingMode=null,{coarse=false}={}){
  const store=new Map(saved===null?[]:[['cricsim-graphics',saved]]),elements=new Map(),raf=new Map(),resizeObservers=[],errors=[];
  if(battingMode!==null)store.set('cricsim-batting-mode',battingMode);
  const stats={renders:0,batSteps:0,physicsSteps:0,batDts:[],physicsDts:[],qualityCalls:[],audioSuspended:null,gazeDeltas:[]};
  let seq=0,now=100,document;
  class Target {
    listeners=new Map();
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
    dispatch(type,extra={}){const event={target:this,preventDefault(){},...extra};for(const fn of this.listeners.get(type)||[])fn(event);}
  }
  class Element extends Target{
    constructor(id='',tag='div'){
      super();this.id=id;this.tagName=tag.toUpperCase();this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.options=[];this.value='';this.min=0;this.max=100;this.textContent='';this.innerHTML='';this.children=[];this.attributes={};this.hidden=false;this.disabled=false;this.open=false;this.clientWidth=1280;this.clientHeight=720;this.offsetWidth=1280;
      const classes=new Set();this.classList={add:(...a)=>a.forEach(v=>classes.add(v)),remove:(...a)=>a.forEach(v=>classes.delete(v)),contains:v=>classes.has(v),toggle:(v,b)=>{b??=!classes.has(v);b?classes.add(v):classes.delete(v);return b;}};
    }
    setAttribute(k,v){this.attributes[k]=String(v);}
    getAttribute(k){return this.attributes[k]??null;}
    append(...els){this.children.push(...els);}
    replaceChildren(...els){this.children=els;}
    focus(){document.activeElement=this;}
    querySelector(){return null;}
    getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
    hasPointerCapture(){return false;}
    releasePointerCapture(){}
    setPointerCapture(){}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatch('close');}
    click(){assert.ok(!this.disabled,`${this.id} is enabled`);this.dispatch('click');}
  }
  function get(id){assert.ok(ids.has(id),`actual HTML includes #${id}`);if(!elements.has(id))elements.set(id,new Element(id,id==='game'?'canvas':id.includes('button')?'button':'div'));return elements.get(id);}
  const buttons=[...html.matchAll(/<button\b([^>]*)>/g)].flatMap(([,attributes])=>{
    const data=[...attributes.matchAll(/data-(\w+)=["']([^"']+)["']/g)];
    if(!data.length)return [];
    const el=new Element('','button');for(const [,key,value]of data)el.dataset[key]=value;
    return [el];
  });
  document=new Target();document.hidden=false;document.body=new Element('body');document.activeElement=document.body;document.documentElement=new Element('html');document.getElementById=get;document.querySelector=()=>new Element();document.querySelectorAll=selector=>{const key=selector.match(/^\[data-(\w+)\]$/)?.[1];return key?buttons.filter(button=>key in button.dataset):[];};document.createElement=tag=>new Element('',tag);
  const window=new Target();window.devicePixelRatio=2;
  get('game').parentElement=get('viewport');
  const view={
    setQuality(q){this.quality=q;stats.qualityCalls.push(q.id);},setEnvironment(){},setMenuFrame(){},resetWicket(){},hitWicket(){},animateBowler(){},
    getReleasePosition(){return {x:-.2,y:2,z:-18.5};},project(p){return {x:640+p.x*100,y:360-(p.y-1)*100};},pointerWorld(x,y){return {x,y:1+y*.5,z:0};},
    updateGaze(d,dt,paused){stats.gazeDeltas.push({dt,paused});},updateBat(){},updateBall(){},render(){stats.renders++;},
    getPerformanceInfo(){return {frames:stats.renders,quality:this.quality.id};},
  };
  class Audio {setEnabled(){}setWind(){}setSurface(){}unlock(){}play(){}setSuspended(v){stats.audioSuspended=v;}}
  const context=vm.createContext({document,window,console:{...console,error:(...args)=>errors.push(args)},matchMedia:()=>({matches:coarse}),localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))},ResizeObserver:class{constructor(callback){this.callback=callback;resizeObservers.push(this);}observe(element){this.element=element;}},requestAnimationFrame:fn=>{const id=++seq;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),setTimeout:()=>++seq,clearTimeout:()=>{},Date,Math,Set,Map});
  const modules=new Map();
  async function dependency(specifier){
    if(modules.has(specifier))return modules.get(specifier);
    let exports;
    if(specifier==='./scene.js')exports={createScene:async(canvas,status,q)=>{view.setQuality(q);return view;}};
    else if(specifier==='./audio.js')exports={NetsAudio:Audio};
    else {
      const real=await import(pathToFileURL(path.join(root,'dist',specifier)));exports={...real};
      if(specifier==='./physics.js')exports.stepDelivery=(d,c,dt,...rest)=>{stats.physicsSteps++;stats.physicsDts.push(dt);return real.stepDelivery(d,c,dt,...rest);};
      if(specifier==='./bat-control.js'){
        exports.createBatControl=(...args)=>{stats.bat=real.createBatControl(...args);return stats.bat;};
        exports.stepBat=(b,dt,...rest)=>{stats.batSteps++;stats.batDts.push(dt);return real.stepBat(b,dt,...rest);};
      }
    }
    const mod=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:specifier});modules.set(specifier,mod);await mod.link(()=>{});await mod.evaluate();return mod;
  }
  const game=new vm.SourceTextModule(code,{context,identifier:path.join(root,'dist/game.js'),importModuleDynamically:dependency});
  await game.link(dependency);await game.evaluate();assert.deepEqual(errors,[],'game boots without caught errors');assert.ok(window.cricsim,'real entrypoint inspection hook exists');
  function pump(count=1,interval=1000/144){for(let i=0;i<count;i++){now+=interval;const queued=[...raf.values()];raf.clear();assert.ok(queued.length<=1,'only one RAF callback pending');for(const fn of queued)fn(now);assert.ok(raf.size<=1,'loop does not duplicate RAF callbacks');}assert.deepEqual(errors,[]);}
  function hide(value){document.hidden=value;document.dispatch('visibilitychange');}
  function quality(value){get('graphics').value=value;get('graphics').dispatch('change');}
  function resize(){for(const observer of resizeObservers)observer.callback([{contentRect:{height:80}}]);}
  function setting(id,value){get(id).value=value;get(id).dispatch('change');}
  function intent(value){const button=buttons.find(el=>el.dataset.intent===value);assert.ok(button,`actual HTML includes ${value} intent`);button.click();}
  function pointer(type,extra={}){get('game').dispatch(type,{pointerId:1,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,isPrimary:true,clientX:640,clientY:360,...extra});}
  return {stats,window,document,get,store,raf,pump,hide,quality,resize,view,setting,intent,pointer};
}
const results=[];
function passed(name){results.push(name);console.log('PASS '+name);}
const app=await boot('eco');
assert.equal(app.window.cricsim.performance.mode,'eco');assert.equal(app.view.quality.id,'eco');assert.equal(app.get('graphics').value,'eco');assert.equal(app.window.cricsim.performance.targetFps,20);
app.pump();let renders=app.stats.renders;app.pump(144);assert.ok(Math.abs(app.stats.renders-renders-20)<=1);assert.equal(app.stats.batSteps,0);passed('saved Eco restored; intro draws at 20 fps and runs no physics');
app.get('start-button').click();assert.equal(app.window.cricsim.phase,'ready');app.pump();renders=app.stats.renders;let batSteps=app.stats.batSteps;app.pump(144);assert.ok(Math.abs(app.stats.renders-renders-30)<=1);assert.ok(Math.abs(app.stats.batSteps-batSteps-240)<=1);assert.ok(app.stats.batDts.every(dt=>dt===1/240));passed('Eco draws at 30 fps while real bat integration continues at 240 Hz');
app.get('next-button').click();app.pump(330);assert.equal(app.window.cricsim.phase,'flight');assert.ok(app.stats.physicsSteps>0);assert.ok(app.stats.physicsDts.every(dt=>dt===1/240));passed('real run-up transitions to flight and delivery integration uses 1/240-second steps');
app.get('pause-button').click();assert.equal(app.stats.audioSuspended,true);app.pump();renders=app.stats.renders;batSteps=app.stats.batSteps;const ballTime=app.window.cricsim.ball.time;assert.equal(app.raf.size,0);app.pump(144);assert.equal(app.stats.renders,renders);assert.equal(app.stats.batSteps,batSteps);assert.equal(app.window.cricsim.ball.time,ballTime);passed('pause retains the canvas, suspends audio and stops RAF/physics');
app.quality('high');assert.equal(app.store.get('cricsim-graphics'),'high');assert.equal(app.view.quality.id,'high');app.pump();assert.equal(app.stats.renders,renders+1);assert.equal(app.raf.size,0);app.resize();app.pump();assert.equal(app.stats.renders,renders+2);assert.equal(app.raf.size,0);passed('quality changes and resize each redraw a paused canvas once');
app.get('resume-button').click();assert.equal(app.stats.audioSuspended,false);app.pump(1,5000);assert.equal(app.stats.batSteps,batSteps);app.pump(1);assert.ok(app.stats.batSteps>batSteps);assert.equal(app.window.cricsim.performance.targetFps,60);passed('resume resets clocks, avoids catch-up after a long gap and restores active scheduling');
app.hide(true);assert.equal(app.raf.size,0);assert.equal(app.stats.audioSuspended,true);renders=app.stats.renders;batSteps=app.stats.batSteps;app.pump(144);assert.equal(app.stats.renders,renders);assert.equal(app.stats.batSteps,batSteps);app.hide(false);app.pump(1,10000);assert.equal(app.stats.renders,renders+1);assert.equal(app.stats.batSteps,batSteps);assert.equal(app.raf.size,0);assert.equal(app.window.cricsim.performance.targetFps,0);passed('hidden tabs cancel RAF; returning draws once and stays paused without catch-up');
app.get('resume-button').click();app.pump();app.window.dispatch('blur');app.pump();assert.equal(app.raf.size,0);assert.equal(app.stats.audioSuspended,true);passed('window blur also stops rendering and suspends audio');
app.get('resume-button').click();app.pump();app.get('settings-button').click();app.pump();assert.equal(app.raf.size,0);app.get('close-setup').click();app.pump();assert.equal(app.raf.size,1);passed('settings panel pauses the game and closing it resumes the loop');
app.get('pause-button').click();app.pump();app.get('help-button').click();app.get('help-dialog').close();app.pump();assert.equal(app.raf.size,0);passed('help opened from paused state preserves pause when closed');
const restored=await boot(app.store.get('cricsim-graphics'));assert.equal(restored.view.quality.id,'high');assert.equal(restored.get('graphics').value,'high');passed('persisted graphics choice survives a fresh game entrypoint');
const automatic=await boot('invalid');assert.equal(automatic.window.cricsim.performance.mode,'auto');automatic.get('start-button').click();automatic.pump(1);automatic.pump(130,1000/30);assert.equal(automatic.window.cricsim.performance.autoLevel,1);automatic.quality('balanced');assert.equal(automatic.window.cricsim.performance.autoLevel,0);assert.equal(automatic.view.quality.id,'balanced');passed('invalid preference falls back to Auto; sustained overload applies quality reduction; manual mode resets it');

const standard=await boot();
assert.equal(standard.stats.bat.mode,'standard');assert.equal(standard.get('batting-mode').value,'standard');assert.equal(standard.get('manual-controls').hidden,true);
const invalidBatting=await boot('eco','invalid');assert.equal(invalidBatting.stats.bat.mode,'standard');
standard.setting('batting-mode','manual');assert.equal(standard.store.get('cricsim-batting-mode'),'manual');assert.equal(standard.get('manual-controls').hidden,false);
const manual=await boot('eco',standard.store.get('cricsim-batting-mode'));assert.equal(manual.stats.bat.mode,'manual');assert.equal(manual.get('batting-mode').value,'manual');
standard.setting('batting-mode','standard');assert.equal(standard.store.get('cricsim-batting-mode'),'standard');
const restoredStandard=await boot('eco',standard.store.get('cricsim-batting-mode'));assert.equal(restoredStandard.stats.bat.mode,'standard');
passed('Standard is the default and invalid-preference fallback; both batting choices persist and restore');

standard.get('start-button').click();standard.pump();
standard.pointer('pointerdown');standard.pointer('pointerup');
assert.equal(standard.stats.bat.held,false);
let crossings=0,lastZ=standard.stats.bat.pose.z,wasActive=false;
for(let i=0;i<240;i++){standard.pump();const p=standard.stats.bat.pose;if(lastZ>-.22&&p.z<=-.22)crossings++;lastZ=p.z;wasActive||=p.active;}
assert.equal(crossings,1,'a tap carries the real blade through the contact plane exactly once');assert.ok(wasActive,'the released stroke can still hit');assert.equal(standard.stats.bat.pose.active,false);assert.equal(standard.stats.bat.phase,'guard');
passed('a plain click and immediate release execute a complete Standard attack and return safely to guard');

standard.pointer('pointerdown');standard.pointer('pointerup');standard.pump(3);
standard.pointer('pointerdown',{button:2,buttons:2});
assert.equal(standard.stats.bat.defending,false,'a committed attack continues when a subsequent block press is rejected');
assert.equal(standard.get('reticle').classList.contains('is-defend'),false);assert.equal(standard.get('bat-guide').classList.contains('is-defend'),false);
standard.pointer('pointerup',{button:2});standard.pump(240);
passed('a rejected defence press during a committed attack cannot show false block styling');

standard.pointer('pointerdown');crossings=0;lastZ=standard.stats.bat.pose.z;
for(let i=0;i<360;i++){
  if(i===30)standard.pointer('pointerdown');
  standard.pump();const z=standard.stats.bat.pose.z;if(lastZ>-.22&&z<=-.22)crossings++;lastZ=z;
}
assert.equal(crossings,1,'holding or duplicate pointerdown cannot repeat an attack');
standard.pointer('pointerup');
standard.pointer('pointerdown');standard.pointer('pointerup');standard.pump(4);
standard.pointer('pointermove',{buttons:0,clientX:800,clientY:300});
assert.equal(standard.stats.bat.target.x,.25,'early aim corrections still work after release');
standard.pump(30);const lockedTarget={...standard.stats.bat.target};standard.pointer('pointermove',{buttons:0,clientX:400,clientY:500});
assert.deepEqual(standard.stats.bat.target,lockedTarget,'the downswing locks the chosen contact point');
standard.pump(240);passed('Standard accepts early aim corrections, locks the downswing and never repeats while held');

manual.get('start-button').click();manual.pump();manual.pointer('pointerdown');manual.pump(100);
assert.equal(manual.stats.bat.progress,0);assert.equal(manual.stats.bat.committed,false);assert.equal(manual.stats.bat.pose.active,false);
manual.pointer('pointermove',{clientY:90});manual.pump(60);
assert.equal(manual.stats.bat.committed,true);assert.ok(manual.stats.bat.progress>.9);manual.pointer('pointerup');manual.pump(120);
assert.equal(manual.stats.bat.pose.active,false);passed('Manual preserves swipe input: clicking alone does not swing, while a full gesture commits');

for(const cancel of ['pause','blur','pointercancel','mode','intent','settings']){
  standard.intent('grounded');standard.setting('batting-mode','standard');standard.pointer('pointerdown');standard.pump(10);
  if(cancel==='pause')standard.get('pause-button').click();
  else if(cancel==='blur')standard.window.dispatch('blur');
  else if(cancel==='pointercancel')standard.pointer('pointercancel');
  else if(cancel==='mode')standard.setting('batting-mode','manual');
  else if(cancel==='intent')standard.intent('lofted');
  else {standard.get('settings-button').click();standard.setting('hand','left');}
  assert.equal(standard.stats.bat.pose.active,false,`${cancel} immediately disables collision`);
  if(cancel==='pause'||cancel==='blur')standard.get('resume-button').click();
  else if(cancel==='settings')standard.get('close-setup').click();
  for(let i=0;i<150;i++){standard.pump();assert.equal(standard.stats.bat.pose.active,false,`${cancel} cannot resume the old stroke`);}
}
passed('pause, blur, pointer cancellation, mode, intent and settings changes cancel attacks without a ghost hit');

standard.setting('batting-mode','standard');standard.intent('grounded');standard.pointer('pointerdown',{button:2,buttons:2});standard.pump(60);
assert.equal(standard.stats.bat.defending,true);assert.equal(standard.stats.bat.pose.active,true);assert.equal(standard.stats.bat.progress,0);
standard.pointer('pointerup',{button:2});standard.pump(2);assert.equal(standard.stats.bat.defending,false);assert.equal(standard.stats.bat.pose.active,false);
const touch=await boot('eco',null,{coarse:true});touch.get('start-button').click();touch.pump();touch.intent('defend');touch.pointer('pointerdown',{pointerType:'touch'});touch.pump(60);
assert.equal(touch.stats.bat.defending,true);assert.equal(touch.stats.bat.pose.active,true);assert.equal(touch.stats.bat.progress,0);
touch.pointer('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:false});touch.pointer('pointerup',{pointerId:2,pointerType:'touch',isPrimary:false});assert.equal(touch.stats.bat.defending,true,'a secondary touch cannot release the primary block');
touch.pointer('pointerup',{pointerType:'touch'});touch.pump(2);assert.equal(touch.stats.bat.pose.active,false);passed('right-click defence and touch Defend remain held blocks; release and secondary-touch handling are correct');
console.log(JSON.stringify({checks:results.length,renderedFrames:app.stats.renders,batSteps:app.stats.batSteps,deliverySteps:app.stats.physicsSteps,errors:0},null,2));
