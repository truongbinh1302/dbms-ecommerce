import { useEffect, useState } from 'react'
import CheckoutPage from './CheckoutPage'
import PageMessage from '../components/PageMessage'
import { fetchAuctionCheckout } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'

/*
  Đặt hàng cho phiên đấu giá đã thắng: dùng lại trang thanh toán (địa chỉ, COD/VNPay, điều khoản)
  với một dòng hàng duy nhất giá bằng giá thắng. Giỏ hàng của khách không bị đụng tới.
*/
export default function AuctionCheckoutPage({ auctionId, currentUser, onRequireLogin }) {
  const [state, setState] = useState({ quote: null, error: '' })
  const [version, setVersion] = useState(0)
  const userId = currentUser?.id || null

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchAuctionCheckout(auctionId)
      .then((quote) => !cancelled && setState({ quote, error: '' }))
      .catch((err) => !cancelled && setState({ quote: null, error: err.message || 'Không mở được trang đặt hàng' }))
    return () => {
      cancelled = true
    }
  }, [auctionId, userId, version])

  const back = <a href={hrefFor(`/dau-gia/${auctionId}`)} className="font-bold text-red-600">Về phiên đấu giá</a>
  if (!currentUser) {
    return <PageMessage title="Đăng nhập để đặt hàng phiên bạn đã thắng" action={<button type="button" onClick={onRequireLogin} className="font-bold text-red-600">Đăng nhập</button>} />
  }
  if (state.error) return <PageMessage title="Không đặt hàng được" description={state.error} action={back} />
  if (!state.quote) return <PageMessage title="Đang tải..." />

  const line = state.quote.items[0]
  return (
    <CheckoutPage
      cartItems={[{ id: line.productId, name: line.name, quantity: 1, price: line.unitPrice }]}
      subtotal={line.lineTotal}
      quote={state.quote}
      quoteError=""
      voucherCode=""
      onApplyVoucher={() => {}}
      currentUser={currentUser}
      onRequireLogin={onRequireLogin}
      onOrderPlaced={() => {}}
      onRefreshQuote={() => setVersion((value) => value + 1)}
      auctionId={Number(auctionId)}
    />
  )
}
