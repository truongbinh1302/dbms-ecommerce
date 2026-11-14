/*
  Hàm thuần cho việc thêm ảnh sản phẩm hàng loạt (scripts/import-product-images.js):
  đọc tên file theo mã sản phẩm, nhận dạng loại ảnh từ nội dung file, quyết định có thay ảnh đang có không,
  gợi ý mã gần đúng khi gõ sai tên file.
*/

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // cùng giới hạn với ô tải ảnh ở trang quản trị
const MAX_IMAGES_PER_PRODUCT = 6;
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const ILLUSTRATION_PREFIX = '/images/products/';

/**
 * Tên file → mã sản phẩm và thứ tự ảnh.
 * "amd-ryzen-7-9700x.jpg" → ảnh 1; "amd-ryzen-7-9700x-2.jpg" hoặc "amd-ryzen-7-9700x (2).jpg" → ảnh 2.
 * Trả null nếu không phải file ảnh. Mã giữ nguyên dạng chữ thường để so khớp với Slug.
 */
const parseImageFileName = (fileName) => {
  const match = /^(.+)\.([a-z0-9]+)$/i.exec(String(fileName).trim());
  if (!match) return null;
  const extension = match[2].toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  const fullSlug = match[1].trim().toLowerCase().replace(/\s+/g, '-');
  let base = fullSlug;
  let order = 1;
  const numbered = /^(.*?)(?:-|\s*\()(\d{1,2})\)?$/.exec(base);
  // "-2".."-6" là thứ tự ảnh; số khác (ví dụ "-5600" trong mã RAM) là một phần của mã.
  if (numbered && Number(numbered[2]) >= 2 && Number(numbered[2]) <= MAX_IMAGES_PER_PRODUCT && numbered[1]) {
    base = numbered[1].replace(/-+$/, '');
    order = Number(numbered[2]);
  }
  // fullSlug: cả tên (khi mã sản phẩm tự kết thúc bằng -2..-6 thì dùng mã này).
  return { slug: base, order, fullSlug, extension: extension === 'jpeg' ? 'jpg' : extension };
};

/** Loại ảnh theo vài byte đầu file (không tin phần đuôi tên file). null nếu không phải ảnh hỗ trợ. */
const detectImageType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
};

const parseImages = (raw) => {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
};

/**
 * Có thay ảnh hiện tại không: chưa có ảnh hoặc chỉ có ảnh minh hoạ thì thay;
 * đã có ảnh do quản trị tải lên thì giữ, trừ khi chạy với --ghi-de.
 */
const shouldReplaceImages = (currentImages, { force = false } = {}) => {
  const images = parseImages(currentImages);
  if (force || images.length === 0) return true;
  return images.every((url) => url.startsWith(ILLUSTRATION_PREFIX));
};

const editDistance = (a, b) => {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
};

/** Mã gần nhất cho tên file gõ sai (khác tối đa khoảng 1/4 độ dài), null nếu không có mã nào đủ gần. */
const suggestSlug = (slug, slugs) => {
  let best = null;
  for (const candidate of slugs) {
    const distance = editDistance(slug, candidate);
    if (!best || distance < best.distance) best = { slug: candidate, distance };
  }
  if (!best || best.distance > Math.max(2, Math.floor(slug.length / 4))) return null;
  return best.slug;
};

/** Một dòng CSV (ngăn cách bằng dấu phẩy, bọc ngoặc kép khi cần). */
const csvRow = (values) => values.map((value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}).join(',');

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PRODUCT,
  ILLUSTRATION_PREFIX,
  parseImageFileName,
  detectImageType,
  parseImages,
  shouldReplaceImages,
  suggestSlug,
  csvRow,
};
