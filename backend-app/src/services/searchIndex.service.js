const { sql } = require('../config/db.sql');
const { parseJson } = require('../utils/productFormat');
const { buildSearchText } = require('../utils/searchText');

/*
  Ghi cột Products.SearchText (chuỗi đã bỏ dấu dùng cho tìm kiếm).
  Tính chuỗi ở Node rồi cập nhật hàng loạt bằng OPENJSON trong một câu UPDATE,
  vì bỏ dấu tiếng Việt (kể cả chữ đ) bằng T-SQL rất rườm rà.
*/

const SELECT_SOURCE = `
  SELECT p.ProductID, p.Name, p.Brand, p.Specs,
         c.Slug AS CategorySlug, c.Name AS CategoryName, cs.ComponentType
  FROM Products p
  LEFT JOIN Categories c ON c.CategoryID = p.CategoryID
  LEFT JOIN ComponentSpecs cs ON cs.ProductID = p.ProductID
`;

const writeSearchText = async (executor, rows) => {
  if (rows.length === 0) return 0;

  const payload = JSON.stringify(rows.map((row) => ({
    id: row.ProductID,
    text: buildSearchText({
      name: row.Name,
      brand: row.Brand,
      specs: parseJson(row.Specs, []),
      categorySlug: row.CategorySlug,
      categoryName: row.CategoryName,
      partType: row.ComponentType,
    }),
  })));

  await new sql.Request(executor)
    .input('payload', sql.NVarChar(sql.MAX), payload)
    .query(`
      UPDATE p
      SET SearchText = j.SearchText
      FROM Products p
      JOIN OPENJSON(@payload)
        WITH (ProductID INT '$.id', SearchText NVARCHAR(600) '$.text') AS j
        ON j.ProductID = p.ProductID
    `);

  return rows.length;
};

/** Tính lại SearchText cho các sản phẩm vừa thêm/sửa. */
const refreshSearchText = async (executor, productIds) => {
  const ids = [...new Set((productIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return 0;

  const request = new sql.Request(executor);
  ids.forEach((id, index) => request.input(`id${index}`, sql.Int, id));
  const result = await request.query(`
    ${SELECT_SOURCE}
    WHERE p.ProductID IN (${ids.map((_, index) => `@id${index}`).join(', ')})
  `);

  return writeSearchText(executor, result.recordset);
};

/**
 * Điền SearchText cho các sản phẩm còn trống (dữ liệu seed, sản phẩm thêm bằng SQL tay).
 * Chạy theo lô, dùng con trỏ ProductID nên luôn dừng kể cả khi có dòng không cập nhật được.
 */
const backfillSearchText = async (executor, batchSize = 2000) => {
  let total = 0;
  let lastId = 0;

  for (;;) {
    const result = await new sql.Request(executor)
      .input('batch', sql.Int, batchSize)
      .input('lastId', sql.Int, lastId)
      .query(`
        ${SELECT_SOURCE}
        WHERE p.SearchText IS NULL AND p.ProductID > @lastId
        ORDER BY p.ProductID
        OFFSET 0 ROWS FETCH NEXT @batch ROWS ONLY
      `);

    const rows = result.recordset;
    if (rows.length === 0) break;

    total += await writeSearchText(executor, rows);
    lastId = rows[rows.length - 1].ProductID;
    if (rows.length < batchSize) break;
  }

  return total;
};

module.exports = {
  refreshSearchText,
  backfillSearchText,
};
