import { DEFAULTS, BOWLERS, PITCHES, PACE_SPREADS, DT, clamp, createDelivery, stepDelivery } from './physics.js';
import { NetsAudio } from './audio.js';
import { createBatControl, resetBatControl, resetBatTrim, setBatIntent, setSwipeLength, SWIPE_LENGTHS, startStroke, moveBatTarget, releaseStroke, stepBat, shotName, strokeSnapshot, CONTACT_Z } from './bat-control.js';
import { describeShot, describeMiss, missDiagram, isControlled, isPlayingShot, missTitle } from './shot-feedback.js';
import { SHORTCUTS, SHORTCUT_GROUPS, keyLabel, createShortcutState, serializeShortcutState, isShortcutEnabled, setShortcutEnabled, matchShortcut, cycleValue } from './shortcuts.js';
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
if(!SWIPE_LENGTHS[config.swipe])config.swipe='standard';if(!(config.speedSpread in PACE_SPREADS))config.speedSpread='none';
config.speed=clamp(config.speed,BOWLERS[config.bowler].min,BOWLERS[config.bowler].max);config.age=clamp(config.age,0,80);config.wind=clamp(config.wind,-25,25);
let shortcutState=createShortcutState();
try{shortcutState=createShortcutState(JSON.parse(localStorage.getItem('cricsim-shortcuts')||'null'));}catch{}
let view,phase='intro',paused=false,phaseTime=0,delivery=null,deliveryConfig={...config},accumulator=0,lastTime=0,sessionSeconds=0,ready=false;
let resultRealTime=0,resultCounted=false,controlCount=0,cleanCount=0,ballsFaced=0,lastExit=null,ballSerial=0,strideIndex=0;
const batControl=createBatControl(config.hand),bat=batControl.pose,target=batControl.target;
const input={held:false,defend:false,pointerId:null,button:0,keys:new Set()};
const TRIM_KEYS={KeyA:'a',KeyD:'d',KeyW:'w',KeyS:'s',KeyQ:'q',KeyE:'e'};
let contactFlash=0;
const audio=new NetsAudio();audio.setEnabled(config.audio);
const viewport=$('viewport'),coarsePointer=matchMedia('(pointer:coarse)').matches;
// The result card and notices are placed from the HUD's measured heights, so they never sit on the scorebug when it wraps or on the stroke panel.
new ResizeObserver(entries=>viewport.style.setProperty('--hud-top',Math.round(entries[0].contentRect.height)+'px')).observe(document.querySelector('.hud-top'));
new ResizeObserver(entries=>viewport.style.setProperty('--hud-bottom',Math.round(entries[0].contentRect.height)+'px')).observe(document.querySelector('.hud-bottom'));
function savePreferences(){try{localStorage.setItem('cricsim-preferences',JSON.stringify(config));}catch{}}
function saveShortcuts(){try{localStorage.setItem('cricsim-shortcuts',JSON.stringify(serializeShortcutState(shortcutState)));}catch{}}
function unlockAudio(){audio.setEnabled(config.audio);audio.unlock();}
function sound(type,position=delivery?.p,strength=1,detail={}){audio.play(type,position,strength,detail);}
// The stylesheet choreographs the HUD from these two attributes.
function setPhase(next){phase=next;viewport.dataset.phase=next;if(next!=='intro')view?.setMenuFrame(null);coach();}
function setState(text){$('delivery-state').textContent=text;}
// Short, phase-aware coaching lines for the first few balls only; the result card carries its own advice.
function coach(){
  let tip='';
  if(ballsFaced<3){
    if(phase==='ready')tip=coarsePointer?'Touch the line of the ball, then swipe up to drive or sideways to cut or pull.':'Aim the ring. Hold and swipe up to drive, sideways to cut or pull. Space bowls.';
    else if(phase==='runup')tip='Watch the hand.';
  }
  $('coach-tip').textContent=tip;
}
// A brief line under the scorebug so a key press has visible effect without opening a drawer.
let noticeTimer=0;
function notice(label,value=''){
  const el=$('notice');el.hidden=true;el.textContent=label;
  if(value){const b=document.createElement('b');b.textContent=value;el.append(b);}
  void el.offsetWidth;el.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{el.hidden=true;},1700);
}
function optionText(id,value){return [...$(id).options].find(option=>option.value===String(value))?.text??String(value);}
function paint(el){const pct=(el.value-el.min)/(el.max-el.min)*100;el.style.setProperty('--pct',pct+'%');}
function syncControls(){
  for(const key of ['bowler','arm','hand','length','line','weather','timeScale','swipe','speedSpread'])$(key).value=String(config[key]);
  for(const key of ['auto','guide'])$(key).checked=config[key];
  const b=BOWLERS[config.bowler];$('speed').min=b.min;$('speed').max=b.max;$('speed-min').textContent=b.min;$('speed-max').textContent=b.max+' km/h';$('bowler-tag').textContent=b.short;$('bowler-description').textContent=b.description;
  for(const key of ['speed','age','wind']){$(key).value=config[key];$(key+'-value').innerHTML=`${config[key]} <span>${key==='age'?'overs':'km/h'}</span>`;paint($(key));}
  for(const button of document.querySelectorAll('[data-pitch]')){const active=button.dataset.pitch===config.pitch;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  $('pitch-detail').textContent=PITCHES[config.pitch].detail;$('sound-button').setAttribute('aria-label',config.audio?'Mute sound':'Enable sound');$('sound-button').setAttribute('aria-pressed',String(!config.audio));
  if(phase==='intro'||phase==='ready'){applyEnvironment();}
  $('clock-label').textContent=(config.timeScale===1?'Real time':config.timeScale===.75?'Read the ball':'Slow practice')+' · '+config.timeScale+'×';
  viewport.dataset.timescale=String(config.timeScale);
  $('reticle').style.visibility=config.guide?'visible':'hidden';
  setSwipeLength(batControl,SWIPE_LENGTHS[config.swipe]);
  syncMenu();
}
function syncMenu(){
  $('menu-bowling').textContent=`${config.arm==='left'?'Left':'Right'}-arm ${config.bowler==='fast'?'pace':BOWLERS[config.bowler].name.toLowerCase()}`;
  $('menu-speed').innerHTML=`${Math.round(config.speed)} <small>km/h</small>`;
  $('menu-surface').textContent=PITCHES[config.pitch].name;
  $('menu-length').textContent=(config.length==='mixed'?'Mixed length':optionText('length',config.length))+' · '+(config.line==='mixed'?'mixed line':optionText('line',config.line).toLowerCase());
  $('menu-wind').textContent=config.wind?(config.wind<0?`← ${-config.wind} km/h`:`${config.wind} km/h →`):'Still air';
  $('menu-age').textContent=config.age?`${config.age} over${config.age===1?'':'s'}`:'New ball';
  $('menu-tempo').textContent=config.timeScale===1?'Real time':config.timeScale===.75?'¾ speed':'½ speed';
  $('menu-weather').textContent=optionText('weather',config.weather);
  $('menu-sound-button').textContent=config.audio?'Sound on':'Sound off';
  $('menu-sound-button').setAttribute('aria-pressed',String(!config.audio));
  $('menu-sound-button').setAttribute('aria-label',config.audio?'Mute sound':'Enable sound');
  $('menu-gesture').textContent=coarsePointer?'Touch to aim. Hold, then swipe.':'Move to aim. Hold, then swipe.';
}
function applyEnvironment(){view?.setEnvironment(config);audio.setWind(config.wind);audio.setSurface(config.pitch);$('scene-weather').textContent=optionText('weather',config.weather);$('scene-pitch').textContent=PITCHES[config.pitch].name;$('delivery-speed').textContent=Math.round(config.speed);$('delivery-style').textContent=`${config.arm==='left'?'Left':'Right'}-arm ${config.bowler==='fast'?'pace':BOWLERS[config.bowler].name.toLowerCase()}`;}
// One path for every setting change, whether it came from the drawer or a key.
function applySetting(key,value){
  config[key]=['auto','guide'].includes(key)?Boolean(value):['timeScale','speed','age','wind'].includes(key)?Number(value):value;
  if(key==='bowler')config.speed=BOWLERS[config.bowler].speed;
  if(key==='hand'&&(phase==='intro'||phase==='ready'))resetBatControl(batControl,config.hand);
  syncControls();savePreferences();
}
for(const key of ['bowler','arm','hand','length','line','weather','timeScale','swipe','speedSpread','speed','age','wind','auto','guide']){
  $(key).addEventListener(['speed','age','wind'].includes(key)?'input':'change',event=>applySetting(key,['auto','guide'].includes(key)?event.target.checked:event.target.value));
}
for(const button of document.querySelectorAll('[data-pitch]'))button.addEventListener('click',()=>applySetting('pitch',button.dataset.pitch));
function setReticle(){const r=$('reticle');r.classList.toggle('is-held',input.held);r.classList.toggle('is-defend',input.defend);}
function clearInput(){
  const pointerId=input.pointerId;input.pointerId=null;input.held=false;input.defend=false;
  releaseStroke(batControl,true);input.keys.clear();setReticle();
  if(pointerId!==null&&$('game').hasPointerCapture(pointerId))$('game').releasePointerCapture(pointerId);
}
function chooseIntent(intent){clearInput();setBatIntent(batControl,intent);for(const button of document.querySelectorAll('[data-intent]'))button.setAttribute('aria-pressed',String(button.dataset.intent===intent));}
for(const button of document.querySelectorAll('[data-intent]'))button.addEventListener('click',()=>{chooseIntent(button.dataset.intent);$('game').focus({preventScroll:true});});
function setStat(id,html){const el=$(id);if(el.innerHTML===html)return;el.innerHTML=html;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}
function updateStats(){setStat('stat-balls',String(ballsFaced));setStat('stat-control',ballsFaced?Math.round(controlCount/ballsFaced*100)+'%':'—');setStat('stat-clean',String(cleanCount));setStat('stat-exit',(lastExit===null?'—':Math.round(lastExit))+' <small>km/h</small>');viewport.dataset.balls=String(ballsFaced);}
function takeGuard(){
  $('intro').classList.add('hidden');viewport.classList.add('playing');closePanel();
  setPhase('ready');setState('Ready when you are');$('next-button').disabled=false;unlockAudio();$('game').focus({preventScroll:true});
}
function nextBall(){
  if(!ready||paused||phase==='runup'||phase==='flight'||(phase==='result'&&resultRealTime<.8))return;
  if(phase==='intro'){takeGuard();return;}
  phaseTime=0;delivery=null;deliveryConfig={...config};resultRealTime=0;resultCounted=false;ballSerial++;strideIndex=-1;contactFlash=0;
  if(batControl.hand!==(config.hand==='left'?-1:1))resetBatControl(batControl,config.hand);
  batControl.attempted=false;
  $('shot-feedback').classList.add('hidden');$('next-button').disabled=true;setPhase('runup');setState('Bowler approaching');clearInput();view.resetWicket();applyEnvironment();unlockAudio();$('game').focus({preventScroll:true});
}
function pause(force){
  if(phase==='intro'||!ready)return;paused=typeof force==='boolean'?force:!paused;clearInput();
  $('pause-overlay').classList.toggle('hidden',!paused);document.body.classList.toggle('paused',paused);$('pause-button').setAttribute('aria-label',paused?'Resume':'Pause');
  if(!paused)$('game').focus({preventScroll:true});
}
function onResult(event){
  if(resultCounted)return;resultCounted=true;ballsFaced++;delivery.result=event.result;
  if(isControlled(delivery,event.result))controlCount++;
  if(delivery.hit){lastExit=delivery.exitSpeed;if(delivery.contact.quality>.7&&!delivery.contact.edge)cleanCount++;}else lastExit=null;
  setPhase('result');resultRealTime=0;
  const bowled=event.result==='Bowled',title=delivery.hit?event.result:missTitle(delivery,event.result);
  const card=$('shot-feedback');card.dataset.outcome=title.toLowerCase();card.classList.remove('hidden');
  $('feedback-label').textContent='Delivery '+String(ballsFaced).padStart(2,'0')+' · '+Math.round(delivery.speed)+' km/h';$('feedback-title').textContent=title;
  const feedback=describeShot(delivery.stroke,delivery.contact,bowled);
  $('feedback-detail').textContent=feedback.detail;
  $('feedback-timing').textContent=feedback.timing;
  const played=delivery.hit||isPlayingShot(delivery.stroke);
  $('feedback-shot').textContent=played?delivery.stroke?.name||'Shot':'Leave';
  // Safe leaves never carry a "Missed by" label. A full miss gets its own
  // unclipped diagram, frozen at the ball's closest approach to the blade.
  const miss=!delivery.hit&&(played||bowled)?describeMiss(delivery.miss,deliveryConfig.hand==='left'?-1:1):null;
  $('feedback-exit-label').textContent=delivery.hit?'Exit speed':miss?'Closest gap':'Outcome';
  $('feedback-exit').textContent=delivery.hit?Math.round(delivery.exitSpeed)+' km/h':miss?miss.distance:bowled?'Bowled':played?'Missed':'Safe leave';
  const contact=$('contact-mark');contact.hidden=!delivery.hit;
  if(delivery.hit){contact.style.left=clamp(50+delivery.contact.x/.108*100,0,100)+'%';contact.style.top=clamp(50-delivery.contact.y/.62*100,0,100)+'%';}
  $('contact-map').classList.toggle('has-contact',delivery.hit);
  $('contact-map').classList.toggle('hidden',!delivery.hit);
  $('contact-review').classList.toggle('no-contact',!delivery.hit);
  $('contact-review').hidden=!delivery.hit&&!played&&!bowled;
  $('contact-map').setAttribute('aria-label',delivery.hit?`Bat contact: ${delivery.contact.edge?'edge':delivery.contact.quality>.7?'middle':'off centre'}.`:'No bat contact.');
  $('miss-review').hidden=!miss;
  if(miss){
    const diagram=missDiagram(delivery.miss);
    const point=p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    $('miss-blade').setAttribute('points',diagram.blade.map(point).join(' '));
    $('miss-handle').setAttribute('points',diagram.handle.map(point).join(' '));
    $('miss-gap').setAttribute('points',[diagram.nearest,diagram.ball].map(point).join(' '));
    $('miss-ball').setAttribute('cx',diagram.ball.x);$('miss-ball').setAttribute('cy',diagram.ball.y);$('miss-ball').setAttribute('r',diagram.radius);
    $('miss-direction').textContent=miss.direction;
    $('miss-distance').textContent=`${miss.distance} from the blade`;
    $('miss-map').setAttribute('aria-label',`Ball ${miss.direction} of the bat, ${miss.distance} from the blade at closest approach. ${miss.sentence}`);
  }
  if(bowled){view.hitWicket();sound('wicket');}
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
    const beforeZ=delivery.p.z;
    const events=stepDelivery(delivery,deliveryConfig,dt,bat,previous);
    if(events.some(event=>event.type==='contact')||!delivery.stroke&&beforeZ<CONTACT_Z&&delivery.p.z>=CONTACT_Z){
      delivery.stroke=strokeSnapshot(batControl);
      if(delivery.hit)delivery.stroke.progress=previous.progress+(bat.progress-previous.progress)*delivery.contact.t;
    }
    for(const event of events){
      if(event.type==='bounce'&&event.impactSpeed>.8)sound('bounce',event,event.impactSpeed/9);
      if(event.type==='contact'){contactFlash=.28;sound('contact',delivery.p,1,{quality:event.quality,edge:event.edge,exitSpeed:event.exitSpeed,defending:bat.defending});}
      if(event.type==='result')onResult(event);
      if(event.type==='net'&&delivery.time<2.5)sound('net',delivery.p,Math.hypot(delivery.v.x,delivery.v.y,delivery.v.z)/22);
    }
    if(delivery.time>3&&!resultCounted)onResult({result:delivery.hit?'Bat contact':'Missed'});
  }
}
const canvas=$('game');
function updatePointer(event){
  if(!canBat()||event.isPrimary===false||input.pointerId!==null&&event.pointerId!==input.pointerId)return;
  if(input.pointerId!==null&&event.pointerType==='mouse'&&!(event.buttons&(input.button===2?2:1))){finishPointer(event);return;}
  const r=canvas.getBoundingClientRect();const x=(event.clientX-r.left)/r.width*2-1,y=1-(event.clientY-r.top)/r.height*2;const p=view.pointerWorld(x,y);if(!p)return;
  const scale=1.6/Math.min(r.width,r.height);
  moveBatTarget(batControl,p.x,p.y,{x:(event.clientX-r.left)*scale,y:-(event.clientY-r.top)*scale});
}
function canBat(){return view&&ready&&!paused&&phase!=='intro'&&!openPanelName&&!$('help-dialog').open;}
canvas.addEventListener('pointermove',updatePointer);
canvas.addEventListener('pointerdown',event=>{
  if(!canBat()||event.isPrimary===false||input.pointerId!==null||![0,2].includes(event.button))return;
  event.preventDefault();canvas.focus({preventScroll:true});updatePointer(event);input.pointerId=event.pointerId;input.button=event.button;canvas.setPointerCapture(event.pointerId);unlockAudio();
  input.defend=event.button===2||batControl.intent==='defend';input.held=!input.defend;startStroke(batControl,input.defend);setReticle();
});
function finishPointer(event){if(event.pointerId!==input.pointerId)return;input.pointerId=null;input.defend=false;input.held=false;releaseStroke(batControl);setReticle();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}
canvas.addEventListener('pointerup',finishPointer);
canvas.addEventListener('lostpointercapture',event=>{if(event.pointerId===input.pointerId)clearInput();});
canvas.addEventListener('pointercancel',event=>{if(event.pointerId===input.pointerId)clearInput();});canvas.addEventListener('contextmenu',event=>event.preventDefault());

// ---------------------------------------------------------------- side panels: conditions and shortcuts
// Closing a panel on the title screen lands on Take guard, so Space then does what its label says.
const PANELS={setup:{buttons:['settings-button','menu-conditions-button']},shortcuts:{buttons:['shortcuts-button','menu-shortcuts-button']}};
let openPanelName=null,panelPausedGame=false;
function openPanel(name){
  if(openPanelName===name)return;
  if(openPanelName)closePanel(true);
  openPanelName=name;document.body.classList.add(name+'-open');
  for(const id of PANELS[name].buttons)$(id).setAttribute('aria-expanded','true');
  if(!panelPausedGame){panelPausedGame=!paused&&phase!=='intro';if(panelPausedGame)pause(true);}
  clearInput();$(name).querySelector('select,button,input')?.focus({preventScroll:true});
}
function closePanel(switching=false){
  if(!openPanelName)return;
  const name=openPanelName;openPanelName=null;document.body.classList.remove(name+'-open');
  for(const id of PANELS[name].buttons)$(id).setAttribute('aria-expanded','false');
  if(switching)return;
  if(panelPausedGame)pause(false);panelPausedGame=false;
  $(phase==='intro'?'start-button':'game').focus({preventScroll:true});
}
function togglePanel(name){if(openPanelName===name)closePanel();else openPanel(name);}
for(const id of ['settings-button','menu-conditions-button'])$(id).addEventListener('click',()=>togglePanel('setup'));
for(const id of ['shortcuts-button','menu-shortcuts-button'])$(id).addEventListener('click',()=>togglePanel('shortcuts'));
$('close-setup').addEventListener('click',()=>closePanel());$('close-shortcuts').addEventListener('click',()=>closePanel());$('drawer-scrim').addEventListener('click',()=>closePanel());

function renderShortcuts(){
  const list=$('shortcut-list');list.replaceChildren();
  for(const group of SHORTCUT_GROUPS){
    const section=document.createElement('section');section.className='shortcut-group';
    const heading=document.createElement('h3');heading.textContent=group;section.append(heading);
    for(const shortcut of SHORTCUTS.filter(s=>s.group===group)){
      const row=document.createElement('label');row.className='switch-row shortcut-row';row.htmlFor='shortcut-'+shortcut.id;
      const keys=document.createElement('span');keys.className='keys';
      for(const code of shortcut.keys){const kbd=document.createElement('kbd');kbd.textContent=keyLabel(code);keys.append(kbd);}
      const what=document.createElement('span');what.className='what';what.textContent=shortcut.label;
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='shortcut-'+shortcut.id;toggle.checked=!shortcutState.off.has(shortcut.id);
      toggle.addEventListener('change',()=>{setShortcutEnabled(shortcutState,shortcut.id,toggle.checked);row.classList.toggle('off',!toggle.checked);saveShortcuts();});
      const knob=document.createElement('span');knob.className='switch';
      row.classList.toggle('off',!toggle.checked);row.append(keys,what,toggle,knob);section.append(row);
    }
    list.append(section);
  }
  $('shortcuts-all').checked=shortcutState.all;document.body.classList.toggle('shortcuts-off',!shortcutState.all);
}
$('shortcuts-all').addEventListener('change',event=>{shortcutState.all=event.target.checked;document.body.classList.toggle('shortcuts-off',!shortcutState.all);saveShortcuts();});
$('reset-shortcuts').addEventListener('click',()=>{shortcutState=createShortcutState();renderShortcuts();saveShortcuts();});
renderShortcuts();

// ---------------------------------------------------------------- keyboard
const stepSetting=(key,delta,min,max,label,unit)=>{applySetting(key,clamp(config[key]+delta,min,max));notice(label,config[key]+' '+unit);};
const cycleSetting=(key,label)=>{applySetting(key,cycleValue([...$(key).options].map(option=>option.value),String(config[key])));notice(label,optionText(key,config[key]));};
const toggleSetting=(key,label)=>{applySetting(key,!config[key]);notice(label,config[key]?'On':'Off');};
const shortcutActions={
  bowl:()=>nextBall(),
  grounded:()=>{if(canBat())chooseIntent('grounded');},lofted:()=>{if(canBat())chooseIntent('lofted');},defend:()=>{if(canBat())chooseIntent('defend');},
  pause:()=>pause(),
  trimClear:()=>{resetBatTrim(batControl);if(phase!=='intro')notice('Fine adjustments cleared');},
  bowler:()=>{cycleSetting('bowler','Bowling');},arm:()=>cycleSetting('arm','Bowling arm'),hand:()=>cycleSetting('hand','Your stance'),
  speedDown:()=>stepSetting('speed',-5,BOWLERS[config.bowler].min,BOWLERS[config.bowler].max,'Release speed','km/h'),
  speedUp:()=>stepSetting('speed',5,BOWLERS[config.bowler].min,BOWLERS[config.bowler].max,'Release speed','km/h'),
  speedSpread:()=>cycleSetting('speedSpread','Pace variation'),
  length:()=>cycleSetting('length','Length'),line:()=>cycleSetting('line','Line'),
  pitch:()=>{applySetting('pitch',cycleValue(Object.keys(PITCHES),config.pitch));notice('Surface',PITCHES[config.pitch].name);},
  weather:()=>cycleSetting('weather','Sky & light'),
  windDown:()=>stepSetting('wind',-5,-25,25,'Crosswind','km/h'),windUp:()=>stepSetting('wind',5,-25,25,'Crosswind','km/h'),
  ageDown:()=>stepSetting('age',-10,0,80,'Ball age','overs'),ageUp:()=>stepSetting('age',10,0,80,'Ball age','overs'),
  timeScale:()=>cycleSetting('timeScale','Simulation speed'),swipe:()=>cycleSetting('swipe','Swipe length'),
  guide:()=>toggleSetting('guide','Bat guide & ball trail'),auto:()=>toggleSetting('auto','Continuous deliveries'),
  sound:()=>{toggleSound();notice('Sound',config.audio?'On':'Off');},fullscreen:()=>toggleFullscreen(),
  conditions:()=>togglePanel('setup'),shortcuts:()=>togglePanel('shortcuts'),help:()=>showHelp(),
};
document.addEventListener('keydown',event=>{
  if($('help-dialog').open)return;
  if(event.code==='Escape'&&openPanelName){closePanel();return;}
  // Typing into a control is never a shortcut; a focused button keeps only the keys that press it.
  const tag=document.activeElement?.tagName;
  if(['SELECT','INPUT','TEXTAREA'].includes(tag)&&event.code!=='Escape')return;
  if(tag==='BUTTON'&&['Space','Enter','NumpadEnter'].includes(event.code))return;
  const shortcut=matchShortcut(event,shortcutState);
  if(!shortcut)return;
  event.preventDefault();
  if(shortcut.held){input.keys.add(TRIM_KEYS[event.code]);return;}
  if(event.repeat&&!shortcut.repeat)return;
  shortcutActions[shortcut.id]?.();
});
document.addEventListener('keyup',event=>{input.keys.delete(TRIM_KEYS[event.code]);input.keys.delete(event.key.toLowerCase());});
window.addEventListener('blur',()=>{clearInput();if(phase!=='intro')pause(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase!=='intro')pause(true);});
$('start-button').addEventListener('click',nextBall);$('next-button').addEventListener('click',nextBall);$('pause-button').addEventListener('click',()=>pause());$('resume-button').addEventListener('click',()=>pause(false));
$('start-slow-button').addEventListener('click',()=>{if(!ready)return;config.timeScale=.5;config.line='middle';syncControls();savePreferences();nextBall();});
$('reset-session').addEventListener('click',()=>{phaseTime=0;delivery=null;ballsFaced=controlCount=cleanCount=ballSerial=0;lastExit=null;sessionSeconds=0;resultCounted=false;resultRealTime=0;contactFlash=0;clearInput();resetBatControl(batControl,config.hand);$('intro').classList.add('hidden');$('shot-feedback').classList.add('hidden');viewport.classList.add('playing');setPhase('ready');setState('Ready when you are');$('next-button').disabled=false;pause(false);closePanel();view?.resetWicket();applyEnvironment();updateStats();});
function toggleSound(){config.audio=!config.audio;audio.setEnabled(config.audio);if(config.audio)unlockAudio();syncControls();savePreferences();}
for(const id of ['sound-button','menu-sound-button'])$(id).addEventListener('click',toggleSound);
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{for(const id of ['fullscreen-button','menu-fullscreen-button'])$(id).title='Fullscreen is unavailable in this browser';}}
for(const id of ['fullscreen-button','menu-fullscreen-button'])$(id).addEventListener('click',toggleFullscreen);
document.addEventListener('fullscreenchange',()=>{const label=document.fullscreenElement?'Exit fullscreen':'Enter fullscreen';for(const id of ['fullscreen-button','menu-fullscreen-button'])$(id).setAttribute('aria-label',label);$('menu-fullscreen-button').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});
let helpWasPaused=false;
function showHelp(){if($('help-dialog').open)return;helpWasPaused=paused;pause(true);$('help-dialog').showModal();}
for(const id of ['help-button','menu-help-button'])$(id).addEventListener('click',showHelp);for(const id of ['close-help','help-done'])$(id).addEventListener('click',()=>$('help-dialog').close());$('help-dialog').addEventListener('close',()=>{if(!helpWasPaused)pause(false);if(phase==='intro')$('menu-help-button').focus({preventScroll:true});});
function showError(error){console.error(error);$('error-message').textContent='The 3D scene or its assets could not load. Check your connection and WebGL 2 support, then try again.';$('error-overlay').classList.remove('hidden');$('start-button').disabled=true;$('start-slow-button').disabled=true;$('next-button').disabled=true;ready=false;}
syncControls();updateStats();
$('start-button').disabled=true;$('start-slow-button').disabled=true;$('next-button').disabled=true;
try{
  $('asset-status').textContent='Preparing the nets…';
  const {createScene}=await import('./scene.js');view=await createScene(canvas,status=>{$('asset-status').textContent=status;});applyEnvironment();ready=true;$('start-button').disabled=false;$('start-slow-button').disabled=false;$('next-button').disabled=false;
  $('asset-status').textContent='Ready to play';
  function updateMenuFrame(){
    if(phase!=='intro'){view.setMenuFrame(null);return;}
    const ground=$('menu-ground').getBoundingClientRect(),frame=canvas.getBoundingClientRect();
    view.setMenuFrame({x:ground.left-frame.left,y:ground.top-frame.top,width:ground.width,height:ground.height});
  }
  new ResizeObserver(updateMenuFrame).observe($('menu-ground'));
  $('intro').addEventListener('scroll',updateMenuFrame,{passive:true});updateMenuFrame();
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();pause(true);$('error-message').textContent='The graphics connection was interrupted. Reload to return to the nets.';showError(new Error('WebGL context lost'));});
  // Read-only inspection hook for automated browser checks; it changes nothing.
  Object.defineProperty(window,'cricsim',{value:Object.freeze({get phase(){return phase;},get ball(){return delivery?{x:delivery.p.x,y:delivery.p.y,z:delivery.p.z,time:delivery.time,hit:delivery.hit}:null;},get stroke(){return {phase:batControl.phase,progress:batControl.progress,committed:batControl.committed};},project(p){return {...view.project(p)};}})});
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
    if(!paused)contactFlash=Math.max(0,contactFlash-delta);
    const point=view.project({x:target.x,y:target.y,z:CONTACT_Z}),rx=clamp(point.x,16,canvas.clientWidth-16),ry=clamp(point.y,16,canvas.clientHeight-16);reticle.style.left=rx+'px';reticle.style.top=ry+'px';reticle.classList.toggle('is-clipped',rx!==point.x||ry!==point.y);reticle.style.setProperty('--travel',bat.progress.toFixed(3));reticle.classList.toggle('is-contact',contactFlash>0);
    $('shot-name').textContent=shotName(batControl);
    $('swing-state').textContent=batControl.defending?'Hold the line':({guard:'Aim · hold · swipe',load:'Backlift · swipe through',swing:'Committed · through the ring',follow:'Follow-through',recover:'Returning to guard'}[batControl.phase]);
    $('stroke-meter').style.setProperty('--stroke',bat.progress.toFixed(3));
    $('bat-trim').textContent=`Face ${Math.round(batControl.trim.yaw*180/Math.PI)}° · Loft ${Math.round(batControl.trim.loft*180/Math.PI)}° · Roll ${Math.round(batControl.trim.roll*180/Math.PI)}°`;
    $('bat-trim').hidden=!Object.values(batControl.trim).some(value=>Math.abs(value)>.01);
    const minutes=Math.floor(sessionSeconds/60),seconds=Math.floor(sessionSeconds%60);$('session-time').textContent=String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
  }requestAnimationFrame(frame);
}catch(error){showError(error);}
