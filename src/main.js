import './style.css';
import {
  VOCAB,
  GRADES,
  ALL_CHARS,
  findWord,
  wordsFor,
} from './data.js';
import {
  USER,
  ROUNDS_REQUIRED,
  charProgress,
  clearProgress,
  dueReviews,
  isLoggedIn,
  loadState,
  login,
  logout,
  pendingMistakes,
  postponeReview,
  progressFor,
  recordRound,
  recordWordResult,
  removeMistake,
  saveState,
  touchDay,
  wrongCount,
} from './store.js';
import { mountDemo, mountQuiz } from './writer.js';

const app = document.querySelector('#app');
let state = loadState();
let needsInitialSave = false;
let ui = {
  screen: isLoggedIn() ? 'practice' : 'login',
  hint: false,
  mistakeFilter: 'pending',
  search: '',
  notice: '',
};
let practice = { activeIndex: 0, statuses: [], wordId: null };
let modal = null;
let renderToken = 0;
let activeQuizMount = null;
const mounts = [];

if (ui.screen === 'practice') {
  touchDay(state);
  needsInitialSave = true;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function scopeWords() {
  return wordsFor(state.gradeFilter);
}

function currentWord() {
  const words = scopeWords();
  if (!words.length) return null;
  const index = Math.min(Math.max(0, state.currentIndex), words.length - 1);
  return words[index];
}

function ensurePractice() {
  const word = currentWord();
  if (!word) return;
  if (practice.wordId !== word.id) {
    practice = {
      activeIndex: 0,
      statuses: word.chars.map(() => ({ done: false, mistakes: 0, offline: false })),
      wordId: word.id,
    };
    ui.hint = false;
  }
  if (practice.statuses.length !== word.chars.length) {
    practice.statuses = word.chars.map(() => ({ done: false, mistakes: 0, offline: false }));
    practice.activeIndex = 0;
  }
}

function persist() {
  saveState(state);
}

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function streakDays() {
  if (!state.playDays.length) return 0;
  const days = new Set(state.playDays);
  let count = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function todayLabel() {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.78;
  window.speechSynthesis.speak(utterance);
}

function destroyMounts() {
  activeQuizMount = null;
  while (mounts.length) {
    const mount = mounts.pop();
    try { mount?.destroy?.(); } catch {}
  }
}

function render() {
  renderToken += 1;
  destroyMounts();
  app.innerHTML = ui.screen === 'login' ? loginView() : shellView();
  bind();
  if (needsInitialSave) {
    needsInitialSave = false;
    saveState(state);
  }
  const token = renderToken;
  requestAnimationFrame(() => afterRender(token));
}

function afterRender(token) {
  if (token !== renderToken) return;
  if (ui.screen === 'practice') setupPractice();
  if (modal) setupDemoMounts();
  if (modal) setupModal(token);
}

function loginView() {
  return `<main class="login-page">
    <div class="login-card">
      <div class="brand-mark">字</div>
      <p class="eyebrow">HANZI MEMO · 1—9 年级</p>
      <h1>每天写几个字，<br><em>把知识写进手里。</em></h1>
      <p class="muted">按拼音默写词语，逐笔校验笔顺。错字、错词连续订正三遍后进入复习队列。</p>
      <form id="login-form" class="login-form">
        <label>用户名<input id="user" autocomplete="username" placeholder="请输入用户名" required /></label>
        <label>密码<input id="pass" type="password" autocomplete="current-password" placeholder="请输入密码" required /></label>
        <p id="login-error" class="form-error"></p>
        <button class="primary wide">进入练习 <span>→</span></button>
      </form>
      <p class="login-note">暂不开放注册 · 学习数据保存在本机浏览器</p>
    </div>
    <div class="login-art">
      <div class="sun"></div>
      <div class="quote">提笔即是<br><b>练习的开始</b></div>
      <div class="stamp">每日<br>一练</div>
    </div>
  </main>`;
}

function navButton(screen, icon, label) {
  return `<button data-screen="${screen}" class="nav-item ${ui.screen === screen ? 'active' : ''}"><span>${icon}</span>${label}</button>`;
}

function shellView() {
  const pending = pendingMistakes(state);
  const pendingTotal = pending.words.length + pending.chars.length;
  const percent = progressFor(state).percent;

  return `<div class="app-shell">
    <header class="topbar">
      <button class="brand" data-screen="practice"><span>字</span><strong>字字有功</strong></button>
      <div class="top-actions">
        <span class="date-chip">${esc(todayLabel())}</span>
        <span class="user-chip">${esc(USER)}</span>
        <button class="icon-btn" data-action="logout" aria-label="退出登录">↪</button>
      </div>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <nav>
          ${navButton('practice', '✎', '今日默写')}
          ${navButton('mistakes', '↻', `错题复习 ${pendingTotal ? `<i>${pendingTotal}</i>` : ''}`)}
          ${navButton('stats', '▥', '学习记录')}
        </nav>
        <div class="side-foot">
          <div class="progress-ring">
            <svg viewBox="0 0 36 36"><path class="ring-bg" d="M18 2.1a15.9 15.9 0 1 1 0 31.8a15.9 15.9 0 1 1 0-31.8"/><path class="ring" stroke-dasharray="${percent},100" d="M18 2.1a15.9 15.9 0 1 1 0 31.8a15.9 15.9 0 1 1 0-31.8"/></svg>
            <b>${percent}<small>%</small></b>
          </div>
          <small>总进度</small>
        </div>
      </aside>
      <main class="content">${screenView()}</main>
    </div>
    <nav class="bottom-nav">
      <button data-screen="practice" class="${ui.screen === 'practice' ? 'active' : ''}">✎<small>默写</small></button>
      <button data-screen="mistakes" class="${ui.screen === 'mistakes' ? 'active' : ''}">↻<small>复习</small></button>
      <button data-screen="stats" class="${ui.screen === 'stats' ? 'active' : ''}">▥<small>记录</small></button>
    </nav>
    ${modal ? modalView() : ''}
  </div>`;
}

function screenView() {
  if (ui.screen === 'practice') return practiceView();
  if (ui.screen === 'mistakes') return mistakesView();
  if (ui.screen === 'stats') return statsView();
  if (ui.screen === 'worksheet') return worksheetView();
  return practiceView();
}

function gradeFilterHtml() {
  return `<div class="grade-filter" role="group" aria-label="选择年级">
    ${GRADES.map(grade => `<button data-grade="${grade.key}" class="${state.gradeFilter === grade.key ? 'active' : ''}">${esc(grade.label)}</button>`).join('')}
  </div>`;
}

function practiceView() {
  ensurePractice();
  const word = currentWord();
  if (!word) return '<div class="empty">当前年级暂无词语。</div>';

  const chars = word.chars;
  const active = practice.activeIndex;
  const doneCount = practice.statuses.filter(item => item.done).length;
  const learned = state.completedWordIds.includes(word.id);

  return `<div class="practice-head">
    <div>
      <p class="eyebrow">${learned ? '再写一遍' : '看拼音写词语'} · ${esc(word.grade)}</p>
      <h2>第 <span>${String(state.currentIndex + 1).padStart(3, '0')}</span> 组</h2>
    </div>
    <div class="head-progress"><span>${doneCount} / ${chars.length} 字</span><div><i style="width:${(doneCount / chars.length) * 100}%"></i></div></div>
  </div>
  ${gradeFilterHtml()}
  ${ui.notice ? `<div class="notice">${esc(ui.notice)}</div>` : ''}
  <section class="prompt-card">
    <div class="prompt-label">拼音提示</div>
    <div class="pinyin">${esc(word.pinyin)}</div>
    <div class="hint">${learned ? '本词已掌握，再写一遍巩固记忆。' : '按顺序写出每个字，系统会逐笔校验。'}</div>
  </section>
  <section class="writing-card">
    <div class="grid-row">${chars.map((char, index) => charTile(word, char, index, active)).join('')}</div>
    <div class="writing-tools">
      <span><i class="tool-dot"></i>${practice.statuses[active]?.offline ? '离线自评模式' : '笔顺与笔画数自动校验'}</span>
      <div class="tool-actions">
        <button data-action="hint" class="text-btn">${ui.hint ? '隐藏提示' : '看提示'}</button>
        <button data-action="clear-word" class="text-btn">清空重写</button>
      </div>
    </div>
  </section>
  <div class="practice-actions">
    <button data-action="speak" class="secondary">朗读</button>
    <button data-action="giveup" class="secondary">不会写</button>
    <button data-action="skip" class="secondary">稍后再写</button>
  </div>
  <p class="already">${learned ? '已完成词语不计入重复进度。' : '整词写错会进入错词本，单字写错会进入错字本。'}</p>`;
}

function charTile(word, char, index, active) {
  const status = practice.statuses[index];
  const isActive = index === active && !status.done;
  const classes = ['tian-grid', status.done ? 'is-done' : '', isActive ? 'is-active' : '', status.mistakes > 0 ? 'has-error' : ''].filter(Boolean).join(' ');
  const ghost = isActive ? `<span class="ghost ${ui.hint ? 'visible' : ''}">${esc(char)}</span>` : '';
  const content = status.done
    ? `<span class="completed-char ${status.mistakes ? 'bad' : 'ok'}">${esc(char)}</span>`
    : isActive
      ? `<div class="quiz-host" data-quiz-host="${index}"></div>${ghost}`
      : `<span class="char-placeholder">${index + 1}</span>`;

  return `<div class="char-wrap">
    <div class="char-pinyin">${esc(word.pinyinArr[index] || '')}</div>
    <div class="${classes}" data-char-box="${index}">
      ${content}
      <span class="cross h"></span><span class="cross v"></span>
      <span class="diag d1"></span><span class="diag d2"></span>
    </div>
    <div class="char-status ${status.done ? (status.mistakes ? 'bad' : 'ok') : ''}">${status.done ? (status.mistakes ? '需订正' : '✓ 正确') : isActive ? '请书写' : ''}</div>
  </div>`;
}

function setupPractice() {
  const word = currentWord();
  if (!word) return;
  const index = practice.activeIndex;
  const host = document.querySelector(`[data-quiz-host="${index}"]`);
  if (!host) return;

  const token = renderToken;
  const mount = mountQuiz(host, word.chars[index], {
    size: Math.max(86, Math.round(host.closest('.tian-grid').getBoundingClientRect().width || 130)),
    showOutline: ui.hint,
    autoStart: true,
    onMistake: () => {
      if (token !== renderToken) return;
      practice.statuses[index].mistakes += 1;
      const tile = host.closest('.tian-grid');
      if (tile) tile.classList.add('has-error');
    },
    onComplete: data => {
      if (token !== renderToken) return;
      practice.statuses[index] = {
        ...practice.statuses[index],
        done: true,
        mistakes: Math.max(practice.statuses[index].mistakes, data?.totalMistakes || 0),
      };
      if (index < word.chars.length - 1) {
        practice.activeIndex = index + 1;
        ui.hint = false;
        render();
      } else {
        practice.activeIndex = index;
        setTimeout(() => finalizeWord(index, token), 380);
      }
    },
    onError: error => {
      if (token !== renderToken) return;
      console.warn('笔顺数据加载失败，切换为本字自评模式', error);
      practice.statuses[index].offline = true;
      enableOfflineTile(host, index, word, token);
    },
  });
  mounts.push(mount);
  activeQuizMount = mount;
}

function enableOfflineTile(host, index, word, token) {
  const tile = host.closest('.tian-grid');
  if (!tile || !tile.isConnected) return;
  host.remove();
  const canvas = document.createElement('canvas');
  canvas.className = 'offline-canvas';
  tile.appendChild(canvas);
  if (ui.hint) {
    const ghost = document.createElement('span');
    ghost.className = 'ghost visible';
    ghost.textContent = word.chars[index];
    tile.appendChild(ghost);
  }

  const rect = tile.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#173330';
  let drawing = false;
  let drew = false;

  const point = event => {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };

  canvas.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-action]')) return;
    event.preventDefault();
    drawing = true;
    drew = true;
    const [x, y] = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drawing) return;
    event.preventDefault();
    const [x, y] = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  const actions = document.createElement('div');
  actions.className = 'offline-actions';
  actions.innerHTML = '<button type="button" class="text-btn" data-action="offline-redo">重写</button><button type="button" class="mini-primary" data-action="offline-done">写好了</button>';
  tile.appendChild(actions);

  actions.querySelector('[data-action="offline-redo"]').onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drew = false;
  };
  actions.querySelector('[data-action="offline-done"]').onclick = () => {
    if (!drew || token !== renderToken) return;
    practice.statuses[index] = { ...practice.statuses[index], done: true, offline: true };
    if (index < word.chars.length - 1) {
      practice.activeIndex = index + 1;
      ui.hint = false;
      render();
    } else {
      practice.activeIndex = index;
      setTimeout(() => finalizeWord(index, token), 260);
    }
  };
}

function finalizeWord(expectedIndex = practice.activeIndex, token = renderToken) {
  if (token !== renderToken) return;
  if (modal) return;
  const word = currentWord();
  if (!word) return;
  if (practice.wordId !== word.id) return;
  if (practice.activeIndex !== expectedIndex) return;
  if (!practice.statuses.every(status => status.done)) return;
  const failedIndexes = practice.statuses.map((status, index) => (status.mistakes > 0 ? index : -1)).filter(index => index >= 0);
  const allFailed = failedIndexes.length === word.chars.length;

  const passed = recordWordResult(state, word, { failedIndexes, wholeWord: allFailed });
  if (passed) {
    touchDay(state);
    persist();
    ui.notice = `「${word.word}」书写正确，已计入进度。`;
    advanceWord();
    render();
    return;
  }

  if (allFailed) {
    modal = { context: 'practice', type: 'word', key: word.id, round: 1, charIndex: 0, error: '', done: false };
  } else {
    const first = word.chars[failedIndexes[0]];
    modal = { context: 'practice', type: 'char', key: first, round: 1, charIndex: 0, error: '', done: false };
    modal.queue = failedIndexes.slice(1).map(index => ({ type: 'char', key: word.chars[index] }));
  }

  touchDay(state);
  persist();
  render();
}

function advanceWord() {
  const words = scopeWords();
  if (!words.length) return;
  const start = state.currentIndex;
  for (let offset = 1; offset <= words.length; offset++) {
    const index = (start + offset) % words.length;
    if (!state.completedWordIds.includes(words[index].id)) {
      state.currentIndex = index;
      practice = { activeIndex: 0, statuses: [], wordId: null };
      ui.hint = false;
      persist();
      return;
    }
  }
  state.currentIndex = (start + 1) % words.length;
  practice = { activeIndex: 0, statuses: [], wordId: null };
  ui.hint = false;
  persist();
}

function mistakesView() {
  const pending = pendingMistakes(state);
  const due = dueReviews(state).length;
  const allWords = Object.values(state.wrongWords).sort((a, b) => b.lastFailedAt - a.lastFailedAt);
  const allChars = Object.values(state.wrongChars).sort((a, b) => b.lastFailedAt - a.lastFailedAt);
  const filter = item => {
    if (ui.mistakeFilter === 'pending') return !item.retestPassed;
    if (ui.mistakeFilter === 'mastered') return item.retestPassed;
    return true;
  };
  const words = allWords.filter(filter);
  const chars = allChars.filter(filter);
  const search = ui.search.trim();

  const pendingTotal = pending.words.length + pending.chars.length;
  return `<div class="page-head">
    <div><p class="eyebrow">学习反馈</p><h2>错题复习</h2><p class="muted">每项连续写对 ${ROUNDS_REQUIRED} 遍后标记为已掌握，并进入后续复习队列。</p></div>
    <div class="head-actions"><button class="primary" data-action="review-all" ${pendingTotal ? '' : 'disabled'}>开始全部订正${pendingTotal ? ` (${pendingTotal})` : ''}</button><button class="secondary" data-screen="worksheet">⇩ 字帖</button><button class="secondary" data-action="export-json">导出备份</button></div>
  </div>
  ${ui.notice ? `<div class="notice">${esc(ui.notice)}</div>` : ''}
  ${due ? `<div class="notice due-notice"><span>有 ${due} 项已到复习时间。</span><button class="text-btn" data-action="review-due">开始抽考 →</button></div>` : ''}
  <div class="review-summary">
    <div><b>${allWords.length}</b><span>错词</span></div>
    <div><b>${allChars.length}</b><span>错字</span></div>
    <div><b>${pending.words.length + pending.chars.length}</b><span>待巩固</span></div>
  </div>
  <div class="review-toolbar">
    <div class="segmented">
      <button data-filter="pending" class="${ui.mistakeFilter === 'pending' ? 'active' : ''}">待巩固 ${pending.words.length + pending.chars.length}</button>
      <button data-filter="mastered" class="${ui.mistakeFilter === 'mastered' ? 'active' : ''}">已掌握</button>
      <button data-filter="all" class="${ui.mistakeFilter === 'all' ? 'active' : ''}">全部</button>
    </div>
    <input id="mistake-search" class="search-input" value="${esc(ui.search)}" placeholder="搜索词语或拼音" />
  </div>
  <section class="review-section">
    <div class="section-title"><h3>错词本</h3><span>整词未掌握</span></div>
    ${words.length ? words.map(item => reviewWordItem(item, search)).join('') : '<div class="empty">没有符合条件的错词。</div>'}
  </section>
  <section class="review-section">
    <div class="section-title"><h3>错字本</h3><span>单字专项练习</span></div>
    ${chars.length ? chars.map(item => reviewCharItem(item, search)).join('') : '<div class="empty">没有符合条件的错字。</div>'}
  </section>`;
}

function reviewWordItem(item, search) {
  if (search && !item.word.includes(search) && !item.pinyin.includes(search)) return '';
  return `<div class="review-item">
    <div class="review-char word">${esc(item.word)}</div>
    <div class="review-info">
      <b>${esc(item.pinyin)}</b>
      <div class="repeat-bar"><span style="width:${Math.min(100, item.practiceRoundsDone / ROUNDS_REQUIRED * 100)}%"></span></div>
      <small>错 ${item.mistakeCount} 次 · 已订正 ${item.practiceRoundsDone}/${ROUNDS_REQUIRED} 遍 · ${esc(item.grade)}</small>
    </div>
    <div class="item-actions">
      <span class="state-pill ${item.retestPassed ? 'done' : ''}">${item.retestPassed ? '已掌握' : '待巩固'}</span>
      <button class="practice-one" data-action="correct" data-type="word" data-key="${esc(item.id)}">${item.retestPassed ? '再练一次' : '继续订正'} →</button>
      ${item.retestPassed ? `<button class="remove-btn" data-action="remove-mistake" data-type="word" data-key="${esc(item.id)}">移除</button>` : ''}
    </div>
  </div>`;
}

function reviewCharItem(item, search) {
  if (search && !item.char.includes(search) && !item.pinyin.includes(search) && !item.wordSource.includes(search)) return '';
  return `<div class="review-item">
    <div class="review-char">${esc(item.char)}</div>
    <div class="review-info">
      <b>${esc(item.pinyin || '单字')} ${item.wordSource ? `· 出自「${esc(item.wordSource)}」` : ''}</b>
      <div class="repeat-bar"><span style="width:${Math.min(100, item.practiceRoundsDone / ROUNDS_REQUIRED * 100)}%"></span></div>
      <small>错 ${item.mistakeCount} 次 · 已订正 ${item.practiceRoundsDone}/${ROUNDS_REQUIRED} 遍</small>
    </div>
    <div class="item-actions">
      <span class="state-pill ${item.retestPassed ? 'done' : ''}">${item.retestPassed ? '已掌握' : '待巩固'}</span>
      <button class="practice-one" data-action="correct" data-type="char" data-key="${esc(item.char)}">${item.retestPassed ? '再练一次' : '继续订正'} →</button>
      ${item.retestPassed ? `<button class="remove-btn" data-action="remove-mistake" data-type="char" data-key="${esc(item.char)}">移除</button>` : ''}
    </div>
  </div>`;
}

function statsView() {
  const overall = progressFor(state);
  const chars = charProgress(state);
  const pending = pendingMistakes(state);
  const streak = streakDays();
  const gradeRows = GRADES.filter(grade => grade.key !== 'all').map(grade => {
    const progress = progressFor(state, grade.key);
    return `<div class="grade-row">
      <div><b>${esc(grade.label)}</b><span>${progress.done} / ${progress.total} 词</span></div>
      <div class="grade-bar"><i style="width:${progress.percent}%"></i></div>
      <strong>${progress.percent}%</strong>
    </div>`;
  }).join('');

  return `<div class="page-head"><div><p class="eyebrow">你的学习轨迹</p><h2>学习记录</h2><p class="muted">数据保存在当前浏览器，可随时导出备份。</p></div></div>
  <div class="stats-grid">
    <div class="stat-card accent"><span>词语进度</span><b>${overall.percent}<small>%</small></b><p>已完成 ${overall.done} / ${overall.total} 词</p></div>
    <div class="stat-card"><span>生字覆盖</span><b>${chars.percent}<small>%</small></b><p>已掌握 ${chars.done} / ${chars.total} 字</p></div>
    <div class="stat-card"><span>待巩固错题</span><b>${pending.words.length + pending.chars.length}</b><p>错词 ${Object.keys(state.wrongWords).length} · 错字 ${Object.keys(state.wrongChars).length}</p></div>
  </div>
  <section class="panel">
    <div class="section-title"><h3>学段进度</h3><span>共 ${VOCAB.length} 组词语 · ${ALL_CHARS.length} 个生字</span></div>
    <div class="grade-list">${gradeRows}</div>
  </section>
  <div class="stats-grid compact">
    <div class="stat-card"><span>连续学习</span><b>${streak}<small> 天</small></b><p>每天写几个字</p></div>
    <div class="stat-card"><span>累计练习日</span><b>${state.playDays.length}<small> 天</small></b><p>${state.startedAt ? `始于 ${new Date(state.startedAt).toLocaleDateString('zh-CN')}` : '从今天开始'}</p></div>
    <div class="stat-card"><span>错题总量</span><b>${wrongCount(state)}</b><p>已掌握 ${Object.values(state.wrongWords).filter(item => item.retestPassed).length + Object.values(state.wrongChars).filter(item => item.retestPassed).length}</p></div>
  </div>
  <section class="milestone">
    <div class="milestone-icon">✦</div>
    <div><h3>${overall.percent === 100 ? '全部词语已完成！' : '导出你的学习档案'}</h3><p>支持 JSON 备份、CSV 表格和可打印字帖。</p></div>
    <div class="milestone-actions"><button class="secondary" data-action="export-json">JSON</button><button class="secondary" data-action="export-csv">CSV</button><button class="secondary" data-screen="worksheet">打印字帖</button></div>
  </section>
  <p class="danger-zone"><button class="text-btn danger" data-action="reset-data">清空全部学习记录</button></p>`;
}

function worksheetView() {
  const definiteWords = Object.values(state.wrongWords);
  const definiteChars = Object.values(state.wrongChars);
  return `<div class="worksheet-toolbar">
    <button class="secondary" data-screen="mistakes">← 返回错题</button>
    <p>${definiteWords.length} 个错词 · ${definiteChars.length} 个错字</p>
    <button class="primary" data-action="print">打印 / 另存为 PDF</button>
  </div>
  <article class="worksheet" id="worksheet">
    <header class="worksheet-head"><p>义务教育 1—9 年级常用字词</p><h2>错题强化练字帖</h2><div><span>学员：${esc(USER)}</span><span>${new Date().toLocaleDateString('zh-CN')}</span></div></header>
    ${definiteWords.length || definiteChars.length ? `
      ${definiteWords.map(item => worksheetRow(item.word, item.pinyinArr, item.grade, item.explanation)).join('')}
      ${definiteChars.map(item => worksheetRow(item.char, [item.pinyin], item.wordSource ? `出自「${item.wordSource}」` : '单字专项', '')).join('')}
    ` : '<div class="worksheet-empty">暂无错题，字帖内容为空。</div>'}
    <footer class="worksheet-foot">写字时注意笔顺、间架结构与运笔方向。</footer>
  </article>`;
}

function worksheetRow(text, pinyins, note, explanation) {
  const chars = [...text];
  return `<section class="sheet-row">
    <div class="sheet-meta"><span>${esc(text)}</span><small>${esc(note || '')}</small></div>
    <div class="sheet-grids">
      ${chars.map((char, index) => `<div class="sheet-char"><em>${esc(pinyins?.[index] || '')}</em><div class="sheet-box"><span>${esc(char)}</span></div></div>`).join('')}
      <div class="sheet-blank-label">临摹</div>
      ${chars.map((_, index) => `<div class="sheet-char"><em>&nbsp;</em><div class="sheet-box"></div></div>`).join('')}
      ${chars.map((_, index) => `<div class="sheet-char"><em>&nbsp;</em><div class="sheet-box"></div></div>`).join('')}
    </div>
    ${explanation ? `<p class="sheet-note">释义：${esc(explanation)}</p>` : ''}
  </section>`;
}

function modalView() {
  if (!modal) return '';
  const target = correctionTarget();
  if (!target) return '';
  const { chars, pinyins, title } = target;
  const activeChar = chars[modal.charIndex];
  const error = modal.error;

  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="错题订正">
      <header class="modal-head">
        <div><p class="eyebrow">${modal.retest ? '到期复习抽考' : `错题订正 · 连续 ${ROUNDS_REQUIRED} 遍`}</p><h2>${esc(title)}</h2></div>
        <button class="modal-close" data-action="close-modal" aria-label="关闭订正">×</button>
      </header>
      <div class="round-row">
        <span class="round-copy">${modal.retest ? '到期抽考' : `第 ${modal.round} / ${ROUNDS_REQUIRED} 遍`}${chars.length > 1 ? ` · 第 ${modal.charIndex + 1} / ${chars.length} 字` : ''}</span>
        <div class="round-dots">${Array.from({ length: ROUNDS_REQUIRED }, (_, index) => `<i class="${modal.done || index + 1 < modal.round ? 'passed' : index + 1 === modal.round ? 'current' : ''}">${modal.done || index + 1 < modal.round ? '✓' : index + 1}</i>`).join('')}</div>
      </div>
      <section class="demo-strip">
        <span class="demo-label">标准笔顺</span>
        <div class="demo-row">${chars.map((char, index) => `<button class="demo-char ${index === modal.charIndex ? 'active' : ''}" data-demo-index="${index}" title="重播笔顺"><span class="demo-host" data-demo-host="${esc(char)}"></span><em>${esc(char)}</em></button>`).join('')}</div>
      </section>
      ${error ? `<div class="modal-error">${esc(error)}<button class="text-btn" data-action="reset-round">立即重写</button></div>` : ''}
      ${modal.done ? `<div class="modal-success"><div class="success-mark">✓</div><h3>${modal.retest ? '抽考通过' : `连续 ${ROUNDS_REQUIRED} 遍书写正确`}</h3><p>${modal.retest ? '本项书写正确，已安排下一次复习。' : '本项已标记为已掌握，后续会再次安排抽考。'}</p><button class="primary" data-action="finish-modal">完成订正 →</button></div>` : `
        <section class="modal-practice">
          <div class="modal-pinyin">${esc(pinyins[modal.charIndex] || '')}</div>
          <div class="modal-grid-wrap"><div class="tian-grid is-active" data-modal-grid><div class="quiz-host" data-modal-host></div><span class="cross h"></span><span class="cross v"></span><span class="diag d1"></span><span class="diag d2"></span></div></div>
          <p class="modal-instruction">请书写「${esc(activeChar)}」，必须整字全对才算一遍。</p>
          <div class="modal-actions"><button class="secondary" data-action="reset-round">清空本遍</button><button class="secondary" data-action="show-demo">重播笔顺</button></div>
        </section>`}
    </div>
  </div>`;
}

function correctionTarget() {
  if (!modal) return null;
  if (modal.type === 'word') {
    const word = findWord(modal.key);
    if (!word) return null;
    return { chars: word.chars, pinyins: word.pinyinArr, title: word.word };
  }
  const entry = state.wrongChars[modal.key];
  const sourceWord = entry?.wordSource ? findWord(entry.wordSource) : null;
  return {
    chars: [modal.key],
    pinyins: [entry?.pinyin || sourceWord?.pinyinArr?.[0] || ''],
    title: `单字「${modal.key}」`,
  };
}

function setupDemoMounts() {
  document.querySelectorAll('[data-demo-host]').forEach(host => {
    if (host.childElementCount || host.dataset.mounted === '1') return;
    host.dataset.mounted = '1';
    const size = Math.max(52, Math.round(host.closest('.demo-strip')?.getBoundingClientRect().width / 8) || 64);
    const mount = mountDemo(host, host.dataset.demoHost || '', { size });
    mounts.push(mount);
    host.closest('.demo-char').onclick = () => mount.replay();
  });
}

function setupModal(token) {
  if (!modal) return;
  const target = correctionTarget();
  if (!target) return;

  if (modal.done) return;
  const host = document.querySelector('[data-modal-host]');
  if (!host) return;
  const char = target.chars[modal.charIndex];
  const size = Math.max(130, Math.round(host.closest('.modal-grid-wrap').getBoundingClientRect().width || 160));
  const mount = mountQuiz(host, char, {
    size,
    showOutline: false,
    autoStart: true,
    onMistake: () => {
      if (token !== renderToken || modal?.done) return;
      modal.error = '本遍出现笔顺或笔画错误，本遍将从头重写。';
      modal.charIndex = 0;
      render();
    },
    onComplete: data => {
      if (token !== renderToken || modal?.done) return;
      if ((data?.totalMistakes || 0) > 0) {
        modal.error = '本遍有错误，重新开始。';
        modal.charIndex = 0;
        render();
        return;
      }
      if (modal.charIndex < target.chars.length - 1) {
        modal.charIndex += 1;
        modal.error = '';
        render();
        return;
      }
      if (!modal.retest && modal.round < ROUNDS_REQUIRED) {
        modal.round += 1;
        modal.charIndex = 0;
        modal.error = '';
        render();
        return;
      }
      if (modal.retest) {
        if (modal.charIndex < target.chars.length - 1) {
          modal.charIndex += 1;
          modal.error = '';
          render();
          return;
        }
        modal.done = true;
        postponeReview(state, modal.type, modal.key);
        ui.notice = '抽考通过，已安排下一次复习。';
        touchDay(state);
        persist();
        render();
        return;
      }
      modal.done = true;
      recordRound(state, modal.type, modal.key, ROUNDS_REQUIRED);
      if (modal.context === 'review') {
        ui.notice = modal.retest ? '抽考通过，已安排下一次复习。' : '该错题已完成连续三遍订正。';
      }
      touchDay(state);
      persist();
      render();
    },
    onError: error => {
      if (token !== renderToken) return;
      console.warn('订正笔顺数据加载失败，切换自评模式', error);
      if (modal?.done) return;
      const tile = host.closest('.tian-grid');
      if (!tile) return;
      host.remove();
      const fallback = document.createElement('div');
      fallback.className = 'modal-offline';
      fallback.innerHTML = `<canvas class="offline-canvas"></canvas><p>笔顺数据暂不可用，请对照范字自评。</p><div class="modal-actions"><button class="text-btn" data-action="offline-clear">重写</button><button class="mini-primary" data-action="offline-complete">写好了</button></div>`;
      tile.appendChild(fallback);
      const canvas = fallback.querySelector('canvas');
      const rect = tile.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#173330';
      let down = false;
      let drew = false;
      const p = event => {
        const box = canvas.getBoundingClientRect();
        return [event.clientX - box.left, event.clientY - box.top];
      };
      canvas.addEventListener('pointerdown', event => {
        event.preventDefault();
        down = true;
        drew = true;
        const [x, y] = p(event);
        ctx.beginPath();
        ctx.moveTo(x, y);
      });
      canvas.addEventListener('pointermove', event => {
        if (!down) return;
        event.preventDefault();
        const [x, y] = p(event);
        ctx.lineTo(x, y);
        ctx.stroke();
      });
      canvas.addEventListener('pointerup', () => { down = false; });
      canvas.addEventListener('pointercancel', () => { down = false; });
      fallback.querySelector('[data-action="offline-clear"]').onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drew = false;
      };
      fallback.querySelector('[data-action="offline-complete"]').onclick = () => {
        if (!drew) return;
        const finalChar = modal.charIndex >= target.chars.length - 1;
        const finalRound = modal.retest || modal.round >= ROUNDS_REQUIRED;
        if (!finalChar) {
          modal.charIndex += 1;
          modal.error = '';
        } else if (!finalRound) {
          modal.round += 1;
          modal.charIndex = 0;
          modal.error = '';
        } else {
          modal.done = true;
          if (modal.retest) postponeReview(state, modal.type, modal.key);
          else recordRound(state, modal.type, modal.key, ROUNDS_REQUIRED);
          if (modal.context === 'review') ui.notice = modal.retest ? '抽考通过，已安排下一次复习。' : '该错题已完成连续三遍订正。';
          touchDay(state);
          persist();
        }
        render();
      };
    },
  });
  mounts.push(mount);
}

function closeModal() {
  if (!modal) return;
  const context = modal.context;
  modal = null;
  if (context === 'practice') advanceWord();
  ui.notice = '';
  render();
}

function finishModal() {
  if (!modal) return;
  while (modal.queue?.length) {
    const next = modal.queue.shift();
    const item = next.type === 'word' ? state.wrongWords[next.key] : state.wrongChars[next.key];
    if (!item) continue;
    if (!next.retest && item.retestPassed) continue;
    modal = { context: modal.context, type: next.type, key: next.key, round: next.round || 1, charIndex: 0, error: '', done: false, retest: Boolean(next.retest), queue: modal.queue };
    render();
    return;
  }
  const context = modal.context;
  const wasRetest = Boolean(modal.retest);
  modal = null;
  if (context === 'practice') advanceWord();
  ui.notice = context === 'practice'
    ? '错题订正完成，继续下一组。'
    : wasRetest
      ? '抽考通过，已安排下一次复习。'
      : '该错题已完成订正。';
  render();
}

function exportJson() {
  const payload = {
    用户: USER,
    导出时间: new Date().toLocaleString('zh-CN'),
    词语进度: progressFor(state),
    生字覆盖: charProgress(state),
    错词: Object.values(state.wrongWords),
    错字: Object.values(state.wrongChars),
    完整数据: state,
  };
  download(`汉字默写-学习备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function exportCsv() {
  const rows = [['类型', '词语/汉字', '拼音', '年级', '错误次数', '已订正遍数', '掌握状态', '释义/出处']];
  Object.values(state.wrongWords).forEach(item => {
    rows.push(['错词', item.word, item.pinyin, item.grade, item.mistakeCount, item.practiceRoundsDone, item.retestPassed ? '已掌握' : '待巩固', item.explanation || '']);
  });
  Object.values(state.wrongChars).forEach(item => {
    rows.push(['错字', item.char, item.pinyin, '', item.mistakeCount, item.practiceRoundsDone, item.retestPassed ? '已掌握' : '待巩固', item.wordSource || '']);
  });
  if (rows.length === 1) {
    ui.notice = '暂无错题可导出。';
    render();
    return;
  }
  const csv = `\ufeff${rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')}`;
  download(`汉字默写-错题清单-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleAction(action, element) {
  if (!action) return;

  if (action === 'logout') {
    logout();
    modal = null;
    ui.screen = 'login';
    render();
    return;
  }
  if (action === 'speak') {
    const word = currentWord();
    if (word) speak(word.word);
    return;
  }
  if (action === 'next' || action === 'skip') {
    advanceWord();
    ui.notice = '';
    render();
    return;
  }
  if (action === 'giveup') {
    const word = currentWord();
    if (!word || modal) return;
    recordWordResult(state, word, { wholeWord: true });
    touchDay(state);
    persist();
    modal = { context: 'practice', type: 'word', key: word.id, round: 1, charIndex: 0, error: '', done: false };
    render();
    return;
  }
  if (action === 'hint') {
    ui.hint = !ui.hint;
    if (ui.screen === 'practice') {
      const tile = document.querySelector(`[data-char-box="${practice.activeIndex}"]`);
      tile?.querySelector('.ghost')?.classList.toggle('visible', ui.hint);
      const hintButton = document.querySelector('[data-action="hint"]');
      if (hintButton) hintButton.textContent = ui.hint ? '隐藏提示' : '看提示';
      activeQuizMount?.setOutline(ui.hint);
      return;
    }
    render();
    return;
  }
  if (action === 'clear-word') {
    ensurePractice();
    practice.statuses = practice.statuses.map(() => ({ done: false, mistakes: 0, offline: false }));
    practice.activeIndex = 0;
    ui.hint = false;
    render();
    return;
  }
  if (action === 'correct') {
    const type = element.dataset.type;
    const key = element.dataset.key;
    const item = type === 'word' ? state.wrongWords[key] : state.wrongChars[key];
    const baseRounds = item?.retestPassed ? 0 : Math.min(item?.practiceRoundsDone || 0, ROUNDS_REQUIRED - 1);
    modal = {
      context: 'review',
      type,
      key,
      round: baseRounds + 1,
      charIndex: 0,
      error: '',
      done: false,
      baseRounds,
    };
    render();
    return;
  }
  if (action === 'review-all') {
    const pending = pendingMistakes(state);
    const queue = [
      ...pending.words.map(item => ({ type: 'word', key: item.id, round: Math.min(item.practiceRoundsDone || 0, ROUNDS_REQUIRED - 1) + 1 })),
      ...pending.chars.map(item => ({ type: 'char', key: item.char, round: Math.min(item.practiceRoundsDone || 0, ROUNDS_REQUIRED - 1) + 1 })),
    ];
    if (!queue.length) {
      ui.notice = '当前没有待巩固的错题。';
      render();
      return;
    }
    const first = queue.shift();
    modal = {
      context: 'review',
      type: first.type,
      key: first.key,
      round: first.round,
      charIndex: 0,
      error: '',
      done: false,
      queue,
    };
    render();
    return;
  }
  if (action === 'review-due') {
    const due = dueReviews(state).map(entry => ({
      type: entry.type,
      key: entry.key,
      round: 1,
      retest: true,
    }));
    if (!due.length) {
      ui.notice = '当前没有到期的复习项。';
      render();
      return;
    }
    const first = due.shift();
    modal = {
      context: 'review',
      type: first.type,
      key: first.key,
      round: first.round,
      charIndex: 0,
      error: '',
      done: false,
      retest: true,
      queue: due,
    };
    render();
    return;
  }
  if (action === 'remove-mistake') {
    removeMistake(state, element.dataset.type, element.dataset.key);
    if (element.dataset.type === 'word') {
      const word = findWord(element.dataset.key);
      word?.chars.forEach(char => {
        const item = state.wrongChars[char];
        if (item && item.wordSource === word.word && !item.retestPassed) {
          item.practiceRoundsDone = ROUNDS_REQUIRED;
          item.retestPassed = true;
        }
      });
    }
    persist();
    render();
    return;
  }
  if (action === 'close-modal') {
    closeModal();
    return;
  }
  if (action === 'finish-modal') {
    finishModal();
    return;
  }
  if (action === 'reset-round' || action === 'show-demo') {
    if (action === 'show-demo') {
      document.querySelectorAll('[data-demo-host]').forEach(host => host.closest('.demo-char')?.click());
      return;
    }
    modal.error = '';
    modal.charIndex = 0;
    render();
    return;
  }
  if (action === 'export-json') {
    exportJson();
    return;
  }
  if (action === 'export-csv') {
    exportCsv();
    return;
  }
  if (action === 'print') {
    window.print();
    return;
  }
  if (action === 'reset-data') {
    if (window.confirm('确定清空全部学习进度、错题与统计数据吗？此操作不可撤销。')) {
      state = clearProgress();
      practice = { activeIndex: 0, statuses: [], wordId: null };
      modal = null;
      ui.notice = '学习记录已清空。';
      render();
    }
  }
}

function bind() {
  const loginForm = document.querySelector('#login-form');
  if (loginForm) {
    loginForm.onsubmit = event => {
      event.preventDefault();
      const username = document.querySelector('#user').value.trim();
      const password = document.querySelector('#pass').value;
      if (!login(username, password)) {
        document.querySelector('#login-error').textContent = '用户名或密码不正确，请重试';
        return;
      }
      state = loadState();
      touchDay(state);
      persist();
      practice = { activeIndex: 0, statuses: [], wordId: null };
      ui.screen = 'practice';
      ui.notice = '';
      render();
    };
  }

  const search = document.querySelector('#mistake-search');
  if (search) {
    search.onchange = event => {
      ui.search = event.target.value;
      render();
    };
  }

  app.onclick = event => {
    const screenButton = event.target.closest('[data-screen]');
    if (screenButton) {
      ui.screen = screenButton.dataset.screen;
      ui.notice = '';
      modal = null;
      render();
      return;
    }

    const gradeButton = event.target.closest('[data-grade]');
    if (gradeButton) {
      state.gradeFilter = gradeButton.dataset.grade;
      state.currentIndex = 0;
      practice = { activeIndex: 0, statuses: [], wordId: null };
      ui.hint = false;
      persist();
      render();
      return;
    }

    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
      ui.mistakeFilter = filterButton.dataset.filter;
      render();
      return;
    }

    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    if (actionElement.classList.contains('offline-actions') || actionElement.closest('.offline-actions')) return;

    const action = actionElement.dataset.action;
    if (action === 'offline-redo' || action === 'offline-done' || action === 'offline-clear' || action === 'offline-complete') return;

    if (action === 'close-modal' && actionElement.classList.contains('modal-backdrop') && event.target !== actionElement) return;

    handleAction(action, actionElement);
  };
}

render();
