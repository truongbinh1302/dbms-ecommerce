/*
  Đoạn SQL dùng chung cho khuyến mãi (không phụ thuộc kết nối DB, để service nào cũng nhúng được).
*/
const ACTIVE_CONDITION = 'pr.IsActive = 1 AND pr.StartsAt <= SYSDATETIMEOFFSET() AND pr.EndsAt > SYSDATETIMEOFFSET()';

/**
 * OUTER APPLY lấy chương trình tốt nhất đang chạy cho sản phẩm có alias `alias`:
 * giá thấp hơn giá niêm yết và còn suất. Cột trả về đọc bằng formatPromotion trong productFormat.
 */
const promoApply = (alias = 'p') => `
  OUTER APPLY (
    SELECT TOP 1 pi.PromotionID AS PromoID, pr.Name AS PromoName, pi.SalePrice AS PromoSalePrice,
           pr.EndsAt AS PromoEndsAt, pi.QuantityLimit AS PromoQuantityLimit,
           pi.SoldCount AS PromoSoldCount, pi.PerOrderLimit AS PromoPerOrderLimit
    FROM PromotionItems pi
    JOIN Promotions pr ON pr.PromotionID = pi.PromotionID
    WHERE pi.ProductID = ${alias}.ProductID
      AND ${ACTIVE_CONDITION}
      AND pi.SalePrice < ${alias}.Price
      AND (pi.QuantityLimit IS NULL OR pi.SoldCount < pi.QuantityLimit)
    ORDER BY pi.SalePrice, pr.EndsAt
  ) promo`;

const PROMO_COLUMNS = `promo.PromoID, promo.PromoName, promo.PromoSalePrice, promo.PromoEndsAt,
  promo.PromoQuantityLimit, promo.PromoSoldCount, promo.PromoPerOrderLimit`;

// Giá khách đang trả được của mỗi sản phẩm: giá Hot Deal đang chạy (còn suất) nếu thấp hơn giá niêm yết.
// Dùng làm bảng con, ví dụ: JOIN (EFFECTIVE_PRICE_SQL) cur ON cur.ProductID = w.ProductID
const EFFECTIVE_PRICE_SQL = `
  SELECT p.ProductID, p.Name, p.Price,
         CASE WHEN deal.SalePrice IS NOT NULL AND deal.SalePrice < p.Price THEN deal.SalePrice ELSE p.Price END AS EffectivePrice
  FROM Products p
  OUTER APPLY (
    SELECT MIN(pi.SalePrice) AS SalePrice
    FROM PromotionItems pi JOIN Promotions pr ON pr.PromotionID = pi.PromotionID
    WHERE pi.ProductID = p.ProductID AND ${ACTIVE_CONDITION}
      AND (pi.QuantityLimit IS NULL OR pi.SoldCount < pi.QuantityLimit)
  ) deal
  WHERE p.IsDeleted = 0`;

module.exports = { ACTIVE_CONDITION, promoApply, PROMO_COLUMNS, EFFECTIVE_PRICE_SQL };
