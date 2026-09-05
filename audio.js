// Short noise transients plus damped resonances: wood, turf and net impacts.
// Generated locally; no microphone, remote audio, or background network requests.
export class NetsAudio {
  constructor(){this.context=null;this.enabled=true;this.wind=0;}
  async unlock(){
    if(!this.enabled)return;
    try{
      if(!this.context){
        this.context=new(window.AudioContext||window.webkitAudioContext)();
        this.master=this.context.createGain();this.master.gain.value=.65;this.master.connect(this.context.destination);
        this.noise=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);
        const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        const wind=this.context.createBufferSource();wind.buffer=this.noise;wind.loop=true;
        const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=190;
        this.windGain=this.context.createGain();wind.connect(filter);filter.connect(this.windGain);this.windGain.connect(this.master);wind.start();this.setWind(this.wind);
      }
      if(this.context.state==='suspended')await this.context.resume();
    }catch{/* Audio is optional when the browser cannot provide it. */}
  }
  setEnabled(enabled){this.enabled=enabled;if(this.master)this.master.gain.setTargetAtTime(enabled?.65:0,this.context.currentTime,.025);}
  setWind(speed){this.wind=speed;if(this.windGain)this.windGain.gain.setTargetAtTime(.007+Math.abs(speed)*.0006,this.context.currentTime,.2);}
  play(kind,position={x:0,z:0},strength=1){
    if(!this.context||!this.enabled||kind==='release')return;
    const ctx=this.context,t=ctx.currentTime;
    const distance=Math.abs(position.z||0),level=Math.min(1.3,Math.max(.15,strength))/(1+distance*.10);
    const pan=ctx.createStereoPanner();pan.pan.value=Math.max(-.85,Math.min(.85,(position.x||0)/3));pan.connect(this.master);
    const source=ctx.createBufferSource();source.buffer=this.noise;
    const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=kind==='contact'?1650:kind==='wicket'?2200:kind==='net'?550:800;filter.Q.value=.65;
    const gain=ctx.createGain();const duration=kind==='net'?.12:kind==='wicket'?.11:.055;
    gain.gain.setValueAtTime(level*(kind==='contact'?.32:.17),t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(pan);source.start(t);source.stop(t+duration+.02);
    const modes=kind==='contact'?[185,435,920]:kind==='wicket'?[470,780,1190]:kind==='net'?[65]:[115];
    for(const [i,frequency] of modes.entries()){
      const osc=ctx.createOscillator(),g=ctx.createGain();osc.type='sine';osc.frequency.value=frequency;
      g.gain.setValueAtTime(level*.10/(i+1),t);g.gain.exponentialRampToValueAtTime(.0001,t+.025+i*.018);
      osc.connect(g);g.connect(pan);osc.start(t);osc.stop(t+.10);
    }
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();setTimeout(()=>pan.disconnect(),150);};
  }
}
