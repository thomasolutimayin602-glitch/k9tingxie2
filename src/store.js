import { ALL_CHARS, ALL_CHAR_SET, VOCAB, findWord, wordsFor } from './data.js';

const LEGACY_STORE = 'hanzi-data-gamer';
const STORE_PREFIX = 'hanzi-memo-v2:';
const SESSION = 'hanzi-session';
const MAX_ROUNDS = 3;

export const USER = 'gamer';
export const PASS = 'Diffraction1';
export const ROUNDS_REQUIRED = MAX_ROUNDS;

const now = () => Date.now();

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyState() {
  return {
    version: 2,
    completedWordIds: [],
    masteredChars: [],
    wrongWords: {},
    wrongChars: {},
    currentIndex: 0,
    gradeFilter: 'all',
    startedAt: null,
    lastActiveAt: null,
    reviewQueue: [],
    playDays: [],
  };
}

function normalizeState(raw) {
  const initial = emptyState();
  if (!raw || typeof raw !== 'object') return initial;

  const completedWordIds = Array.isArray(raw.completedWordIds)
    ? raw.completedWordIds
    : Array.isArray(raw.completed)
      ? raw.completed.map(item => findWord(item)?.id).filter(Boolean)
      : [];

  const wrongWords = {};
  if (raw.wrongWords && typeof raw.wrongWords === 'object') {
    Object.entries(raw.wrongWords).forEach(([key, value]) => {
      const word = findWord(key);
      if (!word) return;
      const rounds = typeof value === 'number' ? 0 : (value.practiceRoundsDone || 0);
      wrongWords[word.id] = {
        id: word.id,
        word: word.word,
        pinyin: word.pinyin,
        pinyinArr: word.pinyinArr,
        grade: word.grade,
        gradeKey: word.gradeKey,
        explanation: word.explanation,
        mistakeCount: typeof value === 'number' ? value : (value.mistakeCount || 0),
        practiceRoundsDone: rounds,
        retestPassed: typeof value === 'object' ? Boolean(value.retestPassed) : false,
        lastFailedAt: typeof value === 'object' ? (value.lastFailedAt || now()) : now(),
      };
    });
  }

  const wrongChars = {};
  if (raw.wrongChars && typeof raw.wrongChars === 'object') {
    Object.entries(raw.wrongChars).forEach(([char, value]) => {
      if (!ALL_CHAR_SET.has(char)) return;
      const rounds = typeof value === 'number' ? 0 : (value.practiceRoundsDone || 0);
      wrongChars[char] = {
        char,
        pinyin: typeof value === 'object' ? (value.pinyin || '') : '',
        wordSource: typeof value === 'object' ? (value.wordSource || '') : '',
        mistakeCount: typeof value === 'number' ? value : (value.mistakeCount || 0),
        practiceRoundsDone: rounds,
        retestPassed: typeof value === 'object' ? Boolean(value.retestPassed) : false,
        lastFailedAt: typeof value === 'object' ? (value.lastFailedAt || now()) : now(),
      };
    });
  }

  const masteredChars = Array.isArray(raw.masteredChars)
    ? raw.masteredChars.filter(char => ALL_CHAR_SET.has(char))
    : [];

  const gradeFilter = ['all', 'g1-2', 'g3-4', 'g5-6', 'g7-9'].includes(raw.gradeFilter)
    ? raw.gradeFilter
    : 'all';
  const scoped = wordsFor(gradeFilter);
  const currentIndex = Math.min(Math.max(0, Number(raw.currentIndex) || 0), Math.max(0, scoped.length - 1));

  return {
    ...initial,
    completedWordIds: [...new Set(completedWordIds)],
    masteredChars: [...new Set(masteredChars)],
    wrongWords,
    wrongChars,
    currentIndex,
    gradeFilter,
    startedAt: raw.startedAt || raw.started || null,
    lastActiveAt: raw.lastActiveAt || null,
    reviewQueue: Array.isArray(raw.reviewQueue) ? raw.reviewQueue : [],
    playDays: Array.isArray(raw.playDays) ? [...new Set(raw.playDays)] : [],
  };
}

function storageKey(username) {
  return `${STORE_PREFIX}${username}`;
}

export function isLoggedIn() {
  return localStorage.getItem(SESSION) === '1';
}

export function login(username, password) {
  if (username !== USER || password !== PASS) return false;
  localStorage.setItem(SESSION, '1');
  return true;
}

export function logout() {
  localStorage.removeItem(SESSION);
}

export function loadState(username = USER) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(username)));
    if (stored) return normalizeState(stored);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE));
    const migrated = normalizeState(legacy);
    if (legacy) saveState(migrated, username);
    return migrated;
  } catch {
    return emptyState();
  }
}

export function saveState(state, username = USER) {
  localStorage.setItem(storageKey(username), JSON.stringify(state));
}

export function touchDay(state) {
  const today = localDay();
  state.startedAt ||= new Date().toISOString();
  state.lastActiveAt = new Date().toISOString();
  if (!state.playDays.includes(today)) state.playDays.push(today);
}

export function recordWordResult(state, word, result) {
  const { failedIndexes = [], wholeWord = false } = result;

  if (wholeWord) {
    addWrongWord(state, word);
    word.chars.forEach((_, index) => addWrongChar(state, word, index));
    return false;
  }

  if (failedIndexes.length > 0) {
    const failed = new Set(failedIndexes);
    const passed = word.chars.filter((_, index) => !failed.has(index));
    state.masteredChars = [...new Set([...state.masteredChars, ...passed])];
    failedIndexes.forEach(index => addWrongChar(state, word, index));
    return false;
  }

  state.completedWordIds = [...new Set([...state.completedWordIds, word.id])];
  state.masteredChars = [...new Set([...state.masteredChars, ...word.chars])];
  return true;
}

export function addWrongWord(state, word) {
  const existing = state.wrongWords[word.id];
  state.wrongWords[word.id] = {
    id: word.id,
    word: word.word,
    pinyin: word.pinyin,
    pinyinArr: word.pinyinArr,
    grade: word.grade,
    gradeKey: word.gradeKey,
    explanation: word.explanation,
    mistakeCount: (existing?.mistakeCount || 0) + 1,
    practiceRoundsDone: 0,
    retestPassed: false,
    lastFailedAt: now(),
  };
}

export function addWrongChar(state, word, index) {
  const char = word.chars[index];
  if (!char || !ALL_CHAR_SET.has(char)) return;
  const existing = state.wrongChars[char];
  state.wrongChars[char] = {
    char,
    pinyin: word.pinyinArr[index] || '',
    wordSource: word.word,
    mistakeCount: (existing?.mistakeCount || 0) + 1,
    practiceRoundsDone: 0,
    retestPassed: false,
    lastFailedAt: now(),
  };
}

export function recordRound(state, type, key, rounds) {
  const collection = type === 'word' ? state.wrongWords : state.wrongChars;
  const item = collection[key];
  if (!item) return;
  item.practiceRoundsDone = Math.max(item.practiceRoundsDone, rounds);
  if (rounds >= ROUNDS_REQUIRED) {
    const firstPass = !item.retestPassed;
    item.retestPassed = true;
    if (type === 'word' && firstPass) {
      const word = findWord(key);
      if (word) {
        state.completedWordIds = [...new Set([...state.completedWordIds, word.id])];
        state.masteredChars = [...new Set([...state.masteredChars, ...word.chars])];
        word.chars.forEach(char => {
          const charItem = state.wrongChars[char];
          if (!charItem || charItem.wordSource !== word.word) return;
          charItem.practiceRoundsDone = ROUNDS_REQUIRED;
          charItem.retestPassed = true;
        });
      }
    } else if (firstPass) {
      state.masteredChars = [...new Set([...state.masteredChars, key])];
    }
    const dueAt = now() + 86_400_000;
    const existing = state.reviewQueue.find(entry => entry.type === type && entry.key === key);
    if (existing) existing.dueAt = dueAt;
    else state.reviewQueue.push({ type, key, dueAt });
  }
}

export function dueReviews(state, at = now()) {
  return state.reviewQueue.filter(entry => {
    if (entry.dueAt > at) return false;
    return entry.type === 'word' ? Boolean(state.wrongWords[entry.key]) : Boolean(state.wrongChars[entry.key]);
  });
}

export function postponeReview(state, type, key, delay = 86_400_000) {
  const entry = state.reviewQueue.find(item => item.type === type && item.key === key);
  if (entry) entry.dueAt = now() + delay;
  return Boolean(entry);
}

export function removeMistake(state, type, key) {
  if (type === 'word') delete state.wrongWords[key];
  else delete state.wrongChars[key];
  state.reviewQueue = state.reviewQueue.filter(entry => !(entry.type === type && entry.key === key));
}

export function progressFor(state, scope = 'all') {
  const words = wordsFor(scope);
  const done = words.filter(word => state.completedWordIds.includes(word.id)).length;
  return {
    total: words.length,
    done,
    percent: words.length ? Math.round((done / words.length) * 100) : 0,
  };
}

export function charProgress(state, scope = 'all') {
  const chars = scope === 'all'
    ? ALL_CHARS
    : [...new Set(wordsFor(scope).flatMap(word => word.chars))];
  const done = chars.filter(char => state.masteredChars.includes(char)).length;
  return { total: chars.length, done, percent: chars.length ? Math.round((done / chars.length) * 100) : 0 };
}

export function pendingMistakes(state) {
  return {
    words: Object.values(state.wrongWords).filter(item => !item.retestPassed),
    chars: Object.values(state.wrongChars).filter(item => !item.retestPassed),
  };
}

export function wrongCount(state) {
  return Object.keys(state.wrongWords).length + Object.keys(state.wrongChars).length;
}

export function totalVocab() {
  return VOCAB.length;
}

export function clearProgress() {
  const state = emptyState();
  saveState(state);
  return state;
}
