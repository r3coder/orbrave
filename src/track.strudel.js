// ┌───────────────────────────────────────────────┐
// │  NIGHT SHIFT // 136 BPM acid techno in C minor │
// │  32-cycle arrangement:                         │
// │   0-3 intro · 4-7 acid in · 8-15 full          │
// │   16-19 breakdown + riser · 20-31 drop         │
// └───────────────────────────────────────────────┘
setcpm(136/4)

// KICK — four on the floor, out during the breakdown
$: s("TR909_bd:0*4").gain(.55).lpf(4000)
  .mask("<1!16 0!4 1!12>")

// CLAP — backbeat with a ghost hit
$: s("~ cp ~ [cp <~ cp>]").bank("TR909").gain(.38).room(.25)
  .mask("<0!8 1!8 0!4 1!12>")

// HATS — 16ths, breathing velocity, panned
$: s("hh*16").bank("TR909").gain(perlin.range(.3,.6)).hpf(4500)
  .pan(sine.range(.3,.7).slow(4))
$: s("~ oh ~ oh ~ oh ~ oh").bank("TR909").gain(.2).hpf(4000)
  .mask("<0!4 1!12 0!4 1!12>")

// ACID BASS — squelchy saw, resonant filter sweep
$: note("<[c2 c2 c3 c2 eb2 c2 [g1 c3] c2] [c2 c2 c3 bb1 c2 g2 [eb2 c3] c2]>")
  .s("sawtooth")
  .lpf(sine.range(300,3200).slow(8)).lpq(14)
  .lpenv(3).lpd(.12)
  .decay(.18).sustain(.15).shape(.35)
  .gain(.3)
  .mask("<0!4 1!12 0!4 1!12>")

// PADS — wide supersaw chords
$: chord("<Cm9 Ab^7 Eb^7 Bb7>").voicing()
  .s("supersaw").attack(.4).release(1.2)
  .lpf(1400).room(.8).roomsize(6)
  .gain(.12)
  .mask("<0!8 1!24>")

// ARP LEAD — ping-pong delay, enters after the breakdown
$: n("0 [2 4] <7 9> 4 ~ 2 <11 14> 7")
  .scale("C4:minor")
  .s("square").lpf(2600).decay(.12).sustain(0)
  .delay(.45).delaytime(.33).delayfeedback(.55)
  .jux(rev).gain(.16)
  .mask("<0!16 1!16>")

// RISER — white noise sweep into the drop
$: s("white*16").decay(.08).sustain(0)
  .gain(saw.range(.03,.25)).hpf(saw.range(400,9000))
  .mask("<0!19 1 0!12>")
