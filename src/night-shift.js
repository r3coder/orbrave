import { initStrudel, evaluate, hush, samples, getAudioContext, getSuperdoughAudioController } from '@strudel/web';
import track from './track.strudel.js?raw';
import { loadDrums } from './samples.js';

const $ = (id) => document.getElementById(id);
const code = $('code');
const status = $('status');
code.value = track;

const ready = initStrudel({
  prebake: loadDrums,
});
ready.then(() => (status.textContent = 'ready'));

// Tap the master bus once audio is running: analyser for the scope, stream for the recorder
let analyser, streamDest;
function tapOutput() {
  if (analyser) return;
  const ac = getAudioContext();
  const master = getSuperdoughAudioController().output.destinationGain;
  analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  streamDest = ac.createMediaStreamDestination();
  master.connect(analyser);
  master.connect(streamDest);
  drawScope();
}

async function play() {
  await ready;
  status.textContent = 'evaluating…';
  try {
    await evaluate(code.value);
    tapOutput();
    status.textContent = 'playing';
  } catch (e) {
    status.textContent = 'error: ' + e.message;
    console.error(e);
  }
}

function stop() {
  hush();
  status.textContent = 'stopped';
}

let recorder, chunks = [];
function toggleRecord() {
  const btn = $('rec');
  if (recorder?.state === 'recording') {
    recorder.stop();
    return;
  }
  if (!streamDest) {
    status.textContent = 'press play first';
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(streamDest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 });
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    btn.classList.remove('on');
    btn.textContent = '● record';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'audio/webm' }));
    a.download = `night-shift-${Date.now()}.webm`;
    a.click();
  };
  recorder.start();
  btn.classList.add('on');
  btn.textContent = '■ stop rec';
}

function drawScope() {
  const cv = $('scope');
  const ctx = cv.getContext('2d');
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const wave = new Uint8Array(analyser.fftSize);
  (function frame() {
    cv.width = cv.clientWidth * devicePixelRatio;
    cv.height = cv.clientHeight * devicePixelRatio;
    const { width: w, height: h } = cv;
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);
    ctx.clearRect(0, 0, w, h);
    const bars = 96;
    for (let i = 0; i < bars; i++) {
      // log-spaced bins so the low end gets room
      const v = freq[Math.floor(Math.pow(i / bars, 2) * freq.length * 0.6)] / 255;
      ctx.fillStyle = `hsla(${150 - v * 120}, 100%, 55%, ${0.25 + v * 0.6})`;
      ctx.fillRect((i * w) / bars, h - v * h, w / bars - 2, v * h);
    }
    ctx.strokeStyle = '#d8ffe9';
    ctx.lineWidth = devicePixelRatio;
    ctx.beginPath();
    for (let i = 0; i < wave.length; i++) {
      const x = (i / wave.length) * w;
      const y = (wave[i] / 255) * h;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    requestAnimationFrame(frame);
  })();
}

$('play').onclick = play;
$('stop').onclick = stop;
$('rec').onclick = toggleRecord;
code.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); play(); }
  if (e.ctrlKey && e.key === '.') { e.preventDefault(); stop(); }
  if (e.key === 'Tab') { e.preventDefault(); code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end'); }
});
