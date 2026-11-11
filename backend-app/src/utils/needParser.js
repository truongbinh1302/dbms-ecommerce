const { foldText } = require('./searchText');

/*
  Đọc nhu cầu khách gõ bằng lời ("học CNTT, code Docker, tầm 20 triệu") thành một nhu cầu có sẵn
  của Build PC và ngân sách. Chỉ dò từ khoá, không đoán: không nhận ra thì trả null để khách tự chọn.
  Giá và linh kiện luôn lấy từ kho (autoBuild), nên câu trả lời không có con số tự bịa.
*/

// Từ khoá đã bỏ dấu cho từng nhu cầu. Nhu cầu nặng hơn đứng trước để thắng khi bằng điểm.
const PRESET_KEYWORDS = [
  ['ai-local', ['ai', 'llm', 'ollama', 'lm studio', 'stable diffusion', 'comfyui', 'mo hinh ai', 'tri tue nhan tao', 'machine learning', 'deep learning', 'hoc may', 'cuda', 'pytorch', 'tensorflow', 'chatbot']],
  ['do-hoa-3d', ['blender', '3d', 'render', 'dung phim', 'dung video', 'edit video', 'chinh sua video', 'premiere', 'davinci', 'after effects', 'autocad', 'revit', 'sketchup', 'do hoa']],
  ['lap-trinh-android', ['android', 'android studio', 'flutter', 'kotlin', 'react native', 'mobile', 'app di dong', 'gradle']],
  ['lap-trinh-web', ['web', 'docker', 'lap trinh', 'code', 'coding', 'dev', 'developer', 'react', 'node', 'nodejs', 'backend', 'frontend', 'java', 'python', 'golang', 'cntt', 'cong nghe thong tin', 'nganh it', 'sinh vien it', 'dan it', 'database', 'sql', 'kubernetes', 'vs code', 'vscode']],
  ['van-phong-hoc-tap', ['van phong', 'office', 'word', 'excel', 'powerpoint', 'hoc online', 'hoc tap', 'hoc truc tuyen', 'ke toan', 'xem phim', 'luot web', 'zoom', 'google meet']],
];

const GAMING_KEYWORDS = ['game', 'gaming', 'choi game', 'esport', 'fps', 'valorant', 'lol', 'lien minh', 'pubg', 'cs2', 'gta'];

const hasPhrase = (folded, phrase) => ` ${folded} `.includes(` ${phrase} `);

/** Nhu cầu khớp nhiều từ khoá nhất; bằng điểm thì nhu cầu nặng hơn. null nếu không khớp từ nào. */
const matchPreset = (text) => {
  const folded = foldText(text);
  let best = null;
  for (const [presetId, keywords] of PRESET_KEYWORDS) {
    const matched = keywords.filter((keyword) => hasPhrase(folded, keyword));
    if (matched.length && (!best || matched.length > best.matched.length)) best = { presetId, matched };
  }
  return best;
};

const mentionsGaming = (text) => {
  const folded = foldText(text);
  return GAMING_KEYWORDS.some((keyword) => hasPhrase(folded, keyword));
};

const MIN_BUDGET = 3000000;
const MAX_BUDGET = 500000000;

// Bỏ dấu nhưng giữ chữ số, dấu chấm, phẩy và gạch để đọc "20,5 triệu", "15-20tr", "20.000.000đ".
const looseFold = (text) => String(text || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase();

const decimal = (value) => Number(String(value).replace(',', '.'));
const MILLION_UNIT = '(?:trieu|tr|cu|m)(?![a-z])';

/** Ngân sách (đồng) trong câu khách gõ; khoảng "15-20 triệu" lấy mức trên. null nếu không có hoặc vô lý. */
const parseBudget = (text) => {
  const value = looseFold(text);
  let amount = null;

  const range = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${MILLION_UNIT})?\\s*(?:-|den|toi|~)\\s*(\\d+(?:[.,]\\d+)?)\\s*${MILLION_UNIT}`).exec(value);
  const compact = new RegExp(`(\\d+)\\s*(?:trieu|tr|cu)(\\d)(?![\\d.,])`).exec(value); // "25tr5" = 25,5 triệu
  const millions = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${MILLION_UNIT}`).exec(value);
  const grouped = /(\d{1,3}(?:[.,]\d{3}){2,})(?!\d)/.exec(value);
  const plain = /(?<![\d.,])(\d{7,9})(?![\d.,])/.exec(value);

  if (range) amount = decimal(range[2]) * 1e6;
  else if (compact) amount = (Number(compact[1]) + Number(compact[2]) / 10) * 1e6;
  else if (millions) amount = decimal(millions[1]) * 1e6;
  else if (grouped) amount = Number(grouped[1].replace(/[.,]/g, ''));
  else if (plain) amount = Number(plain[1]);

  if (!Number.isFinite(amount) || amount < MIN_BUDGET || amount > MAX_BUDGET) return null;
  return Math.round(amount);
};

module.exports = { PRESET_KEYWORDS, matchPreset, mentionsGaming, parseBudget };
