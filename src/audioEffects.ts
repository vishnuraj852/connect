export class ToneGenerator {
  private ctx: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private gainNode: GainNode | null = null;
  private interval: any = null;
  
  private init() {
    if (!this.ctx) {
       this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  // Caller side: North American ringback (440 + 480 hz, 2s on, 4s off)
  startDialTone() {
    this.stop();
    this.init();
    if (!this.ctx) return () => {};

    // Browser might need us to resume the blocked context
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const playTone = () => {
        this.gainNode = this.ctx!.createGain();
        this.gainNode.connect(this.ctx!.destination);
        this.gainNode.gain.value = 0.1; 

        const osc1 = this.ctx!.createOscillator();
        const osc2 = this.ctx!.createOscillator();
        osc1.frequency.value = 440;
        osc2.frequency.value = 480;
        
        osc1.connect(this.gainNode);
        osc2.connect(this.gainNode);
        
        osc1.start();
        osc2.start();
        this.oscillators.push(osc1, osc2);

        // Turn off after 2 seconds safely
        try {
          this.gainNode.gain.setTargetAtTime(0, this.ctx!.currentTime + 2, 0.1);
        } catch(e) {}
        
        setTimeout(() => {
            try { osc1.stop(); osc2.stop(); } catch(e){}
        }, 2500);
    };

    playTone();
    this.interval = setInterval(playTone, 6000);

    return () => this.stop();
  }

  // Receiver side: Electronic double ring
  startRingTone() {
    this.stop();
    // BYPASS: Explicitly skipping AudioContext instantiation for Receiver.
    // iOS/WebKit permanently locks the HTML5 Media bus to null sink if an AudioContext
    // initializes before WebRTC's getUserMedia! This prevents the Receiver from hearing audio over <video>.
    return () => this.stop();
  }

  stop() {
     if (this.interval) clearInterval(this.interval);
     this.interval = null;
     this.oscillators.forEach(o => {
         try { o.stop(); } catch(e) {}
     });
     this.oscillators = [];
     if (this.gainNode && this.ctx) {
         try { this.gainNode.disconnect(); } catch(e){}
     }
     
     if (this.ctx) {
         try { 
             this.ctx.close(); // Violently destroy hardware lock instead of just pausing it
             this.ctx = null;
         } catch(e) {}
     }
  }

  playMessageNotification() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    try {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
      
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch(e) {}
  }
}

export const toneGenerator = new ToneGenerator();
