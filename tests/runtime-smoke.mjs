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
async function boot(saved='eco'){
  const store=new Map(saved===null?[]:[['cricsim-graphics',saved]]),elements=new Map(),raf=new Map(),resizeObservers=[],errors=[];
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
  document=new Target();document.hidden=false;document.body=new Element('body');document.activeElement=document.body;document.documentElement=new Element('html');document.getElementById=get;document.querySelector=()=>new Element();document.querySelectorAll=()=>[];document.createElement=tag=>new Element('',tag);
  const window=new Target();window.devicePixelRatio=2;
  get('game').parentElement=get('viewport');
  const view={
    setQuality(q){this.quality=q;stats.qualityCalls.push(q.id);},setEnvironment(){},setMenuFrame(){},resetWicket(){},hitWicket(){},animateBowler(){},
    getReleasePosition(){return {x:-.2,y:2,z:-18.5};},project(){return {x:640,y:360};},pointerWorld(){return {x:0,y:1,z:0};},
    updateGaze(d,dt,paused){stats.gazeDeltas.push({dt,paused});},updateBat(){},updateBall(){},render(){stats.renders++;},
    getPerformanceInfo(){return {frames:stats.renders,quality:this.quality.id};},
  };
  class Audio {setEnabled(){}setWind(){}setSurface(){}unlock(){}play(){}setSuspended(v){stats.audioSuspended=v;}}
  const context=vm.createContext({document,window,console:{...console,error:(...args)=>errors.push(args)},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))},ResizeObserver:class{constructor(callback){this.callback=callback;resizeObservers.push(this);}observe(element){this.element=element;}},requestAnimationFrame:fn=>{const id=++seq;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),setTimeout:()=>++seq,clearTimeout:()=>{},Date,Math,Set,Map});
  const modules=new Map();
  async function dependency(specifier){
    if(modules.has(specifier))return modules.get(specifier);
    let exports;
    if(specifier==='./scene.js')exports={createScene:async(canvas,status,q)=>{view.setQuality(q);return view;}};
    else if(specifier==='./audio.js')exports={NetsAudio:Audio};
    else {
      const real=await import(pathToFileURL(path.join(root,'dist',specifier)));exports={...real};
      if(specifier==='./physics.js')exports.stepDelivery=(d,c,dt,...rest)=>{stats.physicsSteps++;stats.physicsDts.push(dt);return real.stepDelivery(d,c,dt,...rest);};
      if(specifier==='./bat-control.js')exports.stepBat=(b,dt,...rest)=>{stats.batSteps++;stats.batDts.push(dt);return real.stepBat(b,dt,...rest);};
    }
    const mod=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:specifier});modules.set(specifier,mod);await mod.link(()=>{});await mod.evaluate();return mod;
  }
  const game=new vm.SourceTextModule(code,{context,identifier:path.join(root,'dist/game.js'),importModuleDynamically:dependency});
  await game.link(dependency);await game.evaluate();assert.deepEqual(errors,[],'game boots without caught errors');assert.ok(window.cricsim,'real entrypoint inspection hook exists');
  function pump(count=1,interval=1000/144){for(let i=0;i<count;i++){now+=interval;const queued=[...raf.values()];raf.clear();assert.ok(queued.length<=1,'only one RAF callback pending');for(const fn of queued)fn(now);assert.ok(raf.size<=1,'loop does not duplicate RAF callbacks');}assert.deepEqual(errors,[]);}
  function hide(value){document.hidden=value;document.dispatch('visibilitychange');}
  function quality(value){get('graphics').value=value;get('graphics').dispatch('change');}
  function resize(){for(const observer of resizeObservers)observer.callback([{contentRect:{height:80}}]);}
  return {stats,window,document,get,store,raf,pump,hide,quality,resize,view};
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
console.log(JSON.stringify({checks:results.length,renderedFrames:app.stats.renders,batSteps:app.stats.batSteps,deliverySteps:app.stats.physicsSteps,errors:0},null,2));
