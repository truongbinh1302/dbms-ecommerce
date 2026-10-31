/*
  Tìm kiếm không dấu cho tiếng Việt.
  Mỗi sản phẩm có cột Products.SearchText = tên + hãng + thông số + danh mục,
  đã bỏ dấu, viết thường ("Màn hình Dell" → "man hinh dell"). Từ khoá người dùng
  gõ cũng được bỏ dấu theo cùng cách, nên "man hinh", "màn hình", "MÀN HÌNH" đều khớp.
*/

// Danh mục trong DB đặt tên tiếng Anh; thêm từ khoá tiếng Việt để khách gõ "màn hình" vẫn tìm ra.
const CATEGORY_KEYWORDS = {
  'pc-gaming': 'pc may tinh de ban may bo gaming',
  'gaming-laptops': 'laptop gaming may tinh xach tay',
  'office-laptops': 'laptop van phong may tinh xach tay',
  monitors: 'man hinh',
  keyboards: 'ban phim',
  mice: 'chuot',
  headsets: 'tai nghe',
  components: 'linh kien cpu vga card do hoa mainboard',
  storage: 'o cung ssd luu tru',
  networking: 'thiet bi mang router wifi',
  cameras: 'camera webcam',
  printers: 'may in',
  chairs: 'ghe ban cong thai hoc',
  'smart-devices': 'thiet bi thong minh',
  accessories: 'phu kien',
};

const MAX_SEARCH_TEXT = 600;
const MAX_TOKENS = 6;

const foldText = (value) => String(value === undefined || value === null ? '' : value)
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const buildSearchText = ({ name, brand, specs, categorySlug, categoryName } = {}) => {
  const specList = Array.isArray(specs) ? specs : [];
  return foldText([
    name,
    brand,
    ...specList,
    categoryName,
    CATEGORY_KEYWORDS[categorySlug] || '',
  ].join(' ')).slice(0, MAX_SEARCH_TEXT);
};

/** Tách từ khoá thành các token đã bỏ dấu (tối đa 6, không trùng). Token chỉ gồm a-z0-9 nên an toàn khi ghép LIKE. */
const tokenizeQuery = (query) => [...new Set(foldText(query).split(' ').filter(Boolean))].slice(0, MAX_TOKENS);

module.exports = {
  CATEGORY_KEYWORDS,
  foldText,
  buildSearchText,
  tokenizeQuery,
};
