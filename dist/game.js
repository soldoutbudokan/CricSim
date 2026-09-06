import { DEFAULTS, BOWLERS, PITCHES, DT, clamp, createDelivery, stepDelivery } from './physics.js';
import { NetsAudio } from './audio.js';
import { createBatControl, startStroke, moveBatTarget, releaseStroke, stepBat, BAT_LIMITS } from './bat-control.js';
const $=id=>document.getElementById(id);
const config={...DEFAULTS};
try {const saved=JSON.parse(localStorage.getItem('cricsim-preferences')||'null');if(saved){for(const key of Object.keys(DEFAULTS))if(typeof saved[key]===typeof DEFAULTS[key])config[key]=saved[key];}}
catch { /* Private browsing may disable device-local preferences. */ }
if(!BOWLERS[config.bowler])config.bowler='fast';if(!PITCHES[config.pitch])config.pitch='hard';
for(const key of ['arm','hand'])if(!['left','right'].includes(config[key]))config[key]='right';
if(!['clear','overcast','evening'].includes(config.weather))config.weather='clear';
if(!['yorker','full','good','short','mixed'].includes(config.length))config.length='good';
if(!['leg','middle','off','wide','mixed'].includes(config.line))config.line='off';
if(![1,.75,.5].includes(config.timeScale))config.timeScale=1;
config.speed=clamp(config.speed,BOWLERS[config.bowler].min,BOWLERS[config.bowler].max);config.age=clamp(config.age,0,80);config.wind=clamp(config.wind,-25,25);
let view,phase='intro',paused=false,phaseTime=0,delivery=null,deliveryConfig={...config},accumulator=0,lastTime=0,sessionSeconds=0,ready=false;
let resultRealTime=0,resultCounted=false,contactCount=0,cleanCount=0,ballsFaced=0,lastExit=null,ballSerial=0,strideIndex=0;
const batControl=createBatControl(config.hand),bat=batControl.pose,target=batControl.target;
const input={held:false,defend:false,keys:new Set()};
const audio=new NetsAudio();audio.setEnabled(config.audio);
const viewport=$('viewport'),coarsePointer=matchMedia('(pointer:coarse)').matches;
function savePreferences(){try{localStorage.setItem('cricsim-preferences',JSON.stringify(config));}catch{}}
function unlockAudio(){audio.setEnabled(config.audio);audio.unlock();}
function sound(type,position=delivery?.p,strength=1,detail={}){audio.play(type,position,strength,detail);}
// The stylesheet choreographs the HUD from these two attributes.
function setPhase(next){phase=next;viewport.dataset.phase=next;coach();}
function setState(text){$('delivery-state').textContent=text;}
// Short, phase-aware coaching lines for the first few balls only.
function coach(){
  let tip='';
  if(ballsFaced<3){
    if(phase==='ready')tip=ballsFaced?'Line the ring up with the ball. Hold left click and push through it.':(coarsePointer?'Drag to position the bat. Keep dragging forward to swing.':'Move the mouse to line the bat up. Space bowls.');
    else if(phase==='runup')tip='Watch the hand.';
    else if(phase==='result'&&delivery)tip=delivery.hit?(delivery.contact.edge?'Off the edge. Line the ring up with the ball earlier.':delivery.contact.quality>.7?'That is the middle. Now do it again.':'Contact. Find the middle of the blade.'):(input.held?'Late. Start the push as the ball pitches.':'Hold left click and push the mouse through the line of the ball.');
  }
  $('coach-tip').textContent=tip;
}
function paint(el){const pct=(el.value-el.min)/(el.max-el.min)*100;el.style.setProperty('--pct',pct+'%');}
function syncControls(){
  for(const key of ['bowler','arm','hand','length','line','weather','timeScale'])$(key).value=String(config[key]);
  for(const key of ['auto','guide'])$(key).checked=config[key];
  const b=BOWLERS[config.bowler];$('speed').min=b.min;$('speed').max=b.max;$('speed-min').textContent=b.min;$('speed-max').textContent=b.max+' km/h';$('bowler-tag').textContent=b.short;$('bowler-description').textContent=b.description;
  for(const key of ['speed','age','wind']){$(key).value=config[key];$(key+'-value').innerHTML=`${config[key]} <span>${key==='age'?'overs':'km/h'}</span>`;paint($(key));}
  for(const button of document.querySelectorAll('[data-pitch]')){const active=button.dataset.pitch===config.pitch;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  $('pitch-detail').textContent=PITCHES[config.pitch].detail;$('sound-button').setAttribute('aria-label',config.audio?'Mute sound':'Enable sound');$('sound-button').setAttribute('aria-pressed',String(!config.audio));
  if(phase==='intro'||phase==='ready'){applyEnvironment();}
  $('clock-label').textContent=(config.timeScale===1?'Real time':config.timeScale===.75?'Read the ball':'Slow practice')+' · '+config.timeScale+'×';
  viewport.dataset.timescale=String(config.timeScale);
  $('reticle').style.visibility=config.guide?'visible':'hidden';
}
function applyEnvironment(){view?.setEnvironment(config);audio.setWind(config.wind);audio.setSurface(config.pitch);$('scene-weather').textContent=$('weather').selectedOptions[0].text;$('scene-pitch').textContent=PITCHES[config.pitch].name;$('delivery-speed').textContent=Math.round(config.speed);$('delivery-style').textContent=`${config.arm==='left'?'Left':'Right'}-arm ${config.bowler==='fast'?'pace':BOWLERS[config.bowler].name.toLowerCase()}`;}
for(const key of ['bowler','arm','hand','length','line','weather','timeScale','speed','age','wind','auto','guide']){
  $(key).addEventListener(['speed','age','wind'].includes(key)?'input':'change',event=>{
    config[key]=['auto','guide'].includes(key)?event.target.checked:['timeScale','speed','age','wind'].includes(key)?Number(event.target.value):event.target.value;
    if(key==='bowler')config.speed=BOWLERS[config.bowler].speed;
    if(key==='hand'&&(phase==='intro'||phase==='ready')){bat.x=target.x=config.hand==='left'?-.25:.25;}
    syncControls();savePreferences();
  });
}
for(const button of document.querySelectorAll('[data-pitch]'))button.addEventListener('click',()=>{config.pitch=button.dataset.pitch;syncControls();savePreferences();});
function setReticle(){const r=$('reticle');r.classList.toggle('is-held',input.held);r.classList.toggle('is-defend',input.defend);}
function clearInput(){input.held=false;input.defend=false;releaseStroke(batControl);input.keys.clear();setReticle();}
function setStat(id,html){const el=$(id);if(el.innerHTML===html)return;el.innerHTML=html;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}
function updateStats(){setStat('stat-balls',String(ballsFaced));setStat('stat-contact',ballsFaced?Math.round(contactCount/ballsFaced*100)+'%':'—');setStat('stat-clean',String(cleanCount));setStat('stat-exit',(lastExit===null?'—':Math.round(lastExit))+' <small>km/h</small>');viewport.dataset.balls=String(ballsFaced);}
function takeGuard(){
  $('intro').classList.add('hidden');viewport.classList.add('playing');closeSetup();
  setPhase('ready');setState('Ready when you are');$('next-button').disabled=false;unlockAudio();$('game').focus({preventScroll:true});
}
function nextBall(){
  if(!ready||paused||phase==='runup'||phase==='flight'||(phase==='result'&&resultRealTime<.8))return;
  if(phase==='intro'){takeGuard();return;}
  phaseTime=0;delivery=null;deliveryConfig={...config};resultRealTime=0;resultCounted=false;ballSerial++;strideIndex=-1;
  $('shot-feedback').classList.add('hidden');$('next-button').disabled=true;setPhase('runup');setState('Bowler approaching');clearInput();view.resetWicket();applyEnvironment();unlockAudio();$('game').focus({preventScroll:true});
}
function pause(force){
  if(phase==='intro'||!ready)return;paused=typeof force==='boolean'?force:!paused;clearInput();
  $('pause-overlay').classList.toggle('hidden',!paused);document.body.classList.toggle('paused',paused);$('pause-button').setAttribute('aria-label',paused?'Resume':'Pause');
  if(!paused)$('game').focus({preventScroll:true});
}
function onResult(event){
  if(resultCounted)return;resultCounted=true;ballsFaced++;if(delivery.hit){contactCount++;lastExit=delivery.exitSpeed;if(delivery.contact.quality>.7&&!delivery.contact.edge)cleanCount++;}else lastExit=null;
  setPhase('result');resultRealTime=0;
  const card=$('shot-feedback');card.dataset.outcome=event.result.toLowerCase();card.classList.remove('hidden');
  $('feedback-label').textContent='Delivery '+String(ballsFaced).padStart(2,'0');$('feedback-title').textContent=event.result;
  const detail=event.result==='Bowled'?'Through the gate. Cover your stumps.':delivery.hit?(delivery.contact.edge?'Caught the edge of the blade.':delivery.contact.quality>.7?'Clean contact through the middle.':'Contact, but not the middle of the blade.'):(input.held?'The ball beat the bat. Adjust your timing.':'A leave, or a miss. The next ball is yours.');
  $('feedback-detail').textContent=delivery.hit?`${detail} ${Math.round(delivery.exitSpeed)} km/h off the bat.`:detail;
  if(event.result==='Bowled'){view.hitWicket();sound('wicket');}
  setState('Delivery complete');updateStats();
}
function tick(dt){
  const previous=stepBat(batControl,dt,input.keys);
  if(phase==='runup'){
    phaseTime+=dt;
    // Footfalls follow the run-up cycle in scene.js; the gather before delivery lands harder.
    const stride=phaseTime<1.45?Math.floor(phaseTime*(deliveryConfig.bowler.includes('spin')?11:16)/Math.PI):phaseTime<1.85?12:13;
    if(stride!==strideIndex){strideIndex=stride;const arm=deliveryConfig.arm==='left'?-1:1;sound('step',{x:-.195*arm,z:-23.4+Math.min(phaseTime/1.45,1)*4.5},stride>=12?1.7:.8);}
    if(phaseTime>=2.2){view.animateBowler('runup',2.2,deliveryConfig);delivery=createDelivery(deliveryConfig,(Date.now()+ballSerial*4723)>>>0,view.getReleasePosition());setPhase('flight');phaseTime=0;setState('Ball in flight');$('delivery-speed').textContent=Math.round(delivery.speed);}
  }else if((phase==='flight'||phase==='result')&&delivery&&delivery.time<5){
    phaseTime+=dt;
    for(const event of stepDelivery(delivery,deliveryConfig,dt,bat,previous)){
      if(event.type==='bounce'&&event.impactSpeed>.8)sound('bounce',event,event.impactSpeed/9);
      if(event.type==='contact')sound('contact',delivery.p,1,{quality:event.quality,edge:event.edge,exitSpeed:event.exitSpeed,defending:bat.defending});
      if(event.type==='result')onResult(event);
      if(event.type==='net'&&delivery.time<2.5)sound('net',delivery.p,Math.hypot(delivery.v.x,delivery.v.y,delivery.v.z)/22);
    }
    if(delivery.time>3&&!resultCounted)onResult({result:delivery.hit?'Bat contact':'Missed'});
  }
}
const canvas=$('game');
function updatePointer(event){
  if(!view||paused||phase==='intro')return;const r=canvas.getBoundingClientRect();const x=(event.clientX-r.left)/r.width*2-1,y=1-(event.clientY-r.top)/r.height*2;const p=view.pointerWorld(x,y);if(!p)return;
  moveBatTarget(batControl,p.x,p.y);
}
canvas.addEventListener('pointermove',updatePointer);
canvas.addEventListener('pointerdown',event=>{if(paused||phase==='intro')return;event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);updatePointer(event);unlockAudio();input.defend=event.button===2;input.held=!input.defend;startStroke(batControl,input.defend);setReticle();});
canvas.addEventListener('pointerup',event=>{input.defend=false;input.held=false;releaseStroke(batControl);setReticle();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('pointercancel',clearInput);canvas.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('keydown',event=>{
  if($('help-dialog').open)return;
  if(event.code==='Escape'&&document.body.classList.contains('setup-open')){closeSetup();return;}
  if(['SELECT','INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)&&event.code!=='Escape')return;
  if(['Space','KeyW','KeyA','KeyS','KeyD','KeyP','KeyC','KeyQ','KeyE'].includes(event.code))event.preventDefault();
  if(event.code==='Space'&&!event.repeat)nextBall();if((event.code==='KeyP'||event.code==='Escape')&&!event.repeat)pause();
  if(event.key==='?')showHelp();if(event.code==='KeyC'){bat.yaw=0;bat.loft=0;bat.roll=0;}
  input.keys.add(event.key.toLowerCase());
});document.addEventListener('keyup',event=>input.keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>{clearInput();if(phase!=='intro')pause(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase!=='intro')pause(true);});
$('start-button').addEventListener('click',nextBall);$('next-button').addEventListener('click',nextBall);$('pause-button').addEventListener('click',()=>pause());$('resume-button').addEventListener('click',()=>pause(false));
$('reset-session').addEventListener('click',()=>{phaseTime=0;delivery=null;ballsFaced=contactCount=cleanCount=ballSerial=0;lastExit=null;sessionSeconds=0;resultCounted=false;resultRealTime=0;clearInput();bat.x=target.x=config.hand==='left'?-.25:.25;bat.y=target.y=.45;bat.z=-.1;bat.yaw=bat.loft=bat.roll=0;$('intro').classList.add('hidden');$('shot-feedback').classList.add('hidden');viewport.classList.add('playing');setPhase('ready');setState('Ready when you are');$('next-button').disabled=false;pause(false);closeSetup();view?.resetWicket();applyEnvironment();updateStats();});
$('sound-button').addEventListener('click',()=>{config.audio=!config.audio;audio.setEnabled(config.audio);if(config.audio)unlockAudio();syncControls();savePreferences();});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('fullscreen-button').title='Fullscreen is unavailable in this browser';}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});
function openSetup(open=!document.body.classList.contains('setup-open')){document.body.classList.toggle('setup-open',open);$('settings-button').setAttribute('aria-expanded',String(open));if(open)$('setup').querySelector('select,button,input')?.focus({preventScroll:true});else if(phase!=='intro')$('game').focus({preventScroll:true});}
function closeSetup(){openSetup(false);}
$('settings-button').addEventListener('click',()=>openSetup());$('close-setup').addEventListener('click',closeSetup);$('drawer-scrim').addEventListener('click',closeSetup);
let helpWasPaused=false;
function showHelp(){helpWasPaused=paused;pause(true);$('help-dialog').showModal();}
$('help-button').addEventListener('click',showHelp);for(const id of ['close-help','help-done'])$(id).addEventListener('click',()=>$('help-dialog').close());$('help-dialog').addEventListener('close',()=>{if(!helpWasPaused)pause(false);});
function showError(error){console.error(error);$('error-message').textContent='The 3D scene or its assets could not load. Check your connection and WebGL 2 support, then try again.';$('error-overlay').classList.remove('hidden');$('start-button').disabled=true;$('next-button').disabled=true;ready=false;}
syncControls();updateStats();
$('start-button').disabled=true;$('next-button').disabled=true;
try{
  $('asset-status').textContent='Preparing the nets…';
  const {createScene}=await import('./scene.js');view=await createScene(canvas,status=>{$('asset-status').textContent=status;});applyEnvironment();ready=true;$('start-button').disabled=false;$('next-button').disabled=false;
  $('asset-status').textContent=coarsePointer?'Drag to position · keep dragging to swing':'Mouse & keyboard recommended';
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();pause(true);$('error-message').textContent='The graphics connection was interrupted. Reload to return to the nets.';showError(new Error('WebGL context lost'));});
  const reticle=$('reticle');
  function frame(now){
    requestAnimationFrame(frame);const delta=lastTime?Math.min((now-lastTime)/1000,.1):0;lastTime=now;
    if(!paused&&ready){
      if(phase!=='intro')sessionSeconds+=delta;
      accumulator+=delta*config.timeScale;let steps=0;while(accumulator>=DT&&steps<30){tick(DT);accumulator-=DT;steps++;}
      if(phase==='result'){resultRealTime+=delta;if(resultRealTime>.8)$('next-button').disabled=false;if(config.auto&&resultRealTime>3)nextBall();}
      view.animateBowler(phase,phase==='runup'?phaseTime:delivery?.time??0,deliveryConfig);
    }else accumulator=0;
    view.updateGaze(delivery,delta,paused);view.updateBat(bat);view.updateBall(delivery,config.guide);view.render();
    const point=view.project(bat);reticle.style.left=point.x+'px';reticle.style.top=point.y+'px';reticle.style.setProperty('--travel',(batControl.travel/BAT_LIMITS.travel).toFixed(3));
    $('bat-angle').textContent=Math.round(bat.yaw*180/Math.PI)+'°';$('bat-loft').textContent=Math.round(bat.loft*180/Math.PI)+'°';$('bat-roll').textContent=Math.round(bat.roll*180/Math.PI)+'°';
    const minutes=Math.floor(sessionSeconds/60),seconds=Math.floor(sessionSeconds%60);$('session-time').textContent=String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
  }requestAnimationFrame(frame);
}catch(error){showError(error);}
