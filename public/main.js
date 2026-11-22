const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('#navigation');
const compact = matchMedia('(max-width: 700px)');

function setMenu(open) {
  menuButton.setAttribute('aria-expanded', String(open && compact.matches));
  menuButton.querySelector('span').textContent = open && compact.matches ? '−' : '+';
  menu.hidden = compact.matches && !open;
}

menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') === 'false'));
menu.addEventListener('click', (event) => {
  if (compact.matches && event.target.closest('a')) {
    const target = document.querySelector(event.target.hash);
    setMenu(false);
    target?.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: true });
  }
});
document.querySelector('.site-header').addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menuButton.focus();
  }
});
function syncMenu() {
  menuButton.hidden = !compact.matches;
  setMenu(false);
}
compact.addEventListener('change', syncMenu);
syncMenu();

if ('IntersectionObserver' in window) {
  const reveals = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      reveals.unobserve(entry.target);
    }
  }, { threshold: 0.09 });
  document.documentElement.classList.add('reveal-ready');
  document.querySelectorAll('.reveal').forEach((element) => reveals.observe(element));
}

function fitCanvas(canvas, context) {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height };
}

const hero = document.querySelector('.hero');
const ambient = document.querySelector('#ambient');
const dust = ambient.getContext('2d');
const contactReadout = document.querySelector('#contact-readout');
const finePointer = matchMedia('(pointer: fine)');
const particles = Array.from({ length: 45 }, () => ({
  x: Math.random(),
  y: Math.random(),
  speed: 3 + Math.random() * 10,
  size: .45 + Math.random() * 1.25,
  phase: Math.random() * Math.PI * 2
}));
let ambientSize;
let heroVisible = true;
let ambientFrame = 0;

function drawDust(time) {
  ambientFrame = 0;
  if (!heroVisible || reducedMotion.matches || document.hidden || !ambientSize) return;

  const { width, height } = ambientSize;
  dust.clearRect(0, 0, width, height);
  dust.fillStyle = '#dbffa2';
  const seconds = time / 1000;
  for (const particle of particles) {
    const x = (particle.x * width + seconds * particle.speed * .45) % width;
    const y = height - ((particle.y * height + seconds * particle.speed) % height);
    dust.globalAlpha = .13 + .24 * (1 + Math.sin(seconds + particle.phase)) / 2;
    dust.fillRect(x, y, particle.size, particle.size);
  }
  ambientFrame = requestAnimationFrame(drawDust);
}

function refreshDust() {
  if (ambientFrame) cancelAnimationFrame(ambientFrame);
  ambientFrame = 0;
  if (reducedMotion.matches && ambientSize) dust.clearRect(0, 0, ambientSize.width, ambientSize.height);
  if (heroVisible && !reducedMotion.matches && !document.hidden) ambientFrame = requestAnimationFrame(drawDust);
}

function resetParallax() {
  hero.style.removeProperty('--art-x');
  hero.style.removeProperty('--art-y');
}
hero.addEventListener('pointermove', (event) => {
  if (reducedMotion.matches || !finePointer.matches) return;
  const bounds = hero.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  hero.style.setProperty('--art-x', `${x * 15}px`);
  hero.style.setProperty('--art-y', `${y * 11}px`);
});
hero.addEventListener('pointerleave', resetParallax);
reducedMotion.addEventListener('change', resetParallax);

if (dust) {
  new ResizeObserver(() => {
    ambientSize = fitCanvas(ambient, dust);
    refreshDust();
  }).observe(ambient);
  if ('IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      refreshDust();
    });
    heroObserver.observe(hero);
  }
  reducedMotion.addEventListener('change', refreshDust);
  document.addEventListener('visibilitychange', refreshDust);
}

const radar = document.querySelector('#radar');
const radarInk = radar.getContext('2d');
const pingButton = document.querySelector('#ping');
const sound = document.querySelector('#pulse-audio');
const counter = document.querySelector('#scan-count');
const scanStatus = document.querySelector('#scan-status');
const pulseDuration = 2150;
const range = 312;
const origin = [0, 40];
const corridors = [
  [[-204, -104], [-133, -104], [-133, -53], [-84, -53], [-84, -135], [68, -135], [68, -83], [131, -83], [131, -118], [204, -118], [204, -36], [145, -36], [145, 5], [199, 5], [199, 94], [137, 94], [137, 134], [39, 134], [39, 100], [-39, 100], [-39, 134], [-147, 134], [-147, 96], [-204, 96], [-204, 25], [-143, 25], [-143, -17], [-204, -17], [-204, -104]],
  [[-74, -16], [-42, -16], [-42, -91], [22, -91], [22, -49], [78, -49], [78, -18], [128, -18]],
  [[-105, 18], [-75, 18], [-75, 69], [-44, 69], [-44, 84]],
  [[47, 70], [47, 36], [106, 36], [106, 72], [149, 72]],
  [[-164, 58], [-129, 58], [-129, 107], [-92, 107]],
  [[-12, -52], [-12, -22], [22, -22], [22, 5]],
  [[161, 25], [172, 25], [172, 52]],
  [[111, -60], [173, -60], [173, -94]]
];
const signatures = [
  [[-112, -79], [155, 54]],
  [[29, -109], [-161, 72]],
  [[158, -81], [79, 106]],
  [[-80, 88], [108, -28]]
];

let radarSize;
let pulseCount = 0;
let pulseStarted = 0;
let audioContext;

function drawRadar(progress = 0, reveal = false, staticEcho = false) {
  if (!radarSize) return;
  const { width, height } = radarSize;
  const ctx = radarInk;
  const scale = Math.min(width / 485, height / 330);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = 1;

  function trace(points, color, lineWidth = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  }

  function circle(x, y, radius, color, lineWidth = 1) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  const xEdge = width / (2 * scale);
  const yEdge = height / (2 * scale);
  for (let x = -Math.floor(xEdge / 22) * 22; x < xEdge; x += 22) {
    trace([[x, -yEdge], [x, yEdge]], '#a5d87b12');
  }
  for (let y = -Math.floor(yEdge / 22) * 22; y < yEdge; y += 22) {
    trace([[-xEdge, y], [xEdge, y]], '#a5d87b12');
  }

  for (const radius of [30, 57, 95, 135]) circle(...origin, radius, '#a5d87b2b');
  const [ox, oy] = origin;
  trace([[-xEdge, oy], [xEdge, oy]], '#a5d87b23');
  trace([[ox, -yEdge], [ox, yEdge]], '#a5d87b23');
  for (const corridor of corridors) trace(corridor, '#9be2772a', 1.25);

  if (reveal) {
    const radius = staticEcho ? range : Math.max(.1, progress * range);
    const intensity = staticEcho ? .95 : Math.max(.07, 1 - Math.pow(progress, 5));
    ctx.save();
    ctx.beginPath();
    ctx.arc(ox, oy, radius, 0, Math.PI * 2);
    ctx.clip();
    const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
    glow.addColorStop(0, 'rgba(146, 225, 81, 0)');
    glow.addColorStop(.72, `rgba(146, 225, 81, ${intensity * .05})`);
    glow.addColorStop(1, `rgba(146, 225, 81, ${intensity * .18})`);
    ctx.fillStyle = glow;
    ctx.fillRect(-xEdge, -yEdge, width / scale, height / scale);
    const signalColor = `rgba(180, 246, 119, ${intensity * .85})`;
    for (const corridor of corridors) trace(corridor, signalColor, 2);
    for (const [x, y] of signatures[(pulseCount - 1) % signatures.length]) {
      const size = 4;
      trace([[x - size, y], [x, y - size], [x + size, y], [x, y + size], [x - size, y]], '#e2ffa9', 1.5);
      circle(x, y, 10, signalColor);
    }
    ctx.restore();
    if (!staticEcho) circle(ox, oy, radius, signalColor, 2);
  }

  trace([[-9, oy], [9, oy]], '#ddffa0', 2);
  trace([[0, oy - 9], [0, oy + 9]], '#ddffa0', 2);
  circle(ox, oy, 13, '#c0f67c5a');

  ctx.font = '11px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#93b582';
  ctx.fillText('CLICK ORIGIN', 21, oy + 17);
  ctx.restore();
}

async function playPulse() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audioContext ??= new Audio();
    await audioContext.resume();
    const start = audioContext.currentTime;
    for (const { delay, vol, from, to } of [
      { delay: 0, vol: .15, from: 560, to: 175 },
      { delay: .18, vol: .06, from: 320, to: 120 },
      { delay: .36, vol: .032, from: 215, to: 85 }
    ]) {
      const at = start + delay;
      const voice = audioContext.createOscillator();
      const level = audioContext.createGain();
      voice.type = 'sine';
      voice.frequency.setValueAtTime(from, at);
      voice.frequency.exponentialRampToValueAtTime(to, at + .14);
      level.gain.setValueAtTime(.0001, at);
      level.gain.exponentialRampToValueAtTime(vol, at + .012);
      level.gain.exponentialRampToValueAtTime(.0001, at + .19);
      voice.connect(level).connect(audioContext.destination);
      voice.start(at);
      voice.stop(at + .20);
    }
  } catch {
    sound.checked = false;
  }
}

function finishPulse() {
  pulseStarted = 0;
  pingButton.removeAttribute('aria-disabled');
  scanStatus.textContent = 'Echo returned · 2 movement signatures';
  contactReadout.textContent = 'TWO RETURNS LOGGED';
}

function animatePulse(now) {
  if (reducedMotion.matches) {
    drawRadar(1, true, true);
    finishPulse();
    return;
  }
  const progress = Math.min(1, (now - pulseStarted) / pulseDuration);
  drawRadar(progress, progress < 1);
  if (progress < 1) requestAnimationFrame(animatePulse);
  else finishPulse();
}

if (radarInk) {
  new ResizeObserver(() => {
    radarSize = fitCanvas(radar, radarInk);
    drawRadar(1, reducedMotion.matches && pulseCount > 0, true);
  }).observe(radar);
  reducedMotion.addEventListener('change', () => {
    if (!pulseStarted) drawRadar(1, reducedMotion.matches && pulseCount > 0, true);
  });

  pingButton.disabled = false;
  sound.disabled = !(window.AudioContext || window.webkitAudioContext);
  pingButton.addEventListener('click', () => {
    if (pulseStarted) return;

    if (sound.checked) void playPulse();
    pulseCount += 1;
    counter.textContent = `PULSE ${String(pulseCount).padStart(2, '0')}`;
    if (reducedMotion.matches) {
      drawRadar(1, true, true);
      finishPulse();
      return;
    }

    scanStatus.textContent = 'Pulse outgoing…';
    pingButton.setAttribute('aria-disabled', 'true');
    pulseStarted = performance.now();
    requestAnimationFrame(animatePulse);
  });
}
