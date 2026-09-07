// Procedural nets audio. Every sound is synthesised on the fly from a shared noise
// buffer plus damped sine modes: willow on leather, leather on turf, the stump
// clatter, the net, the bowler's run-up and a quiet outdoor bed.
// No recordings, microphone access or network requests.
const SURFACES = { hard: { tone: 620, decay: .045 }, green: { tone: 520, decay: .05 }, dry: { tone: 700, decay: .04 }, soft: { tone: 300, decay: .07 } };
export class NetsAudio {
  constructor(){this.context=null;this.enabled=true;this.wind=0;this.surface='hard';this.nextBird=0;}
  async unlock(){
    if(!this.enabled)return;
    try{
      if(!this.context){
        const ctx=this.context=new(window.AudioContext||window.webkitAudioContext)();
        this.master=ctx.createGain();this.master.gain.value=.7;
        // A gentle compressor keeps a full-blooded drive from clipping while quiet
        // cues (footsteps, wind) stay audible.
        this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-14;this.limiter.knee.value=12;this.limiter.ratio.value=6;this.limiter.attack.value=.002;this.limiter.release.value=.12;
        this.master.connect(this.limiter);this.limiter.connect(ctx.destination);
        this.noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
        const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        this.startAmbience();
      }
      if(this.context.state==='suspended')await this.context.resume();
    }catch{/* Audio is optional when the browser cannot provide it. */}
  }
  startAmbience(){
    const ctx=this.context;
    // Low wind bed.
    const wind=ctx.createBufferSource();wind.buffer=this.noise;wind.loop=true;
    const windFilter=ctx.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=180;
    this.windGain=ctx.createGain();wind.connect(windFilter);windFilter.connect(this.windGain);this.windGain.connect(this.master);wind.start();
    // Leaves: a high, slowly breathing hiss that grows with the crosswind.
    const leaves=ctx.createBufferSource();leaves.buffer=this.noise;leaves.loop=true;
    const leafFilter=ctx.createBiquadFilter();leafFilter.type='bandpass';leafFilter.frequency.value=3200;leafFilter.Q.value=.5;
    this.leafGain=ctx.createGain();const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=.11;const lfoDepth=ctx.createGain();lfoDepth.gain.value=.5;
    const lfoBase=ctx.createConstantSource();lfoBase.offset.value=1;const leafLevel=ctx.createGain();leafLevel.gain.value=0;
    lfo.connect(lfoDepth);lfoDepth.connect(leafLevel.gain);lfoBase.connect(leafLevel.gain);
    leaves.connect(leafFilter);leafFilter.connect(leafLevel);leafLevel.connect(this.leafGain);this.leafGain.connect(this.master);
    leaves.start();lfo.start();lfoBase.start();
    this.setWind(this.wind);
    this.nextBird=ctx.currentTime+4+Math.random()*6;
    this.birdTimer=setInterval(()=>this.birdsong(),1500);
  }
  birdsong(){
    const ctx=this.context;if(!ctx||!this.enabled||ctx.state!=='running'||ctx.currentTime<this.nextBird)return;
    this.nextBird=ctx.currentTime+9+Math.random()*16;
    const pan=ctx.createStereoPanner();pan.pan.value=(Math.random()*2-1)*.8;pan.connect(this.master);
    const base=2400+Math.random()*900,notes=2+Math.floor(Math.random()*3);let t=ctx.currentTime+.05;
    for(let i=0;i<notes;i++){
      const osc=ctx.createOscillator(),g=ctx.createGain();osc.type='sine';
      osc.frequency.setValueAtTime(base*(1+Math.random()*.12),t);osc.frequency.exponentialRampToValueAtTime(base*(1.25+Math.random()*.2),t+.06);osc.frequency.exponentialRampToValueAtTime(base*.95,t+.13);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.018,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.14);
      osc.connect(g);g.connect(pan);osc.start(t);osc.stop(t+.16);t+=.17+Math.random()*.09;
    }
    setTimeout(()=>pan.disconnect(),1500);
  }
  setEnabled(enabled){this.enabled=enabled;if(this.master)this.master.gain.setTargetAtTime(enabled?.7:0,this.context.currentTime,.025);}
  setWind(speed){this.wind=speed;if(!this.context)return;const t=this.context.currentTime,w=Math.abs(speed);this.windGain.gain.setTargetAtTime(.006+w*.0007,t,.3);this.leafGain.gain.setTargetAtTime(.0025+w*.00045,t,.3);}
  setSurface(kind){this.surface=SURFACES[kind]?kind:'hard';}
  // Shared building blocks -------------------------------------------------
  channel(position,distanceFalloff=.10){
    const ctx=this.context,pan=ctx.createStereoPanner();
    pan.pan.value=Math.max(-.85,Math.min(.85,(position.x||0)/3.2));pan.connect(this.master);
    const distance=Math.abs(position.z||0);
    return {pan,level:1/(1+distance*distanceFalloff),done:duration=>setTimeout(()=>pan.disconnect(),duration*1000+300)};
  }
  burst(out,t,{type='bandpass',frequency=800,q=.8,gain=.2,attack=.001,decay=.05,detune=0}){
    const ctx=this.context,source=ctx.createBufferSource();source.buffer=this.noise;source.loopStart=Math.random()*1.5;source.loopEnd=source.loopStart+.4;source.loop=true;
    const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;filter.detune.value=detune;
    const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+attack+decay);
    source.connect(filter);filter.connect(g);g.connect(out);source.start(t,source.loopStart);source.stop(t+attack+decay+.02);
    source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};
  }
  mode(out,t,frequency,gain,decay,type='sine'){
    const ctx=this.context,osc=ctx.createOscillator(),g=ctx.createGain();osc.type=type;osc.frequency.value=frequency;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.0015);g.gain.exponentialRampToValueAtTime(.0001,t+decay);
    osc.connect(g);g.connect(out);osc.start(t);osc.stop(t+decay+.02);
    osc.onended=()=>{osc.disconnect();g.disconnect();};
  }
  // Public cues ------------------------------------------------------------
  // kind: contact | bounce | wicket | net | step. detail: { quality, edge, exitSpeed, defending, impactSpeed }
  play(kind,position={x:0,z:0},strength=1,detail={}){
    if(!this.context||!this.enabled||this.context.state!=='running')return;
    const ctx=this.context,t=ctx.currentTime+.002;
    try{
      if(kind==='contact')this.contact(position,strength,detail,t);
      else if(kind==='bounce')this.bounce(position,strength,t);
      else if(kind==='wicket')this.wicket(position,t);
      else if(kind==='net')this.net(position,strength,t);
      else if(kind==='step')this.step(position,strength,t);
    }catch{/* A failed cue never interrupts play. */}
  }
  contact(position,strength,{quality=.6,edge=false,exitSpeed=60,defending=false},t){
    const {pan,level,done}=this.channel(position,.04);
    const power=Math.min(1.35,Math.max(.25,exitSpeed/95))*level;
    const pitch=1+(Math.random()-.5)*.08;
    if(defending){
      // Soft hands: a short, dull knock with almost no ring.
      this.burst(pan,t,{type:'lowpass',frequency:900*pitch,q:.7,gain:.24*power,decay:.03});
      this.mode(pan,t,150*pitch,.09*power,.06);this.mode(pan,t,310*pitch,.05*power,.045);
    }else if(edge){
      // Outside edge: thin, bright click with a weak body.
      this.burst(pan,t,{type:'bandpass',frequency:2600*pitch,q:1.4,gain:.30*power,decay:.018});
      this.burst(pan,t,{type:'highpass',frequency:3800,q:.7,gain:.12*power,decay:.012});
      this.mode(pan,t,1450*pitch,.07*power,.05);this.mode(pan,t,2210*pitch,.05*power,.035);this.mode(pan,t,520*pitch,.03*power,.04);
    }else{
      // Middle of the blade: crisp transient plus a deep willow body that rings longer
      // the cleaner the strike.
      const ring=.06+quality*.11;
      this.burst(pan,t,{type:'bandpass',frequency:1500*pitch,q:.9,gain:.34*power,decay:.022});
      this.burst(pan,t,{type:'lowpass',frequency:2200,q:.5,gain:.18*power,decay:.035});
      this.mode(pan,t,128*pitch,.16*power*quality,ring*1.3);
      this.mode(pan,t,256*pitch,.10*power,ring);
      this.mode(pan,t,515*pitch,.07*power,ring*.8);
      this.mode(pan,t,890*pitch,.035*power,ring*.6,'triangle');
    }
    // A faint return off the side netting and sight screen.
    const echo=ctx=>{const g=this.context.createGain();g.gain.value=.16;const lp=this.context.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1100;g.connect(lp);lp.connect(pan);return g;};
    const back=echo();this.burst(back,t+.085,{type:'bandpass',frequency:900,q:.6,gain:.26*power,decay:.05});this.mode(back,t+.085,128*pitch,.10*power,.09);
    setTimeout(()=>back.disconnect(),700);
    done(.6);
  }
  bounce(position,strength,t){
    const {pan,level,done}=this.channel(position);
    const surface=SURFACES[this.surface],power=Math.min(1.2,Math.max(.12,strength))*level;
    this.burst(pan,t,{type:'lowpass',frequency:surface.tone,q:.6,gain:.22*power,decay:surface.decay});
    this.mode(pan,t,95+Math.random()*20,.07*power,surface.decay*1.4);
    done(.3);
  }
  wicket(position,t){
    const {pan,done}=this.channel({x:0,z:1.2},.02);
    // Ball into stump: a hard knock; then the stumps and bails clatter apart.
    this.burst(pan,t,{type:'bandpass',frequency:1900,q:1.2,gain:.34,decay:.03});
    for(const [f,g,d] of [[560,.14,.11],[840,.11,.09],[1260,.08,.07],[2100,.05,.05]])this.mode(pan,t,f,g,d);
    let k=t+.06;
    for(let i=0;i<5;i++){const a=.14*(1-i*.15);this.burst(pan,k,{type:'bandpass',frequency:2600+Math.random()*1400,q:2,gain:a,decay:.016});this.mode(pan,k,1500+Math.random()*900,a*.5,.03);k+=.045+Math.random()*.05;}
    for(let i=0;i<3;i++){const a=.11-i*.03;this.burst(pan,t+.16+i*.13,{type:'lowpass',frequency:520,q:.6,gain:a,decay:.045});}
    done(.9);
  }
  net(position,strength,t){
    const {pan,level,done}=this.channel(position,.05);
    const power=Math.min(1,Math.max(.2,strength))*level;
    this.burst(pan,t,{type:'bandpass',frequency:640,q:.7,gain:.13*power,attack:.012,decay:.16});
    this.burst(pan,t,{type:'lowpass',frequency:140,q:.5,gain:.10*power,attack:.004,decay:.08});
    this.burst(pan,t+.05,{type:'highpass',frequency:2400,q:.5,gain:.03*power,attack:.02,decay:.2});
    done(.5);
  }
  step(position,strength,t){
    const {pan,level,done}=this.channel(position,.14);
    const power=Math.min(1,Math.max(.2,strength))*level;
    this.burst(pan,t,{type:'lowpass',frequency:160+Math.random()*60,q:.6,gain:.11*power,attack:.003,decay:.045});
    this.burst(pan,t,{type:'bandpass',frequency:900,q:.7,gain:.02*power,decay:.02});
    done(.2);
  }
}
