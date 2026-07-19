const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const mapCanvas = document.querySelector('#map-canvas');
const mapCtx = mapCanvas.getContext('2d');

const ui = {
  title: document.querySelector('#title-screen'),
  pause: document.querySelector('#pause-screen'),
  memory: document.querySelector('#memory-screen'),
  act: document.querySelector('#act-screen'),
  choice: document.querySelector('#choice-screen'),
  ending: document.querySelector('#ending-screen'),
  hud: document.querySelector('#hud'),
  map: document.querySelector('#map-panel'),
  objective: document.querySelector('#objective-text'),
  hint: document.querySelector('#interaction-hint'),
  hintText: document.querySelector('#interaction-text'),
  subtitles: document.querySelector('#subtitles'),
  flashlight: document.querySelector('#flashlight-indicator'),
  cycle: document.querySelector('#cycle-label'),
  oxygen: document.querySelector('#oxygen-meter'),
  memoryKicker: document.querySelector('#memory-kicker'),
  memoryTitle: document.querySelector('#memory-title'),
  memoryBody: document.querySelector('#memory-body'),
  actNumber: document.querySelector('#act-number'),
  actTitle: document.querySelector('#act-title'),
  actQuote: document.querySelector('#act-quote'),
  endingKicker: document.querySelector('#ending-kicker'),
  endingTitle: document.querySelector('#ending-title'),
  endingBody: document.querySelector('#ending-body')
};

const TAU = Math.PI * 2;
const FOV = Math.PI / 3;
const MAP_W = 30;
const MAP_H = 24;
const PLAYER_RADIUS = 0.22;
const MAX_RAY_DISTANCE = 34;
const RAY_STEP = 2;

const keys = new Set();
let lastTime = performance.now();
let worldTime = 0;
let bob = 0;
let footstepCooldown = 0;
let cycleSeconds = 0;
let interactTarget = null;
let resizeTimer = 0;
let subtitleTimer = 0;
let contactPulse = 0;
let flashPulse = 0;
let mapData = [];
let zBuffer = [];

const game = {
  mode: 'menu',
  act: 1,
  flashlight: true,
  mapOpen: false,
  courtComplete: false,
  completed: new Set(),
  player: { x: 4.8, y: 5.2, angle: 0.1 },
  stats: { lookedAt: 0, quietSeconds: 0, contacts: 0 },
  loopMemory: localStorage.getItem('u7-loop') === '1'
};

function buildMap() {
  const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(1));
  const carve = (x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y += 1) for (let x = x1; x <= x2; x += 1) grid[y][x] = 0;
  };
  const wall = (x1, y1, x2, y2, type = 1) => {
    for (let y = y1; y <= y2; y += 1) for (let x = x1; x <= x2; x += 1) grid[y][x] = type;
  };

  // Главные помещения.
  carve(2, 2, 7, 7);      // центр управления
  carve(10, 2, 16, 7);    // столовая
  carve(20, 2, 26, 7);    // медпункт
  carve(2, 13, 10, 20);   // жилой блок
  carve(13, 13, 20, 20);  // технический отсек
  carve(23, 13, 27, 20);  // антенна

  // Центральная магистраль.
  carve(3, 9, 26, 11);
  carve(4, 7, 5, 13);
  carve(12, 7, 13, 9);
  carve(23, 7, 24, 13);
  carve(7, 9, 10, 10);
  carve(16, 9, 20, 10);

  // Перегородки жилого блока.
  wall(6, 13, 6, 17);
  wall(6, 19, 6, 20);
  wall(2, 17, 4, 17);
  wall(8, 17, 10, 17);
  grid[15][6] = 0;
  grid[18][6] = 0;
  grid[17][5] = 0;
  grid[17][7] = 0;

  // Герметичные двери: Б-3 открывается во втором акте, антенна — в третьем.
  grid[12][15] = 2;
  grid[12][23] = 1;
  grid[12][24] = 3;

  // Декоративные стойки и оборудование.
  grid[4][18] = 1;
  grid[5][18] = 1;
  grid[16][11] = 1;
  grid[19][11] = 1;
  grid[15][21] = 1;
  grid[18][21] = 1;
  return grid;
}

mapData = buildMap();

const interactions = [
  {
    id: 'camera', act: 1, x: 6.1, y: 3.5, label: 'Воспроизвести запись камеры', title: 'Камера 01 — центр управления',
    kicker: 'ПОВРЕЖДЁННАЯ ЗАПИСЬ / 72 ЧАСА НАЗАД',
    body: `<p>Экран рассыпается на полосы. На записи Олег сидит за пультом и смотрит вниз — на экран телефона.</p><blockquote>СЕКЦИЯ Б-3: отклонение давления 18%... 27%... 41%...</blockquote><p>За спиной загорается аварийная лампа. Олег не поднимает головы. Запись обрывается.</p><p><i>«Это не то, что кажется. Я проверял показания. Я всё делал правильно».</i></p>`,
    after: 'Найти записи о погибших в медпункте и столовой.'
  },
  {
    id: 'canteen', act: 1, x: 13.4, y: 5.0, label: 'Осмотреть недоеденный ужин', title: 'Последний ужин',
    kicker: 'ЛИЧНАЯ ВЕЩЬ / СТОЛОВАЯ',
    body: `<p>Одиннадцать приборов. Одиннадцать стаканов. На дне кастрюли застыл борщ.</p><blockquote>Сергей: «Олег, соли опять мало?»<br>Олег: «Завтра исправишь».</blockquote><p>Слово «завтра» звучит в памяти слишком долго. У плиты кто-то стоит спиной. Когда Олег моргает, там уже никого.</p>`,
    after: 'Продолжить осмотр станции.'
  },
  {
    id: 'medlog', act: 1, x: 23.8, y: 4.9, label: 'Прочитать медицинский журнал', title: 'Медицинский журнал',
    kicker: 'ОФИЦИАЛЬНЫЙ ДОКУМЕНТ / МЕДПУНКТ',
    body: `<p><b>Дата:</b> 17.04.21██</p><p><b>Причина:</b> разгерметизация секции Б-7, термическое поражение.</p><blockquote>Доставлено тел: 11<br>Выживших: 1<br>Марченко Олег Викторович</blockquote><p>Под записью чужим почерком: «Почему дверь центра управления осталась закрыта?»</p>`,
    after: 'Проверить источник аварийной записи.'
  },
  {
    id: 'daughter', act: 2, x: 8.2, y: 15.0, label: 'Открыть последнее сообщение', title: 'Сообщение от дочери',
    kicker: 'ЛИЧНАЯ ПЕРЕПИСКА / ЗА ЧАС ДО АВАРИИ',
    body: `<p>Экран планшета треснул, но сообщение сохранилось.</p><blockquote>ЛИЗА, 22:14<br>«Пап, ты когда приедешь? Мама говорит, ты опять обещал».</blockquote><p>Олег помнит, как перечитал эти слова. Потом зазвонила жена. Разговор длился четыре минуты.</p><p>Четыре минуты — достаточно, чтобы давление в секции Б-3 стало критическим.</p>`,
    after: 'Найти технический отсек Б-3.'
  },
  {
    id: 'valve', act: 2, x: 17.2, y: 16.1, label: 'Осмотреть кожух клапана', title: 'Клапан охлаждения Б-3',
    kicker: 'ТЕХНИЧЕСКИЙ ОТСЕК / ГЕРМОЗОНА',
    body: `<p>Кожух деформирован изнутри. На креплении — старая меловая отметка, сделанная рукой Олега.</p><blockquote>Виктор: «Он опять шумит. Напиши рапорт, пока нас всех не сварило».<br>Олег: «После смены. Не начинай».</blockquote><p>За гермодверью раздаётся три удара. Потом голос Виктора, спокойный и далёкий:</p><p><i>«Мы же договаривались — если что-то случится, мы вместе».</i></p>`,
    after: 'Найти черновик рапорта.'
  },
  {
    id: 'draft', act: 2, x: 15.2, y: 18.7, label: 'Прочитать черновик', title: 'Неотправленный рапорт',
    kicker: 'ЛИЧНАЯ ЗАПИСЬ / ЗА 7 ДНЕЙ ДО АВАРИИ',
    body: `<p>Документ создан неделю назад и ни разу не отправлен.</p><blockquote>«Клапан охлаждения секции Б-3 требует замены. Шум усиливается. Прошу...»</blockquote><p>Дальше — пустая строка.</p><p>Олег вспоминает, почему закрыл файл: рапорт означал остановку секции, проверку и десятки объяснительных. Он решил дописать завтра.</p><p>Виктор садится по другую сторону стола, не поднимая глаз:</p><p><i>«Ты знал. Ты знал — и не сказал».</i></p>`,
    after: 'Вернуться в столовую. Они ждут.'
  },
  {
    id: 'court', act: 3, x: 13.2, y: 4.6, label: 'Войти в круг', title: 'Суд',
    kicker: 'ПРОТОКОЛ, КОТОРОГО НЕ БЫЛО',
    requires: () => !game.courtComplete,
    body: `<p>Одиннадцать стульев стоят кругом. На каждом — человек, которого Олег помнит живым.</p><blockquote>«Ты знал о клапане».<br>«Ты выбрал телефон».<br>«Ты написал рапорт, но не отправил».<br>«Ты мог спасти нас».<br>«Ты спас только себя».</blockquote><p>Последним говорит Виктор:</p><blockquote>«Ты не просто убил нас. Ты убил нас дважды — сначала своим бездействием, потом своим молчанием».</blockquote><p>Олег вспоминает гермодверь. Крики по связи. Красную кнопку разблокировки. И свою руку, которая так и не нажала её.</p>`,
    onUse: () => { game.courtComplete = true; },
    after: 'Добраться до антенного модуля и оставить последнюю запись.'
  },
  {
    id: 'final', act: 3, x: 25.2, y: 17.0, label: 'Открыть канал связи', title: 'Последний канал',
    kicker: 'АНТЕННЫЙ МОДУЛЬ / АВАРИЙНАЯ ЧАСТОТА',
    requires: () => game.courtComplete,
    body: `<p>Антенна отвечает коротким импульсом. Канал слабый, но запись можно передать.</p><p>Перед Олегом — чистый документ. В нём останется либо правда, либо ещё одна версия аварии.</p>`,
    onUse: () => setTimeout(showChoice, 250),
    after: 'Сделать выбор.'
  }
];

const baseProjections = [
  { id: 'cook', name: 'Сергей', x: 15.2, y: 4.6, minAct: 1, maxAct: 1, speed: 0, comfort: 2.8, disappearOn: 'canteen' },
  { id: 'nurse', name: 'Анна', x: 25.0, y: 5.3, minAct: 1, maxAct: 1, speed: 0, comfort: 2.5, disappearOn: 'medlog' },
  { id: 'cabin', name: 'Неизвестный', x: 8.4, y: 19.0, minAct: 1, maxAct: 1, speed: 0, comfort: 3.2 },
  { id: 'victor', name: 'Виктор', x: 18.5, y: 17.0, minAct: 2, maxAct: 3, speed: 0.42, comfort: 1.6 },
  { id: 'andrey', name: 'Андрей', x: 13.8, y: 14.0, minAct: 2, maxAct: 3, speed: 0.31, comfort: 2.1 },
  { id: 'irina', name: 'Ирина', x: 4.0, y: 19.0, minAct: 2, maxAct: 3, speed: 0.27, comfort: 2.4 },
  { id: 'alexey', name: 'Алексей', x: 24.8, y: 10.0, minAct: 2, maxAct: 3, speed: 0.36, comfort: 1.8 }
];

let projections = [];

const actCopy = {
  1: { number: 'АКТ I', title: 'ПРОБУЖДЕНИЕ', quote: '«Я всё делал правильно».' },
  2: { number: 'АКТ II', title: 'ТРЕЩИНЫ', quote: 'Память не возвращается. Она просачивается.' },
  3: { number: 'АКТ III', title: 'ДОЛГ', quote: 'Они не преследуют тебя. Они ждут, когда ты остановишься.' }
};

const objectives = {
  1: 'Осмотреть центр управления, столовую и медпункт.',
  2: 'Восстановить события у клапана Б-3.',
  3: 'Вернуться в столовую. Они ждут.',
  final: 'Добраться до антенного модуля и оставить последнюю запись.'
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.hum = null;
    this.nextCreak = 0;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(this.ctx.destination);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = 43;
    gain.gain.value = 0.018;
    filter.type = 'lowpass';
    filter.frequency.value = 130;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    this.hum = { osc, gain };
  }

  tone(freq = 160, duration = 0.12, volume = 0.025, type = 'sine') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.6), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  step() {
    this.tone(78 + Math.random() * 18, 0.08, 0.014, 'triangle');
  }

  memory() {
    this.tone(510, 0.8, 0.028, 'sine');
    setTimeout(() => this.tone(255, 1.2, 0.02, 'sine'), 120);
  }

  projection() {
    this.tone(52, 0.7, 0.035, 'sawtooth');
  }

  update(dt) {
    if (!this.ctx) return;
    this.nextCreak -= dt;
    if (this.nextCreak <= 0 && game.mode === 'playing') {
      this.nextCreak = 6 + Math.random() * 12;
      this.tone(90 + Math.random() * 140, 0.5 + Math.random(), 0.008, Math.random() > 0.5 ? 'sine' : 'triangle');
    }
    if (this.hum) {
      const target = 0.014 + game.act * 0.004 + contactPulse * 0.012;
      this.hum.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
    }
  }
}

const audio = new AudioSystem();

function resetGame() {
  game.mode = 'playing';
  game.act = 1;
  game.flashlight = true;
  game.mapOpen = false;
  game.courtComplete = false;
  game.completed = new Set();
  game.player = { x: 4.8, y: 5.2, angle: 0.1 };
  game.stats = { lookedAt: 0, quietSeconds: 0, contacts: 0 };
  projections = baseProjections.map((p) => ({ ...p, initialX: p.x, initialY: p.y, contactLock: 0 }));
  worldTime = 0;
  cycleSeconds = 0;
  contactPulse = 0;
  flashPulse = 0;
  mapData = buildMap();
  setObjective(objectives[1]);
  ui.flashlight.innerHTML = 'ФОНАРЬ <b>ВКЛ</b>';
  hideAllOverlays();
  ui.hud.classList.remove('hidden');
  showAct(1);
  setTimeout(() => {
    if (game.loopMemory) speak('Я уже... проходил здесь?', 'ОЛЕГ', 4.5);
    else speak('Бортовой журнал. Семьдесят два часа после аварии. Проверить станцию. Найти связь.', 'ОЛЕГ', 5.5);
  }, 3000);
}

function hideAllOverlays() {
  for (const element of [ui.title, ui.pause, ui.memory, ui.act, ui.choice, ui.ending]) element.classList.remove('visible');
}

function showAct(number) {
  const copy = actCopy[number];
  ui.actNumber.textContent = copy.number;
  ui.actTitle.textContent = copy.title;
  ui.actQuote.textContent = copy.quote;
  ui.act.classList.add('visible');
  const previousMode = game.mode;
  game.mode = 'act';
  setTimeout(() => {
    ui.act.classList.remove('visible');
    game.mode = previousMode === 'menu' ? 'playing' : previousMode;
  }, 2500);
}

function setObjective(text) {
  ui.objective.textContent = text;
}

function speak(text, speaker = 'ГОЛОС', duration = 4) {
  clearTimeout(subtitleTimer);
  ui.subtitles.innerHTML = `<span class="speaker">${speaker}</span><br>${text}`;
  subtitleTimer = setTimeout(() => { ui.subtitles.textContent = ''; }, duration * 1000);
}

function showMemory(item) {
  game.mode = 'memory';
  ui.memoryKicker.textContent = item.kicker ?? 'ФРАГМЕНТ ПАМЯТИ';
  ui.memoryTitle.textContent = item.title;
  ui.memoryBody.innerHTML = item.body;
  ui.memory.classList.add('visible');
  audio.memory();
  if (!game.completed.has(item.id)) {
    game.completed.add(item.id);
    item.onUse?.();
    if (item.after) setObjective(item.after);
    checkProgress();
  }
}

function closeMemory() {
  ui.memory.classList.remove('visible');
  game.mode = 'playing';
}

function checkProgress() {
  const hasAct1 = ['camera', 'canteen', 'medlog'].every((id) => game.completed.has(id));
  const hasAct2 = ['daughter', 'valve', 'draft'].every((id) => game.completed.has(id));

  if (game.act === 1 && hasAct1) {
    setTimeout(() => advanceAct(2), 450);
  } else if (game.act === 2 && hasAct2) {
    setTimeout(() => advanceAct(3), 450);
  }
}

function advanceAct(number) {
  if (game.act >= number) return;
  game.act = number;
  setObjective(objectives[number]);
  flashPulse = 1;
  audio.projection();
  showAct(number);
  if (number === 2) {
    setTimeout(() => speak('Олег... ты видел мой ключ?', 'ВИКТОР', 4), 2800);
  }
  if (number === 3) {
    spawnCourtProjections();
    setTimeout(() => speak('Ты знаешь дорогу. Ты просто не хотел сюда возвращаться.', 'ВИКТОР', 5), 2800);
  }
}

function spawnCourtProjections() {
  const names = ['Виктор', 'Анна', 'Дима', 'Сергей', 'Ирина', 'Лёша', 'Коля', 'Марина', 'Андрей', 'Лена', 'Гена'];
  for (let i = 0; i < names.length; i += 1) {
    const angle = (i / names.length) * TAU;
    projections.push({
      id: `court-${i}`,
      name: names[i],
      x: 13.2 + Math.cos(angle) * 2.15,
      y: 4.8 + Math.sin(angle) * 1.65,
      initialX: 13.2 + Math.cos(angle) * 2.15,
      initialY: 4.8 + Math.sin(angle) * 1.65,
      minAct: 3,
      maxAct: 3,
      speed: 0,
      comfort: 1.4,
      courtOnly: true,
      contactLock: 0
    });
  }
}

function showChoice() {
  game.mode = 'choice';
  ui.memory.classList.remove('visible');
  ui.choice.classList.add('visible');
  document.exitPointerLock?.();
}

function showEnding(type) {
  ui.choice.classList.remove('visible');
  ui.ending.classList.add('visible');
  game.mode = 'ending';

  if (type === 'accept') {
    localStorage.removeItem('u7-loop');
    game.loopMemory = false;
    ui.endingKicker.textContent = 'ФИНАЛ / ПРИЗНАНИЕ';
    ui.endingTitle.textContent = 'Я помню вас';
    const extra = game.completed.size >= 7
      ? '<p>Олег называет их по именам: Виктор. Анна. Дима. Сергей. Ирина. Алексей. Николай. Марина. Андрей. Елена. Геннадий.</p>'
      : '';
    ui.endingBody.innerHTML = `<blockquote>«Авария на станции “Утилизация-7” произошла по моей вине. Я знал о неисправности клапана Б-3 и не сообщил начальству. Я был отвлечён личным звонком. Я не открыл гермодверь. Все одиннадцать членов экипажа погибли из-за моего бездействия. Я беру на себя полную ответственность».</blockquote>${extra}<p>Проекции впервые поднимают глаза. В них нет ни прощения, ни гнева. Только присутствие.</p><p>Сигнал уходит к Земле. Станция остаётся пустой, но перестаёт быть тюрьмой.</p>`;
  } else {
    localStorage.setItem('u7-loop', '1');
    game.loopMemory = true;
    ui.endingKicker.textContent = 'ФИНАЛ / ВЫТЕСНЕНИЕ';
    ui.endingTitle.textContent = 'Первая проверка';
    ui.endingBody.innerHTML = `<blockquote>«Это был сбой системы. Я не мог ничего сделать. Я пытался спасти их. Я — жертва».</blockquote><p>Коридор приводит Олега обратно в центр управления. На камере снова мигает непросмотренная запись. В журнале снова нет последней страницы.</p><p>Шаги за спиной продолжаются даже после того, как заканчивается станция.</p><p><i>Через несколько часов Олег проснётся у пульта и решит впервые проверить объект.</i></p>`;
  }
}

function getTile(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= MAP_W || iy >= MAP_H) return 1;
  const tile = mapData[iy][ix];
  if (tile === 2 && game.act >= 2) return 0;
  if (tile === 3 && game.act >= 3) return 0;
  return tile;
}

function isWalkable(x, y) {
  return getTile(x - PLAYER_RADIUS, y - PLAYER_RADIUS) === 0
    && getTile(x + PLAYER_RADIUS, y - PLAYER_RADIUS) === 0
    && getTile(x - PLAYER_RADIUS, y + PLAYER_RADIUS) === 0
    && getTile(x + PLAYER_RADIUS, y + PLAYER_RADIUS) === 0;
}

function normalizeAngle(angle) {
  let value = angle % TAU;
  if (value < -Math.PI) value += TAU;
  if (value > Math.PI) value -= TAU;
  return value;
}

function lineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.ceil(distance * 6));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (getTile(x1 + dx * t, y1 + dy * t) !== 0) return false;
  }
  return true;
}

function activeInteraction(item) {
  return item.act === game.act && !game.completed.has(item.id) && (!item.requires || item.requires());
}

function findInteraction() {
  let best = null;
  let bestScore = Infinity;
  for (const item of interactions) {
    if (!activeInteraction(item)) continue;
    const dx = item.x - game.player.x;
    const dy = item.y - game.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1.65 || !lineOfSight(game.player.x, game.player.y, item.x, item.y)) continue;
    const angle = Math.abs(normalizeAngle(Math.atan2(dy, dx) - game.player.angle));
    const score = distance + angle * 0.8;
    if (angle < 0.75 && score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function visibleProjection(entity) {
  const dx = entity.x - game.player.x;
  const dy = entity.y - game.player.y;
  const angle = Math.abs(normalizeAngle(Math.atan2(dy, dx) - game.player.angle));
  return angle < FOV * 0.46 && lineOfSight(game.player.x, game.player.y, entity.x, entity.y);
}

function projectionIsActive(entity) {
  if (game.act < entity.minAct || game.act > entity.maxAct) return false;
  if (entity.disappearOn && game.completed.has(entity.disappearOn)) return false;
  if (entity.courtOnly && !game.courtComplete && Math.hypot(game.player.x - 13.2, game.player.y - 4.8) > 4.5) return false;
  return true;
}

function updateProjections(dt) {
  let nearest = 99;
  for (const entity of projections) {
    if (!projectionIsActive(entity)) continue;
    entity.contactLock = Math.max(0, (entity.contactLock ?? 0) - dt);
    const dx = game.player.x - entity.x;
    const dy = game.player.y - entity.y;
    const distance = Math.hypot(dx, dy);
    nearest = Math.min(nearest, distance);
    const seen = visibleProjection(entity);
    if (seen) {
      game.stats.lookedAt += dt;
    } else if (entity.speed > 0 && distance > entity.comfort) {
      const step = Math.min(entity.speed * dt * (1 + (game.act - 1) * 0.3), distance - entity.comfort);
      const nx = entity.x + (dx / distance) * step;
      const ny = entity.y + (dy / distance) * step;
      if (getTile(nx, ny) === 0) {
        entity.x = nx;
        entity.y = ny;
      }
    }
    if (distance < 0.52 && entity.contactLock <= 0) {
      entity.contactLock = 4;
      contactPulse = 1;
      game.stats.contacts += 1;
      audio.projection();
      speak(entity.name === 'Виктор' ? 'Ты всё ещё отворачиваешься.' : 'Олег...', entity.name.toUpperCase(), 2.7);
      const away = Math.atan2(entity.y - game.player.y, entity.x - game.player.x);
      entity.x = game.player.x + Math.cos(away) * Math.max(1.5, entity.comfort);
      entity.y = game.player.y + Math.sin(away) * Math.max(1.5, entity.comfort);
    }
  }
  contactPulse = Math.max(0, contactPulse - dt * 0.7);
  return nearest;
}

function update(dt) {
  worldTime += dt;
  audio.update(dt);
  flashPulse = Math.max(0, flashPulse - dt * 0.5);
  cycleSeconds += dt;
  const total = Math.floor(cycleSeconds);
  const hh = String(72 + Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(14 + Math.floor(total / 60) % 60).padStart(2, '0');
  const ss = String(9 + total % 60).padStart(2, '0');
  ui.cycle.textContent = `${hh}:${mm}:${ss}`;
  ui.oxygen.style.width = `${Math.max(41, 74 - cycleSeconds / 260)}%`;

  if (game.mode !== 'playing' || game.mapOpen) return;

  let forward = 0;
  let strafe = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
  if (keys.has('KeyA')) strafe -= 1;
  if (keys.has('KeyD')) strafe += 1;
  if (keys.has('ArrowLeft')) game.player.angle -= dt * 1.7;
  if (keys.has('ArrowRight')) game.player.angle += dt * 1.7;

  const moving = forward !== 0 || strafe !== 0;
  if (moving) {
    const len = Math.hypot(forward, strafe) || 1;
    forward /= len;
    strafe /= len;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = sprint ? 3.25 : 2.15;
    const vx = Math.cos(game.player.angle) * forward + Math.cos(game.player.angle + Math.PI / 2) * strafe;
    const vy = Math.sin(game.player.angle) * forward + Math.sin(game.player.angle + Math.PI / 2) * strafe;
    const nx = game.player.x + vx * speed * dt;
    const ny = game.player.y + vy * speed * dt;
    if (isWalkable(nx, game.player.y)) game.player.x = nx;
    if (isWalkable(game.player.x, ny)) game.player.y = ny;
    bob += dt * (sprint ? 12 : 8);
    footstepCooldown -= dt;
    if (footstepCooldown <= 0) {
      audio.step();
      footstepCooldown = sprint ? 0.32 : 0.47;
    }
  } else {
    game.stats.quietSeconds += dt;
  }

  const nearestProjection = updateProjections(dt);
  interactTarget = findInteraction();
  if (interactTarget) {
    ui.hint.classList.remove('hidden');
    ui.hintText.textContent = interactTarget.label;
  } else {
    ui.hint.classList.add('hidden');
  }

  if (nearestProjection < 2.7 && Math.random() < dt * 0.25) {
    const phrases = game.act === 2
      ? ['Ты уходишь уже?', 'Ты слышал сигнал?', 'Напиши рапорт, Олег.']
      : ['Ты выбрал телефон.', 'Ты мог открыть дверь.', 'Скажи это вслух.'];
    speak(phrases[Math.floor(Math.random() * phrases.length)], 'ПРОЕКЦИЯ', 2.8);
  }
}

function castRay(angle) {
  const rayDirX = Math.cos(angle);
  const rayDirY = Math.sin(angle);
  let mapX = Math.floor(game.player.x);
  let mapY = Math.floor(game.player.y);
  const deltaDistX = Math.abs(1 / (rayDirX || 0.00001));
  const deltaDistY = Math.abs(1 / (rayDirY || 0.00001));
  let stepX;
  let stepY;
  let sideDistX;
  let sideDistY;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (game.player.x - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - game.player.x) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (game.player.y - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - game.player.y) * deltaDistY;
  }

  let side = 0;
  let tile = 1;
  for (let i = 0; i < 96; i += 1) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    tile = getTile(mapX + 0.5, mapY + 0.5);
    if (tile !== 0) break;
  }

  let distance;
  if (side === 0) distance = (mapX - game.player.x + (1 - stepX) / 2) / (rayDirX || 0.00001);
  else distance = (mapY - game.player.y + (1 - stepY) / 2) / (rayDirY || 0.00001);
  distance = Math.min(MAX_RAY_DISTANCE, Math.max(0.001, distance));
  const hitX = game.player.x + rayDirX * distance;
  const hitY = game.player.y + rayDirY * distance;
  const wallCoord = side === 0 ? hitY : hitX;
  return { distance, side, tile, wallCoord: wallCoord - Math.floor(wallCoord), mapX, mapY };
}

function palette(tile, side, brightness) {
  let base;
  if (tile === 2 || tile === 3) base = game.act === 1 ? [112, 42, 38] : [115, 82, 48];
  else if (game.act === 1) base = [83, 105, 111];
  else if (game.act === 2) base = [104, 77, 56];
  else base = [91, 42, 39];
  const sideShade = side ? 0.72 : 1;
  return base.map((value) => Math.round(value * sideShade * brightness));
}

function renderWorld() {
  const w = canvas.width;
  const h = canvas.height;
  const horizon = h * 0.5 + Math.sin(bob) * 2.1;
  const actFactor = game.act - 1;
  const flicker = game.act === 1 ? 1 : 0.88 + Math.random() * 0.12;

  const ceiling = ctx.createLinearGradient(0, 0, 0, horizon);
  ceiling.addColorStop(0, game.act === 3 ? '#080203' : '#061015');
  ceiling.addColorStop(1, game.act === 1 ? '#172126' : '#160b0a');
  ctx.fillStyle = ceiling;
  ctx.fillRect(0, 0, w, horizon);

  const floor = ctx.createLinearGradient(0, horizon, 0, h);
  floor.addColorStop(0, game.act === 1 ? '#10191d' : '#130c0a');
  floor.addColorStop(1, '#020304');
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Разметка пола усиливает ощущение перспективы.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = game.act === 3 ? '#b53e34' : '#87a4aa';
  for (let i = 1; i < 15; i += 1) {
    const y = horizon + (h - horizon) * (1 - 1 / (1 + i * 0.34));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const rays = Math.ceil(w / RAY_STEP);
  zBuffer = new Array(rays);
  for (let i = 0; i < rays; i += 1) {
    const cameraX = (i / rays) * 2 - 1;
    const angle = game.player.angle + Math.atan(cameraX * Math.tan(FOV / 2));
    const hit = castRay(angle);
    const corrected = hit.distance * Math.cos(angle - game.player.angle);
    zBuffer[i] = corrected;
    const wallHeight = Math.min(h * 2.4, h / corrected);
    const top = horizon - wallHeight / 2;
    const distanceLight = Math.max(0.11, 1 - corrected / 20);
    const beamAngle = Math.abs(cameraX);
    const flashlight = game.flashlight ? Math.max(0.15, 1 - beamAngle * 1.5) : 0.19;
    const bright = Math.min(1.25, distanceLight * (0.35 + flashlight) * flicker + flashPulse * 0.3);
    let [r, g, b] = palette(hit.tile, hit.side, bright);
    const stripe = Math.floor(hit.wallCoord * 10) % 2 === 0 ? 1 : 0.88;
    r = Math.round(r * stripe); g = Math.round(g * stripe); b = Math.round(b * stripe);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * RAY_STEP, top, RAY_STEP + 1, wallHeight);

    if (corrected < 7 && Math.floor(hit.wallCoord * 24) === 1) {
      ctx.fillStyle = `rgba(220,235,235,${0.05 * bright})`;
      ctx.fillRect(i * RAY_STEP, top, 1, wallHeight);
    }
  }

  drawInteractions(horizon);
  drawProjections(horizon);

  if (game.flashlight) {
    const beam = ctx.createRadialGradient(w / 2, h / 2, h * 0.05, w / 2, h / 2, h * 0.72);
    beam.addColorStop(0, 'rgba(210,230,226,0.10)');
    beam.addColorStop(0.55, 'rgba(120,150,150,0.025)');
    beam.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(0, 0, w, h);
  }

  if (game.act >= 2) {
    ctx.fillStyle = `rgba(120,18,14,${0.025 + contactPulse * 0.12})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (contactPulse > 0) drawStatic(contactPulse);
  if (game.act === 3) drawDistortion();
  drawHelmetOverlay();
}

function projectPoint(x, y) {
  const dx = x - game.player.x;
  const dy = y - game.player.y;
  const distance = Math.hypot(dx, dy);
  const angle = normalizeAngle(Math.atan2(dy, dx) - game.player.angle);
  if (Math.abs(angle) > FOV * 0.72 || distance < 0.08) return null;
  const screenX = canvas.width / 2 + Math.tan(angle) * (canvas.width / 2) / Math.tan(FOV / 2);
  const corrected = distance * Math.cos(angle);
  const rayIndex = Math.max(0, Math.min(zBuffer.length - 1, Math.floor(screenX / RAY_STEP)));
  const occluded = zBuffer[rayIndex] < corrected - 0.16;
  return { x: screenX, distance: corrected, occluded, angle };
}

function drawInteractions(horizon) {
  for (const item of interactions) {
    if (!activeInteraction(item)) continue;
    const p = projectPoint(item.x, item.y);
    if (!p || p.occluded) continue;
    const size = Math.max(7, Math.min(34, 76 / p.distance));
    const y = horizon + Math.min(canvas.height * 0.3, 65 / p.distance);
    ctx.save();
    ctx.translate(p.x, y);
    ctx.rotate(worldTime * 0.55);
    ctx.shadowColor = game.act === 3 ? '#d66c5d' : '#d0ab6c';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = game.act === 3 ? 'rgba(225,105,92,.9)' : 'rgba(213,177,113,.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.rotate(-worldTime * 1.1);
    ctx.strokeRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);
    ctx.restore();
  }
}

function drawProjections(horizon) {
  const sorted = projections
    .filter(projectionIsActive)
    .map((entity) => ({ entity, p: projectPoint(entity.x, entity.y) }))
    .filter(({ p }) => p && !p.occluded)
    .sort((a, b) => b.p.distance - a.p.distance);

  for (const { entity, p } of sorted) {
    const size = Math.min(canvas.height * 1.28, canvas.height * 0.82 / Math.max(0.45, p.distance));
    const baseY = horizon + size * 0.46;
    const caught = visibleProjection(entity);
    ctx.save();
    ctx.translate(p.x, baseY);
    ctx.globalAlpha = Math.max(0.18, Math.min(0.88, 1.2 - p.distance / 17));
    ctx.shadowColor = '#9bb7ba';
    ctx.shadowBlur = caught ? 12 : 24;

    const sway = caught ? 0 : Math.sin(worldTime * 1.3 + entity.x) * 0.018;
    ctx.rotate(sway);
    const body = ctx.createLinearGradient(0, -size, 0, 0);
    body.addColorStop(0, 'rgba(198,211,211,.72)');
    body.addColorStop(0.28, 'rgba(80,92,94,.68)');
    body.addColorStop(1, 'rgba(5,8,9,.92)');
    ctx.fillStyle = body;

    // Голова всегда немного отвёрнута.
    ctx.beginPath();
    ctx.ellipse(size * 0.035, -size * 0.84, size * 0.105, size * 0.13, -0.22, 0, TAU);
    ctx.fill();
    // Плечи и длинный корпус.
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, -size * 0.72);
    ctx.quadraticCurveTo(0, -size * 0.82, size * 0.19, -size * 0.70);
    ctx.lineTo(size * 0.14, -size * 0.14);
    ctx.lineTo(size * 0.06, 0);
    ctx.lineTo(-size * 0.08, 0);
    ctx.lineTo(-size * 0.14, -size * 0.18);
    ctx.closePath();
    ctx.fill();
    // Руки.
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(36,43,45,.9)';
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, -size * 0.65);
    ctx.lineTo(-size * 0.22, -size * 0.23);
    ctx.moveTo(size * 0.13, -size * 0.65);
    ctx.lineTo(size * 0.20, -size * 0.24);
    ctx.stroke();
    // Ноги.
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, -size * 0.16);
    ctx.lineTo(-size * 0.08, size * 0.08);
    ctx.moveTo(size * 0.05, -size * 0.16);
    ctx.lineTo(size * 0.09, size * 0.08);
    ctx.stroke();

    if (game.act === 3) {
      ctx.fillStyle = 'rgba(210,225,225,.25)';
      ctx.fillRect(-size * 0.055, -size * 0.87, size * 0.02, size * 0.008);
    }
    ctx.restore();
  }
}

function drawStatic(intensity) {
  ctx.save();
  ctx.globalAlpha = intensity * 0.45;
  for (let i = 0; i < 60; i += 1) {
    const y = Math.random() * canvas.height;
    const h = 1 + Math.random() * 3;
    ctx.fillStyle = Math.random() > 0.5 ? '#d8e6e6' : '#7d2220';
    ctx.fillRect(Math.random() * canvas.width, y, Math.random() * canvas.width * 0.26, h);
  }
  ctx.restore();
}

function drawDistortion() {
  const strength = 1.5 + Math.sin(worldTime * 0.7) * 0.8;
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#9a3029';
  for (let x = 0; x < canvas.width; x += 70) {
    ctx.beginPath();
    for (let y = 0; y <= canvas.height; y += 20) {
      const dx = Math.sin(y * 0.028 + worldTime * 1.2 + x) * strength;
      if (y === 0) ctx.moveTo(x + dx, y);
      else ctx.lineTo(x + dx, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawHelmetOverlay() {
  const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.28, canvas.width / 2, canvas.height / 2, canvas.height * 0.78);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.72, 'rgba(0,0,0,.08)');
  grad.addColorStop(1, 'rgba(0,0,0,.82)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(170,195,198,.045)';
  ctx.lineWidth = 1;
  for (let y = 0; y < canvas.height; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

function renderMap() {
  const w = mapCanvas.width;
  const h = mapCanvas.height;
  const cell = Math.min(w / MAP_W, h / MAP_H);
  const ox = (w - MAP_W * cell) / 2;
  const oy = (h - MAP_H * cell) / 2;
  mapCtx.fillStyle = '#061013';
  mapCtx.fillRect(0, 0, w, h);

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const raw = mapData[y][x];
      if (raw === 0 || (raw === 2 && game.act >= 2) || (raw === 3 && game.act >= 3)) {
        mapCtx.fillStyle = 'rgba(115,150,155,.08)';
        mapCtx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
      } else if (raw === 2 || raw === 3) {
        mapCtx.fillStyle = 'rgba(181,67,59,.72)';
        mapCtx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
      } else {
        mapCtx.fillStyle = 'rgba(126,157,162,.21)';
        mapCtx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
      }
    }
  }

  const labels = [
    ['ЦЕНТР', 4.5, 4.4], ['СТОЛОВАЯ', 12.9, 4.4], ['МЕДПУНКТ', 22.4, 4.4],
    ['ЖИЛОЙ БЛОК', 3.2, 14.2], ['Б-3', 16.4, 14.2], ['АНТЕННА', 23.6, 14.2]
  ];
  mapCtx.font = '11px Segoe UI';
  mapCtx.fillStyle = 'rgba(190,211,213,.55)';
  for (const [label, x, y] of labels) mapCtx.fillText(label, ox + x * cell, oy + y * cell);

  for (const item of interactions) {
    if (!activeInteraction(item)) continue;
    mapCtx.save();
    mapCtx.translate(ox + item.x * cell, oy + item.y * cell);
    mapCtx.rotate(Math.PI / 4);
    mapCtx.strokeStyle = '#cf9e58';
    mapCtx.strokeRect(-4, -4, 8, 8);
    mapCtx.restore();
  }

  const px = ox + game.player.x * cell;
  const py = oy + game.player.y * cell;
  mapCtx.fillStyle = '#9ed9df';
  mapCtx.beginPath();
  mapCtx.arc(px, py, 5, 0, TAU);
  mapCtx.fill();
  mapCtx.strokeStyle = '#9ed9df';
  mapCtx.beginPath();
  mapCtx.moveTo(px, py);
  mapCtx.lineTo(px + Math.cos(game.player.angle) * 16, py + Math.sin(game.player.angle) * 16);
  mapCtx.stroke();
}

function render() {
  renderWorld();
  if (game.mapOpen) renderMap();
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const ratio = Math.min(1.25, window.devicePixelRatio || 1);
  const targetW = Math.max(640, Math.floor(window.innerWidth * ratio));
  const targetH = Math.max(360, Math.floor(window.innerHeight * ratio));
  canvas.width = Math.min(1600, targetW);
  canvas.height = Math.min(900, targetH);
}

function toggleMap() {
  if (!['playing', 'map'].includes(game.mode)) return;
  game.mapOpen = !game.mapOpen;
  ui.map.classList.toggle('hidden', !game.mapOpen);
  game.mode = game.mapOpen ? 'map' : 'playing';
}

function toggleFlashlight() {
  if (!['playing', 'map'].includes(game.mode)) return;
  game.flashlight = !game.flashlight;
  ui.flashlight.innerHTML = `ФОНАРЬ <b>${game.flashlight ? 'ВКЛ' : 'ВЫКЛ'}</b>`;
  audio.tone(game.flashlight ? 330 : 180, 0.08, 0.02, 'square');
}

function interact() {
  if (game.mode === 'memory') {
    closeMemory();
    return;
  }
  if (game.mode !== 'playing' || !interactTarget) return;
  showMemory(interactTarget);
}

function pauseGame() {
  if (['choice', 'ending', 'menu', 'memory', 'act'].includes(game.mode)) return;
  game.mode = 'paused';
  ui.pause.classList.add('visible');
}

function resumeGame() {
  ui.pause.classList.remove('visible');
  game.mode = 'playing';
  canvas.requestPointerLock?.();
}

window.addEventListener('keydown', (event) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
  if (event.repeat) return;
  if (event.code === 'KeyE') interact();
  if (event.code === 'KeyF') toggleFlashlight();
  if (event.code === 'KeyM') toggleMap();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas && game.mode === 'playing') {
    game.player.angle = normalizeAngle(game.player.angle + event.movementX * 0.0022);
  }
});

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 80);
});

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.mode === 'playing' && !game.mapOpen) pauseGame();
});

canvas.addEventListener('click', () => {
  if (game.mode === 'playing' && !document.pointerLockElement) canvas.requestPointerLock?.();
});

document.querySelector('#start-button').addEventListener('click', () => {
  audio.start();
  resetGame();
  canvas.requestPointerLock?.();
});
document.querySelector('#resume-button').addEventListener('click', resumeGame);
document.querySelector('#restart-button').addEventListener('click', () => {
  ui.pause.classList.remove('visible');
  resetGame();
  canvas.requestPointerLock?.();
});
document.querySelector('#accept-button').addEventListener('click', () => showEnding('accept'));
document.querySelector('#deny-button').addEventListener('click', () => showEnding('deny'));
document.querySelector('#ending-restart').addEventListener('click', () => {
  ui.ending.classList.remove('visible');
  audio.start();
  resetGame();
  canvas.requestPointerLock?.();
});

resizeCanvas();
render();
requestAnimationFrame(loop);
