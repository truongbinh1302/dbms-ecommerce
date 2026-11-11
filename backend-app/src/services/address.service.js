/*
  Kiểm tra và chuẩn hoá địa chỉ giao hàng.
  Từ 01/7/2025 cả nước còn 34 đơn vị hành chính cấp tỉnh và bỏ cấp huyện,
  nên địa chỉ gồm: số nhà/đường → phường/xã → tỉnh/thành phố.
*/

const PROVINCES = [
  'Hà Nội',
  'Huế',
  'Hải Phòng',
  'Đà Nẵng',
  'TP. Hồ Chí Minh',
  'Cần Thơ',
  'An Giang',
  'Bắc Ninh',
  'Cà Mau',
  'Cao Bằng',
  'Đắk Lắk',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Tĩnh',
  'Hưng Yên',
  'Khánh Hòa',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Nghệ An',
  'Ninh Bình',
  'Phú Thọ',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sơn La',
  'Tây Ninh',
  'Thái Nguyên',
  'Thanh Hóa',
  'Tuyên Quang',
  'Vĩnh Long',
];

const LIMITS = { recipientName: 100, ward: 100, street: 200 };

const cleanText = (value) => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();

// So sánh tên tỉnh không phân biệt dấu, hoa thường và tiền tố "Tỉnh"/"Thành phố"/"TP."
const foldProvince = (value) => cleanText(value)
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/^(tinh|thanh pho|tp\.?)\s+/, '')
  .trim();

const provinceByKey = new Map(PROVINCES.map((name) => [foldProvince(name), name]));

const findProvince = (value) => provinceByKey.get(foldProvince(value)) || null;

/** Chấp nhận 0xxxxxxxxx hoặc +84xxxxxxxxx, có thể có dấu cách, chấm, gạch. Trả về dạng 0xxxxxxxxx. */
const normalizePhone = (value) => {
  const compact = cleanText(value).replace(/[\s.\-()]/g, '');
  const match = /^(?:\+?84|0)(\d{9})$/.exec(compact);
  return match ? `0${match[1]}` : null;
};

/**
 * Trả về { address, errors }. `errors` là object theo tên trường, rỗng nếu hợp lệ.
 */
const validateShippingAddress = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  const errors = {};

  const recipientName = cleanText(source.recipientName);
  if (!recipientName) errors.recipientName = 'Vui lòng nhập tên người nhận';
  else if (recipientName.length > LIMITS.recipientName) errors.recipientName = 'Tên người nhận quá dài';

  const phone = normalizePhone(source.phone);
  if (!phone) errors.phone = 'Số điện thoại cần có 10 số, bắt đầu bằng 0 hoặc +84';

  const province = findProvince(source.province);
  if (!province) errors.province = 'Vui lòng chọn tỉnh/thành phố';

  const ward = cleanText(source.ward);
  if (!ward) errors.ward = 'Vui lòng nhập phường/xã';
  else if (ward.length > LIMITS.ward) errors.ward = 'Tên phường/xã quá dài';

  const street = cleanText(source.street);
  if (!street) errors.street = 'Vui lòng nhập số nhà, tên đường';
  else if (street.length > LIMITS.street) errors.street = 'Địa chỉ quá dài';

  return {
    address: { recipientName, phone: phone || cleanText(source.phone), province: province || cleanText(source.province), ward, street },
    errors,
  };
};

/** Như validateShippingAddress nhưng ném lỗi 400 (kèm lỗi từng trường) nếu không hợp lệ. */
const assertShippingAddress = (input) => {
  const { address, errors } = validateShippingAddress(input);
  if (Object.keys(errors).length > 0) {
    const err = new Error('Địa chỉ giao hàng chưa hợp lệ');
    err.status = 400;
    err.data = { code: 'invalid_address', fields: errors };
    throw err;
  }
  return address;
};

/** Đọc địa chỉ đã lưu (JSON) trong Users.Address hoặc Orders.ShippingAddress. Dữ liệu cũ dạng chữ thì trả null. */
const parseStoredAddress = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

module.exports = {
  PROVINCES,
  findProvince,
  normalizePhone,
  validateShippingAddress,
  assertShippingAddress,
  parseStoredAddress,
};
