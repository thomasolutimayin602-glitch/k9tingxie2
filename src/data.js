import vocabulary from './data/vocabulary.json';

const GRADE_LABELS = {
  '1-2': '小学低段（1-2年级）',
  '3-4': '小学中段（3-4年级）',
  '5-6': '小学高段（5-6年级）',
  '7-9': '初中阶段（7-9年级）',
};

const CURATED = [
  ['春天', 'chūn tiān', '1-2', '四季之首，万物复苏的季节。'],
  ['太阳', 'tài yáng', '1-2', '太阳系的中心天体，地球的光和热来源。'],
  ['朋友', 'péng you', '1-2', '彼此有交情、互相帮助的人。'],
  ['学校', 'xué xiào', '1-2', '供学生学习、接受教育的场所。'],
  ['美丽', 'měi lì', '1-2', '好看、漂亮，让人感到愉悦。'],
  ['国家', 'guó jiā', '3-4', '拥有领土、人民和主权的政治共同体。'],
  ['诚实', 'chéng shí', '3-4', '言行真实，不欺骗别人。'],
  ['勇敢', 'yǒng gǎn', '3-4', '有胆量，不怕困难和危险。'],
  ['发现', 'fā xiàn', '3-4', '经过探索或观察，找到原先不知道的事物。'],
  ['帮助', 'bāng zhù', '3-4', '给别人出力或提供支持。'],
  ['森林', 'sēn lín', '3-4', '大片生长的树木，是许多生物的家园。'],
  ['海洋', 'hǎi yáng', '3-4', '地球表面广阔的咸水水域。'],
  ['奇妙', 'qí miào', '5-6', '新奇而美妙，令人感到惊奇。'],
  ['温暖', 'wēn nuǎn', '5-6', '不冷不热，也指使人感到亲切。'],
  ['尊重', 'zūn zhòng', '5-6', '重视并以礼相待。'],
  ['责任', 'zé rèn', '5-6', '应当承担的事情和应尽的义务。'],
  ['坚持', 'jiān chí', '5-6', '坚定地持续做一件事，不轻易放弃。'],
  ['智慧', 'zhì huì', '5-6', '辨析、判断和创造的能力。'],
  ['灿烂', 'càn làn', '5-6', '光彩鲜明耀眼。'],
  ['规则', 'guī zé', '5-6', '共同遵守的规章和准则。'],
  ['匆匆忙忙', 'cōng cōng máng máng', '7-9', '形容做事急急忙忙、没有从容的时间。'],
  ['翻山越岭', 'fān shān yuè lǐng', '7-9', '翻过山岭，形容旅途辛苦。'],
  ['专心致志', 'zhuān xīn zhì zhì', '7-9', '一心一意，集中精神做事。'],
  ['焕然一新', 'huàn rán yī xīn', '7-9', '改变旧面貌，呈现出崭新的样子。'],
  ['举世闻名', 'jǔ shì wén míng', '7-9', '全世界都知道，形容名声极大。'],
  ['迫不及待', 'pò bù jí dài', '7-9', '急迫得不能再等待。'],
  ['锲而不舍', 'qiè ér bù shě', '7-9', '不停地雕刻，比喻有恒心、有毅力。'],
  ['孜孜不倦', 'zī zī bù juàn', '7-9', '勤奋努力，不知疲倦。'],
  ['浮光掠影', 'fú guāng lüè yǐng', '7-9', '比喻观察不细致或印象不深刻。'],
  ['震耳欲聋', 'zhèn ěr yù lóng', '7-9', '声音很大，震得耳朵都快聋了。'],
  ['自相矛盾', 'zì xiāng máo dùn', '7-9', '言行前后抵触，不能自圆其说。'],
  ['因地制宜', 'yīn dì zhì yí', '7-9', '根据各地具体情况制定适宜的办法。'],
];

const CURATED_WORDS = CURATED.map(([word, pinyin, gradeKey, explanation], index) => ({
  id: `curated-${String(index + 1).padStart(3, '0')}`,
  word,
  pinyin,
  pinyinArr: pinyin.split(/\s+/),
  chars: [...word],
  grade: GRADE_LABELS[gradeKey],
  gradeKey: `g${gradeKey}`,
  type: word.length === 4 ? '成语 (4字)' : `${word.length}字词`,
  explanation,
  newChars: [...word],
}));

const curatedTexts = new Set(CURATED_WORDS.map(item => item.word));

export const VOCAB = [
  ...CURATED_WORDS,
  ...vocabulary.filter(item => !curatedTexts.has(item.word)),
];

export const GRADES = [
  { key: 'all', label: '全部', short: '全部' },
  { key: 'g1-2', label: '1–2 年级', short: '低段' },
  { key: 'g3-4', label: '3–4 年级', short: '中段' },
  { key: 'g5-6', label: '5–6 年级', short: '高段' },
  { key: 'g7-9', label: '7–9 年级', short: '初中' },
];

export const GRADE_BY_KEY = Object.fromEntries(GRADES.map(grade => [grade.key, grade]));
export const WORDS_BY_ID = new Map(VOCAB.map(word => [word.id, word]));
export const WORDS_BY_TEXT = new Map(VOCAB.map(word => [word.word, word]));
export const ALL_CHARS = [...new Set(VOCAB.flatMap(word => word.chars))];
export const ALL_CHAR_SET = new Set(ALL_CHARS);

export function wordsFor(gradeKey = 'all') {
  return gradeKey === 'all' ? VOCAB : VOCAB.filter(word => word.gradeKey === gradeKey);
}

export function findWord(value) {
  return WORDS_BY_ID.get(value) || WORDS_BY_TEXT.get(value) || null;
}

export function wordPinyin(word, index) {
  return word?.pinyinArr?.[index] || '';
}

export function gradeLabel(key) {
  return GRADE_BY_KEY[key]?.label || key || '';
}

export function isKnownChar(char) {
  return ALL_CHAR_SET.has(char);
}
