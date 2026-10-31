import HanziWriter from './vendor/hanzi-writer.esm.js';

const DATA_VERSION = '2.0.1';
const BASE_URL = import.meta.env.BASE_URL;
const charDataCache = new Map();
const CDN_SOURCES = char => [
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@${DATA_VERSION}/${encodeURIComponent(char)}.json`,
  `https://fastly.jsdelivr.net/npm/hanzi-writer-data@${DATA_VERSION}/${encodeURIComponent(char)}.json`,
  `https://unpkg.com/hanzi-writer-data@${DATA_VERSION}/${encodeURIComponent(char)}.json`,
];

async function fetchWithTimeout(url, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function loadCharData(char) {
  if (!charDataCache.has(char)) {
    const request = (async () => {
      try {
        const local = await fetchWithTimeout(`${BASE_URL}hanzi-data/${encodeURIComponent(char)}.json`, 1800);
        if (local?.medians?.length) return local;
      } catch {}

      const remote = await Promise.any(CDN_SOURCES(char).map(url => (
        fetchWithTimeout(url, 4500).then(data => {
          if (!data?.medians?.length) throw new Error('missing medians');
          return data;
        })
      )));
      if (remote?.medians?.length) return remote;
      throw new Error(`无法加载「${char}」的笔顺数据`);
    })();
    charDataCache.set(char, request);
    request.catch(() => charDataCache.delete(char));
  }
  return charDataCache.get(char);
}

function baseOptions(size, showOutline) {
  return {
    width: size,
    height: size,
    padding: Math.max(3, Math.round(size * 0.05)),
    renderer: 'svg',
    showCharacter: false,
    showOutline,
    strokeColor: '#173330',
    outlineColor: '#d9e4dc',
    highlightColor: '#4f9d8e',
    highlightCompleteColor: '#4f9d8e',
    drawingColor: '#173330',
    drawingWidth: Math.max(5, Math.round(size * 0.07)),
    strokeWidth: 3,
    outlineWidth: 2,
    strokeAnimationSpeed: 1,
    delayBetweenStrokes: 180,
    strokeHighlightSpeed: 2,
    highlightOnComplete: true,
    showHintAfterMisses: 3,
    leniency: 1.35,
    charDataLoader: (character, onLoad, onError) => {
      loadCharData(character).then(onLoad).catch(onError);
    },
  };
}

export function mountQuiz(container, character, options = {}) {
  const {
    size = 140,
    showOutline = false,
    autoStart = true,
    onMistake,
    onComplete,
    onError,
  } = options;

  let writer;
  let started = false;
  let destroyed = false;
  let quizOptions = {};

  const start = () => {
    if (!writer || started || destroyed || !autoStart) return;
    started = true;
    writer.quiz(quizOptions).catch(error => {
      if (!destroyed) onError?.(error);
    });
  };

  container.innerHTML = '';
  container.classList.add('is-loading');
  try {
    writer = HanziWriter.create(container, character, {
      ...baseOptions(size, showOutline),
      onLoadCharDataSuccess: () => {
        container.classList.remove('is-loading');
        start();
      },
      onLoadCharDataError: error => {
        container.classList.remove('is-loading');
        if (!destroyed) onError?.(error);
      },
    });

    quizOptions = {
      onMistake: data => onMistake?.(data),
      onComplete: data => onComplete?.(data),
      onCorrectStroke: () => {},
      showHintAfterMisses: 3,
      highlightOnComplete: false,
      leniency: 1.35,
    };

    if (!autoStart) started = true;
  } catch (error) {
    container.classList.remove('is-loading');
    onError?.(error);
  }

  return {
    startQuiz() {
      if (started && writer) {
        writer.cancelQuiz();
        writer.quiz(quizOptions).catch(error => {
          if (!destroyed) onError?.(error);
        });
        return;
      }
      started = false;
      start();
    },
    restartQuiz() {
      if (!writer || destroyed) return;
      started = true;
      writer.cancelQuiz();
      writer.quiz(quizOptions).catch(error => {
        if (!destroyed) onError?.(error);
      });
    },
    setOutline(visible) {
      if (!writer || destroyed) return;
      if (visible) writer.showOutline({ duration: 160 });
      else writer.hideOutline({ duration: 160 });
    },
    destroy() {
      destroyed = true;
      try { writer?.cancelQuiz(); } catch {}
    },
  };
}

export function mountDemo(container, character, options = {}) {
  const { size = 84 } = options;
  container.innerHTML = '';
  try {
    const writer = HanziWriter.create(container, character, {
      ...baseOptions(size, false),
      showCharacter: true,
      showOutline: false,
      strokeColor: '#173330',
      delayBetweenStrokes: 260,
      strokeAnimationSpeed: 1.1,
      charDataLoader: (char, onLoad, onError) => {
        loadCharData(char).then(onLoad).catch(onError);
      },
    });

    const animate = () => writer.animateCharacter().catch(() => {});
    writer._withDataPromise?.then(animate).catch(() => {});

    return {
      replay: animate,
      destroy() {
        try { writer.cancelQuiz(); } catch {}
      },
    };
  } catch {
    return { replay() {}, destroy() {} };
  }
}
