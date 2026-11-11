const test = require('node:test');
const assert = require('node:assert/strict');
const { matchPreset, mentionsGaming, parseBudget } = require('../../src/utils/needParser');

test('ngân sách: các cách viết thường gặp', () => {
  const cases = [
    ['tầm 20 triệu', 20000000],
    ['ngân sách 20tr', 20000000],
    ['khoảng 25tr5 thôi', 25500000],
    ['20,5 triệu', 20500000],
    ['15-20 triệu', 20000000],
    ['15 đến 18tr', 18000000],
    ['30 củ', 30000000],
    ['budget 12m', 12000000],
    ['tối đa 20.000.000đ', 20000000],
    ['22000000 vnd', 22000000],
  ];
  for (const [text, expected] of cases) assert.equal(parseBudget(text), expected, text);
});

test('ngân sách: không nhầm thông số linh kiện thành tiền', () => {
  for (const text of ['RAM 32GB, SSD 1TB', 'màn 27 inch 144Hz', 'quạt 120mm', 'core i5-12400', '3 màn hình', '2 triệu', 'máy 1 tỷ']) {
    assert.equal(parseBudget(text), null, text);
  }
});

test('nhu cầu: dò từ khoá, nhu cầu nặng hơn thắng khi bằng điểm', () => {
  assert.equal(matchPreset('Sinh viên CNTT, code web và chạy Docker').presetId, 'lap-trinh-web');
  assert.equal(matchPreset('lập trình Android bằng Flutter').presetId, 'lap-trinh-android');
  assert.equal(matchPreset('Muốn chạy Stable Diffusion với Ollama').presetId, 'ai-local');
  assert.equal(matchPreset('lập trình AI').presetId, 'ai-local');
  assert.equal(matchPreset('Dựng video bằng DaVinci, render Blender').presetId, 'do-hoa-3d');
  assert.equal(matchPreset('làm văn phòng, Word Excel, lướt web xem phim').presetId, 'van-phong-hoc-tap');
  assert.deepEqual(matchPreset('code web, docker').matched, ['web', 'docker', 'code']);
  assert.equal(matchPreset('ít tiền thôi'), null, '"ít" không phải ngành IT');
  assert.equal(matchPreset('máy đẹp, êm'), null);
});

test('nhận ra khi khách nói về chơi game', () => {
  assert.equal(mentionsGaming('chơi game Valorant'), true);
  assert.equal(mentionsGaming('code Docker'), false);
});

const { displayName, validateQuestion } = require('../../src/services/question.service');

test('hỏi đáp: chỉ hiện tên gọi của người hỏi, câu hỏi đủ dài', () => {
  assert.equal(displayName('Trương Hữu Quốc Gia Bình'), 'Bình');
  assert.equal(displayName('   '), 'Khách hàng');
  assert.equal(validateQuestion('  Card này   lắp được case\n\n\n\nmini-ITX không?  '), 'Card này lắp được case\n\nmini-ITX không?');
  assert.throws(() => validateQuestion('còn ko?'), /ít nhất 10 ký tự/);
});
