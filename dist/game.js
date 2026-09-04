import { DEFAULTS, BOWLERS, PITCHES, DT, clamp, createDelivery, stepDelivery } from './physics.js';
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
let resultRealTime=0,resultCounted=false,contactCount=0,cleanCount=0,ballsFaced=0,lastExit=null,ballSerial=0;
const bat={x:.25,y:.45,z:-.1,yaw:0,loft:0},target={x:.25,y:.45};
const input={held:false,defend:false,stroke:99,speed:0,mouseTime:0,keys:new Set(),lastX:0,lastY:0};
let soundContext=null;
function savePreferences(){try{localStorage.setItem('cricsim-preferences',JSON.stringify(config));}catch{}}
function unlockAudio(){if(!config.audio)return;try{soundContext??=new(window.AudioContext||window.webkitAudioContext)();if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});}catch{}}
function sound(type){if(!config.audio||!soundContext)return;try{const t=soundContext.currentTime;const o=soundContext.createOscillator(),g=soundContext.createGain();o.connect(g);g.connect(soundContext.destination);o.type=type==='contact'?'triangle':type==='wicket'?'square':'sine';o.frequency.setValueAtTime(type==='contact'?530:type==='wicket'?240:type==='release'?430:145,t);o.frequency.exponentialRampToValueAtTime(type==='contact'?95:65,t+.12);g.gain.setValueAtTime(type==='release'?.025:type==='contact'?.2:.09,t);g.gain.exponentialRampToValueAtTime(.0001,t+.16);o.start(t);o.stop(t+.17);}catch{}}
function syncControls(){
  for(const key of ['bowler','arm','hand','length','line','weather','timeScale'])$(key).value=String(config[key]);
  for(const key of ['auto','guide'])$(key).checked=config[key];
  const b=BOWLERS[config.bowler];$('speed').min=b.min;$('speed').max=b.max;$('speed-min').textContent=b.min;$('speed-max').textContent=b.max+' km/h';$('bowler-tag').textContent=b.short;$('bowler-description').textContent=b.description;
  for(const key of ['speed','age','wind']){$(key).value=config[key];$(key+'-value').innerHTML=`${config[key]} <span>${key==='age'?'overs':'km/h'}</span>`;}
  for(const button of document.querySelectorAll('[data-pitch]')){const active=button.dataset.pitch===config.pitch;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  $('pitch-detail').textContent=PITCHES[config.pitch].detail;$('sound-button').setAttribute('aria-label',config.audio?'Mute sound':'Enable sound');$('sound-button').setAttribute('aria-pressed',String(!config.audio));
  if(phase==='intro'||phase==='ready'){applyEnvironment();}
  $('clock-label').textContent=(config.timeScale===1?'REAL TIME':'SLOW PRACTICE')+' · '+config.timeScale+'×';
  $('reticle').style.visibility=config.guide?'visible':'hidden';
}
function applyEnvironment(){view?.setEnvironment(config);$('scene-weather').textContent=$('weather').selectedOptions[0].text.toUpperCase();$('scene-pitch').textContent=PITCHES[config.pitch].name.toUpperCase();$('delivery-speed').textContent=Math.round(config.speed);$('delivery-style').textContent=`${config.arm==='left'?'Left':'Right'}-arm ${config.bowler==='fast'?'pace':BOWLERS[config.bowler].name.toLowerCase()}`;}
for(const key of ['bowler','arm','hand','length','line','weather','timeScale','speed','age','wind','auto','guide']){
  $(key).addEventListener(['speed','age','wind'].includes(key)?'input':'change',event=>{
    config[key]=['auto','guide'].includes(key)?event.target.checked:['timeScale','speed','age','wind'].includes(key)?Number(event.target.value):event.target.value;
    if(key==='bowler')config.speed=BOWLERS[config.bowler].speed;
    if(key==='hand'&&phase==='intro'){bat.x=target.x=config.hand==='left'?-.25:.25;}
    syncControls();savePreferences();
  });
}
for(const button of document.querySelectorAll('[data-pitch]'))button.addEventListener('click',()=>{config.pitch=button.dataset.pitch;syncControls();savePreferences();});
function clearInput(){input.held=false;input.defend=false;input.stroke=99;input.speed=0;input.keys.clear();}
function updateStats(){$('stat-balls').textContent=ballsFaced;$('stat-contact').textContent=ballsFaced?Math.round(contactCount/ballsFaced*100)+'%':'—';$('stat-clean').textContent=cleanCount;$('stat-exit').innerHTML=(lastExit===null?'—':Math.round(lastExit))+' <small>km/h</small>';}
function nextBall(){
  if(!ready||paused||phase==='runup'||phase==='flight'||(phase==='result'&&resultRealTime<.8))return;
  if(phase==='intro'){$('intro').classList.add('hidden');$('viewport').classList.add('playing');}
  phase='runup';phaseTime=0;delivery=null;deliveryConfig={...config};resultRealTime=0;resultCounted=false;ballSerial++;
  $('shot-feedback').classList.add('hidden');$('next-button').disabled=true;$('delivery-state').textContent='BOWLER APPROACHING';clearInput();view.resetWicket();applyEnvironment();unlockAudio();$('game').focus({preventScroll:true});
}
function pause(force){if(phase==='intro'||!ready)return;paused=typeof force==='boolean'?force:!paused;clearInput();$('pause-overlay').classList.toggle('hidden',!paused);$('pause-button').innerHTML=paused?'▶ <span>Resume</span>':'Ⅱ <span>Pause</span>';if(!paused)$('game').focus({preventScroll:true});}
function onResult(event){
  if(resultCounted)return;resultCounted=true;ballsFaced++;if(delivery.hit){contactCount++;lastExit=delivery.exitSpeed;if(delivery.contact.quality>.7&&!delivery.contact.edge)cleanCount++;}else lastExit=null;
  phase='result';resultRealTime=0;$('shot-feedback').classList.remove('hidden');$('feedback-label').textContent='DELIVERY '+String(ballsFaced).padStart(2,'0');$('feedback-title').textContent=event.result;
  const detail=event.result==='Bowled'?'Watch the seam. Cover your stumps.':delivery.hit?(delivery.contact.edge?'Caught the edge of the blade.':delivery.contact.quality>.7?'Clean contact through the middle.':'Try to find the middle of the blade.'):(input.held?'The ball passed the bat. Adjust your timing.':'A leave or a miss. The next ball is yours.');
  $('feedback-detail').textContent=delivery.hit?`${detail} ${Math.round(delivery.exitSpeed)} km/h off the bat.`:detail;
  if(event.result==='Bowled'){view.hitWicket();sound('wicket');}
  $('delivery-state').textContent='DELIVERY COMPLETE';updateStats();
}
function tick(dt){
  const direction=(a,b)=>(input.keys.has(a)?1:0)-(input.keys.has(b)?1:0);
  bat.yaw=clamp(bat.yaw+direction('d','a')*dt*.95,-.95,.95);bat.loft=clamp(bat.loft+direction('w','s')*dt*.7,-.15,.85);
  const previous={...bat};input.stroke+=dt;
  const swing=!input.defend&&input.stroke<.26?Math.sin(input.stroke/.26*Math.PI)*(.40+Math.min(input.speed,3)*.10):0;
  const blend=1-Math.exp(-36*dt);
  bat.x+=(target.x-bat.x)*blend;bat.y+=(target.y-bat.y)*blend;bat.z=-.10-swing;
  input.speed*=Math.exp(-dt*2);
  if(phase==='runup'){
    phaseTime+=dt;
    if(phaseTime>=2.2){delivery=createDelivery(deliveryConfig,(Date.now()+ballSerial*4723)>>>0);phase='flight';phaseTime=0;$('delivery-state').textContent='BALL IN FLIGHT';$('delivery-speed').textContent=Math.round(delivery.speed);sound('release');}
  }else if((phase==='flight'||phase==='result')&&delivery&&delivery.time<5){
    phaseTime+=dt;
    for(const event of stepDelivery(delivery,deliveryConfig,dt,bat,previous)){if(event.type==='bounce'&&event.impactSpeed>.8)sound('bounce');if(event.type==='contact')sound('contact');if(event.type==='result')onResult(event);if(event.type==='net'&&delivery.time<2)sound('bounce');}
    if(delivery.time>3&&!resultCounted)onResult({result:delivery.hit?'Bat contact':'Missed'});
  }
}
const canvas=$('game');
function updatePointer(event){
  if(!view||paused||phase==='intro')return;const r=canvas.getBoundingClientRect();const x=(event.clientX-r.left)/r.width*2-1,y=1-(event.clientY-r.top)/r.height*2;const p=view.pointerWorld(x,y);if(!p)return;
  const now=performance.now(),elapsed=Math.max(.008,Math.min(.15,(now-input.mouseTime)/1000));const nx=clamp(p.x,-1.18,1.18),ny=clamp(p.y,.33,1.7);
  const velocity=Math.hypot(nx-target.x,ny-target.y)/elapsed;input.speed=Math.max(input.speed,Math.min(velocity,3));input.mouseTime=now;
  target.x=nx;target.y=ny;
}
canvas.addEventListener('pointermove',updatePointer);
canvas.addEventListener('pointerdown',event=>{if(paused||phase==='intro')return;event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);updatePointer(event);unlockAudio();if(event.button===2){input.defend=true;input.stroke=99;}else{input.held=true;input.stroke=0;}});
canvas.addEventListener('pointerup',event=>{if(event.button===2)input.defend=false;else input.held=false;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('pointercancel',clearInput);canvas.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('keydown',event=>{
  if($('help-dialog').open)return;
  if(['SELECT','INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)&&event.code!=='Escape')return;
  if(['Space','KeyW','KeyA','KeyS','KeyD','KeyP','KeyC'].includes(event.code))event.preventDefault();
  if(event.code==='Space'&&!event.repeat)nextBall();if((event.code==='KeyP'||event.code==='Escape')&&!event.repeat)pause();
  if(event.key==='?')showHelp();if(event.code==='KeyC'){bat.yaw=0;bat.loft=0;}
  input.keys.add(event.key.toLowerCase());
});document.addEventListener('keyup',event=>input.keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>{clearInput();if(phase!=='intro')pause(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase!=='intro')pause(true);});
$('start-button').addEventListener('click',nextBall);$('next-button').addEventListener('click',nextBall);$('pause-button').addEventListener('click',()=>pause());$('resume-button').addEventListener('click',()=>pause(false));
$('reset-session').addEventListener('click',()=>{phase='ready';phaseTime=0;delivery=null;ballsFaced=contactCount=cleanCount=ballSerial=0;lastExit=null;sessionSeconds=0;resultCounted=false;resultRealTime=0;clearInput();bat.x=target.x=config.hand==='left'?-.25:.25;bat.y=target.y=.45;bat.z=-.1;bat.yaw=bat.loft=0;$('intro').classList.add('hidden');$('shot-feedback').classList.add('hidden');$('viewport').classList.add('playing');$('delivery-state').textContent='READY WHEN YOU ARE';$('next-button').disabled=false;pause(false);view?.resetWicket();applyEnvironment();updateStats();});
$('sound-button').addEventListener('click',()=>{config.audio=!config.audio;if(config.audio)unlockAudio();syncControls();savePreferences();});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('fullscreen-button').title='Fullscreen is unavailable in this browser';}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});
$('settings-button').addEventListener('click',()=>{if(innerWidth<=850)document.body.classList.toggle('setup-open');else document.body.classList.toggle('panel-collapsed');});$('close-setup').addEventListener('click',()=>document.body.classList.remove('setup-open'));
let helpWasPaused=false;
function showHelp(){helpWasPaused=paused;pause(true);$('help-dialog').showModal();}
$('help-button').addEventListener('click',showHelp);for(const id of ['close-help','help-done'])$(id).addEventListener('click',()=>$('help-dialog').close());$('help-dialog').addEventListener('close',()=>{if(!helpWasPaused)pause(false);});
function showError(error){console.error(error);$('error-overlay').classList.remove('hidden');$('start-button').disabled=true;$('next-button').disabled=true;ready=false;}
syncControls();updateStats();
$('start-button').disabled=true;$('next-button').disabled=true;
try{
  const {createScene}=await import('./scene.js');view=createScene(canvas);applyEnvironment();ready=true;$('start-button').disabled=false;$('next-button').disabled=false;
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();pause(true);$('error-message').textContent='The graphics connection was interrupted. Reload to return to the nets.';showError(new Error('WebGL context lost'));});
  function frame(now){
    requestAnimationFrame(frame);const delta=lastTime?Math.min((now-lastTime)/1000,.1):0;lastTime=now;
    if(!paused&&ready){
      if(phase!=='intro')sessionSeconds+=delta;
      accumulator+=delta*config.timeScale;let steps=0;while(accumulator>=DT&&steps<30){tick(DT);accumulator-=DT;steps++;}
      if(phase==='result'){resultRealTime+=delta;if(resultRealTime>.8)$('next-button').disabled=false;if(config.auto&&resultRealTime>3)nextBall();}
      view.animateBowler(phase,phase==='runup'?phaseTime:delivery?.time??0,deliveryConfig);
    }else accumulator=0;
    view.updateBat(bat);view.updateBall(delivery,config.guide);view.render();
    const point=view.project(bat);$('reticle').style.left=point.x+'px';$('reticle').style.top=point.y+'px';
    $('bat-angle').textContent='FACE '+Math.round(bat.yaw*180/Math.PI)+'°';$('bat-loft').textContent='LOFT '+Math.round(bat.loft*180/Math.PI)+'°';
    const minutes=Math.floor(sessionSeconds/60),seconds=Math.floor(sessionSeconds%60);$('session-time').textContent=String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
  }requestAnimationFrame(frame);
}catch(error){showError(error);}
