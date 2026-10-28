// One set of sound effects for local and online moves. Each mode controls
// whether it is enabled through its own saved preference.
export function createGameAudio(isEnabled){
  let audioContext;
  return function sound(kind='tap'){
    if(!isEnabled())return;
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      audioContext??=new Audio();
      if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
      const oscillator=audioContext.createOscillator(),volume=audioContext.createGain();
      oscillator.type=kind==='error'?'sawtooth':'sine';
      oscillator.frequency.value=kind==='success'?690:kind==='error'?140:480;
      volume.gain.setValueAtTime(.05,audioContext.currentTime);
      volume.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.14);
      oscillator.connect(volume).connect(audioContext.destination);
      oscillator.start();oscillator.stop(audioContext.currentTime+.15);
    }catch{/* Audio remains optional on unsupported or muted devices. */}
  };
}
