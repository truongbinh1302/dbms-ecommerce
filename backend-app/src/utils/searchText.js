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
  components: 'linh kien',
  storage: 'o cung ssd luu tru',
  networking: 'thiet bi mang router wifi',
  cameras: 'camera webcam',
  printers: 'may in',
  chairs: 'ghe ban cong thai hoc',
  'smart-devices': 'thiet bi thong minh',
  accessories: 'phu kien',
};

// Linh kiện có loại trong ComponentSpecs: thêm tên gọi quen thuộc của từng loại, để "card đồ hoạ"
// hay "card màn hình" chỉ ra card đồ hoạ, "nguồn" chỉ ra bộ nguồn (không ra mọi linh kiện như trước).
const PART_KEYWORDS = {
  cpu: 'cpu bo vi xu ly chip',
  mainboard: 'mainboard bo mach chu main',
  ram: 'ram bo nho',
  gpu: 'vga gpu card do hoa',
  storage: 'o cung ssd luu tru',
  psu: 'nguon psu bo nguon',
  case: 'vo case thung may',
  cooler: 'tan nhiet tan cpu',
};

// Cách gọi khác của cùng một thứ, đổi trong từ khoá khách gõ trước khi tách token.
// "card màn hình" là card đồ hoạ; không thêm "man hinh" vào card để tìm "màn hình" không ra card.
const QUERY_ALIASES = [
  [/\bcard man hinh\b/g, 'card do hoa'],
  [/\bcard roi\b/g, 'card do hoa'],
];

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

const buildSearchText = ({ name, brand, specs, categorySlug, categoryName, partType } = {}) => {
  const specList = Array.isArray(specs) ? specs : [];
  return foldText([
    name,
    brand,
    PART_KEYWORDS[partType] || '',
    ...specList,
    categoryName,
    CATEGORY_KEYWORDS[categorySlug] || '',
  ].join(' ')).slice(0, MAX_SEARCH_TEXT);
};

/** Tách từ khoá thành các token đã bỏ dấu (tối đa 6, không trùng). Token chỉ gồm a-z0-9 nên an toàn khi ghép LIKE. */
const tokenizeQuery = (query) => {
  const folded = QUERY_ALIASES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), foldText(query));
  return [...new Set(folded.split(' ').filter(Boolean))].slice(0, MAX_TOKENS);
};

module.exports = {
  CATEGORY_KEYWORDS,
  PART_KEYWORDS,
  foldText,
  buildSearchText,
  tokenizeQuery,
};
