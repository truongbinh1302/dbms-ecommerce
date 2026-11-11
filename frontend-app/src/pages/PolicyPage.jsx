import PageMessage from '../components/PageMessage'
import useStoreInfo from '../hooks/useStoreInfo'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'

/*
  Các chính sách website bán hàng phải công khai (Luật Thương mại điện tử 122/2025/QH15, Điều 11, 12):
  thông tin người bán, quyền và nghĩa vụ các bên, cách giải quyết khiếu nại, cùng các chính sách
  giao hàng, thanh toán, đổi trả, bảo hành. Số liệu (phí ship, số ngày...) lấy từ cấu hình hệ thống
  qua /store/info nên luôn khớp với cách hệ thống tính tiền.
*/

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8'
const MISSING = 'Chưa cập nhật'

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <div className="space-y-2 text-sm leading-7 text-slate-700">{children}</div>
    </section>
  )
}

function Bullets({ items }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => <li key={typeof item === 'string' ? item : item.key}>{item}</li>)}
    </ul>
  )
}

function SellerInfo({ info }) {
  const { seller } = info
  const rows = [
    ['Tên người bán', seller.legalName],
    ['Mã số thuế / mã số hộ kinh doanh', seller.taxCode],
    ['Địa chỉ', seller.address],
    ['Điện thoại', seller.phone],
    ['Email', seller.email],
    ['Người đại diện', seller.representative],
  ]
  return (
    <>
      <table className="w-full max-w-2xl text-left text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-slate-100">
              <th className="w-1/2 py-2 pr-4 font-semibold text-slate-600">{label}</th>
              <td className={`py-2 ${value ? 'text-slate-900' : 'text-amber-700'}`}>{value || MISSING}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some(([, value]) => !value) ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">
          BinhTinhStore đang là website đồ án nên chưa có thông tin đăng ký kinh doanh. Trước khi bán thật, cửa hàng phải điền đủ các
          dòng trên và thông báo website với cơ quan quản lý (Luật Thương mại điện tử 2025, Điều 14).
        </p>
      ) : null}
    </>
  )
}

function contactLine(info) {
  const parts = [info.seller.phone && `điện thoại ${info.seller.phone}`, info.seller.email && `email ${info.seller.email}`].filter(Boolean)
  return parts.length ? parts.join(', ') : 'thông tin liên hệ ở trang Thông tin người bán'
}

const POLICIES = [
  {
    slug: 'dieu-khoan',
    title: 'Điều khoản mua hàng',
    render: (info) => (
      <>
        <Section title="1. Đặt hàng và xác lập hợp đồng">
          <p>
            Trước khi đặt, trang thanh toán hiển thị sản phẩm, số lượng, ưu đãi áp dụng, giá, phí giao hàng, tổng tiền và phương thức thanh toán.
            Bạn có thể sửa giỏ hàng, địa chỉ, mã giảm giá và phương thức thanh toán trước khi bấm Đặt hàng.
          </p>
          <p>
            Hợp đồng mua bán được xác lập khi bạn tích đồng ý điều khoản này và bấm Đặt hàng. Mọi thông tin của đơn xem lại được ở trang{' '}
            <a href={hrefFor('/don-hang')} className="font-semibold text-red-600 underline">Đơn hàng của tôi</a>. Cửa hàng gọi xác nhận trước khi giao.
          </p>
        </Section>
        <Section title="2. Giá và thuế">
          <p>
            Giá niêm yết bằng đồng Việt Nam{info.pricesIncludeTax ? ' và đã bao gồm thuế' : ''}. Đơn được tính theo giá tại thời điểm đặt,
            hoặc theo giá thấp hơn trong báo giá Build PC còn hạn ({info.quoteValidHours} giờ).
          </p>
          <p>Nếu giá hiển thị sai rõ ràng do lỗi hệ thống, cửa hàng liên hệ bạn trước khi giao; bạn được huỷ đơn và hoàn tiền đầy đủ.</p>
        </Section>
        <Section title="3. Huỷ đơn">
          <Bullets items={[
            'Bạn tự huỷ được trên website khi đơn đang chờ xác nhận, chờ thanh toán hoặc đã xác nhận nhưng chưa đóng gói.',
            `Đơn thanh toán VNPay không thanh toán xong trong ${info.payment.vnpayExpireMinutes} phút sẽ tự huỷ và trả hàng về kho.`,
            'Đơn đã thanh toán mà bị huỷ được hoàn tiền theo Chính sách thanh toán.',
          ]} />
        </Section>
        <Section title="4. Quyền và nghĩa vụ của khách hàng">
          <Bullets items={[
            'Cung cấp đúng họ tên, số điện thoại, địa chỉ nhận hàng; thanh toán đủ số tiền của đơn.',
            'Kiểm tra ngoại quan, số lượng sản phẩm khi nhận hàng và báo ngay nếu có sai sót.',
            'Được cung cấp thông tin đúng về sản phẩm, được đổi trả, bảo hành và khiếu nại theo các chính sách công bố trên website.',
            'Được xem, tải về và yêu cầu xoá dữ liệu cá nhân theo Chính sách bảo mật.',
          ]} />
        </Section>
        <Section title="5. Quyền và nghĩa vụ của cửa hàng">
          <Bullets items={[
            'Giao đúng sản phẩm, số lượng, giá như đơn đã đặt; công khai thông tin sản phẩm trung thực, không bán hàng giả, hàng không rõ nguồn gốc.',
            'Đổi trả, bảo hành, giải quyết khiếu nại theo các chính sách trên website.',
            'Lưu thông tin hợp đồng và đơn hàng trong thời hạn pháp luật yêu cầu (Luật Thương mại điện tử 2025, Điều 16) và bảo vệ dữ liệu cá nhân của khách.',
            'Được từ chối hoặc huỷ đơn có thông tin giao hàng không liên lạc được, có dấu hiệu gian lận, hoặc khi sản phẩm hết hàng (hoàn tiền đầy đủ nếu đã thanh toán).',
          ]} />
        </Section>
        <Section title="6. Giải quyết tranh chấp">
          <p>
            Hai bên ưu tiên thương lượng theo{' '}
            <a href={hrefFor('/chinh-sach/khieu-nai')} className="font-semibold text-red-600 underline">quy trình khiếu nại</a>.
            Không thương lượng được thì khách có thể nhờ tổ chức xã hội tham gia bảo vệ quyền lợi người tiêu dùng, cơ quan quản lý nhà nước
            hoặc toà án giải quyết theo Luật Bảo vệ quyền lợi người tiêu dùng 2023.
          </p>
        </Section>
      </>
    ),
  },
  {
    slug: 'van-chuyen',
    title: 'Giao hàng',
    render: (info) => (
      <>
        <Section title="Phạm vi và thời gian">
          <p>Giao toàn quốc, 34 tỉnh, thành phố. Thời gian dự kiến tính từ khi cửa hàng xác nhận đơn:</p>
          <Bullets items={[
            `${info.shipping.province}: ${info.shipping.deliveryDaysLocal} ngày làm việc.`,
            `Tỉnh, thành phố khác: ${info.shipping.deliveryDaysOther} ngày làm việc.`,
          ]} />
          <p>Thời gian dự kiến cũng hiện ở trang thanh toán ngay khi bạn chọn tỉnh nhận hàng.</p>
        </Section>
        <Section title="Phí giao hàng">
          <p>
            {formatCurrency(info.shipping.fee)} mỗi đơn; miễn phí cho đơn có tạm tính từ {formatCurrency(info.shipping.freeThreshold)}.
            Phí được tính và hiện rõ ở trang thanh toán trước khi đặt.
          </p>
        </Section>
        <Section title="Khi nhận hàng">
          <Bullets items={[
            'Kiểm tra thùng hàng còn nguyên niêm phong, đúng số lượng sản phẩm trước khi ký nhận.',
            'Thùng móp, rách hoặc thiếu sản phẩm: từ chối nhận hoặc ghi chú với người giao và báo cửa hàng trong ngày.',
          ]} />
        </Section>
      </>
    ),
  },
  {
    slug: 'thanh-toan',
    title: 'Thanh toán',
    render: (info) => (
      <>
        <Section title="Phương thức thanh toán">
          <Bullets items={[
            'Thanh toán khi nhận hàng (COD): trả tiền mặt cho người giao.',
            `VNPay: thẻ ATM nội địa, thẻ quốc tế hoặc QR ngân hàng qua cổng VNPay. Cần thanh toán trong ${info.payment.vnpayExpireMinutes} phút sau khi đặt, quá hạn đơn tự huỷ.`,
          ]} />
          <p>Cửa hàng không nhận và không lưu số thẻ hay tài khoản ngân hàng của bạn; việc nhập thẻ diễn ra trên trang của VNPay.</p>
        </Section>
        <Section title="Ưu đãi tự động">
          <Bullets items={info.tierDiscounts.map((tier) => (
            `Giảm ${formatCurrency(tier.amount)} cho đơn có tạm tính từ ${formatCurrency(tier.minSubtotal)}.`
          ))} />
          <p>Mã giảm giá nhập ở giỏ hàng hoặc trang thanh toán; số tiền giảm hiện trước khi đặt.</p>
        </Section>
        <Section title="Hoàn tiền">
          <p>
            Đơn đã thanh toán VNPay mà bị huỷ, hoặc được chấp nhận trả hàng, được hoàn về đúng phương thức đã thanh toán.
            Thời gian tiền về tài khoản phụ thuộc ngân hàng của bạn. Đơn COD được hoàn bằng chuyển khoản vào tài khoản bạn cung cấp.
          </p>
        </Section>
      </>
    ),
  },
  {
    slug: 'doi-tra',
    title: 'Đổi trả',
    render: (info) => (
      <>
        <Section title={`Đổi hoặc trả trong ${info.returnDays} ngày`}>
          <p>Trong {info.returnDays} ngày kể từ khi nhận hàng, bạn được đổi sản phẩm mới hoặc trả hàng hoàn tiền khi:</p>
          <Bullets items={[
            'Sản phẩm lỗi kỹ thuật do nhà sản xuất.',
            'Giao sai sản phẩm, sai cấu hình, thiếu phụ kiện so với đơn.',
            'Sản phẩm khác với thông tin mô tả trên website.',
          ]} />
          <p>Cửa hàng chịu phí vận chuyển trong các trường hợp trên.</p>
        </Section>
        <Section title="Điều kiện">
          <Bullets items={[
            'Còn đủ hộp, phụ kiện, quà tặng kèm, tem và số serial nguyên vẹn.',
            'Không bị rơi vỡ, vào nước, cháy nổ do nguồn điện hoặc do tự ý sửa chữa.',
          ]} />
        </Section>
        <Section title="Cách yêu cầu">
          <p>
            Mở đơn hàng trong mục{' '}
            <a href={hrefFor('/don-hang')} className="font-semibold text-red-600 underline">Đơn hàng của tôi</a>, bấm
            “Yêu cầu đổi trả”, chọn sản phẩm, lý do và mô tả tình trạng. Bạn theo dõi được từng bước (duyệt, cửa hàng nhận hàng, hoàn tất)
            ngay trên trang đơn và trong thông báo tài khoản. Có thể liên hệ trực tiếp ({contactLine(info)}) nếu cần gửi ảnh hoặc video.
          </p>
          <p>
            Cửa hàng phản hồi trong {info.complaintResponseDays} ngày làm việc. Tiền được hoàn theo Chính sách thanh toán,
            không vượt số tiền bạn đã trả cho đơn. Quá {info.returnDays} ngày, sản phẩm lỗi vẫn được bảo hành theo serial.
          </p>
        </Section>
      </>
    ),
  },
  {
    slug: 'bao-hanh',
    title: 'Bảo hành',
    render: () => (
      <>
        <Section title="Thời hạn">
          <p>
            Thời hạn bảo hành theo từng sản phẩm, ghi trên phiếu bảo hành hoặc tem của hãng. Mỗi sản phẩm được đăng ký theo số serial;
            tra cứu thời hạn còn lại ở trang{' '}
            <a href={hrefFor('/bao-hanh')} className="font-semibold text-red-600 underline">Tra cứu bảo hành</a>.
          </p>
        </Section>
        <Section title="Được bảo hành">
          <Bullets items={['Lỗi kỹ thuật do nhà sản xuất, trong thời hạn bảo hành.', 'Tem bảo hành và số serial còn nguyên, đọc được.']} />
        </Section>
        <Section title="Không được bảo hành">
          <Bullets items={[
            'Rơi vỡ, móp méo, vào nước, côn trùng, cháy nổ do nguồn điện không ổn định.',
            'Tự ý tháo, sửa chữa, thay linh kiện, rách tem hoặc mất số serial.',
            'Hết thời hạn bảo hành (cửa hàng vẫn hỗ trợ sửa chữa có tính phí).',
          ]} />
        </Section>
      </>
    ),
  },
  {
    slug: 'khieu-nai',
    title: 'Khiếu nại và liên hệ',
    render: (info) => (
      <>
        <Section title="Kênh tiếp nhận">
          <p>Gửi phản ánh, yêu cầu hoặc khiếu nại qua {contactLine(info)}. Nêu mã đơn (nếu có), nội dung và cách liên lạc lại với bạn.</p>
        </Section>
        <Section title="Quy trình">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Cửa hàng xác nhận đã nhận khiếu nại trong 1 ngày làm việc.</li>
            <li>Kiểm tra đơn hàng, sản phẩm và phản hồi phương án xử lý trong {info.complaintResponseDays} ngày làm việc.</li>
            <li>Thực hiện phương án đã thống nhất (đổi, trả, hoàn tiền, bảo hành) và báo kết quả cho bạn.</li>
          </ol>
          <p>
            Nếu không đồng ý với cách xử lý, bạn có thể nhờ tổ chức xã hội tham gia bảo vệ quyền lợi người tiêu dùng, cơ quan quản lý nhà nước
            hoặc toà án giải quyết.
          </p>
        </Section>
      </>
    ),
  },
  {
    slug: 'thong-tin',
    title: 'Thông tin người bán',
    render: (info) => <SellerInfo info={info} />,
  },
]

export default function PolicyPage({ slug }) {
  const info = useStoreInfo()
  const policy = POLICIES.find((item) => item.slug === slug) || POLICIES[0]

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Chính sách" className={`${CARD} h-fit p-4 sm:p-4 lg:sticky lg:top-28`}>
        <ul className="space-y-1 text-sm">
          {POLICIES.map((item) => (
            <li key={item.slug}>
              <a
                href={hrefFor(`/chinh-sach/${item.slug}`)}
                aria-current={item.slug === policy.slug ? 'page' : undefined}
                className={`block rounded-xl px-3 py-2 font-semibold ${item.slug === policy.slug ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {item.title}
              </a>
            </li>
          ))}
          <li>
            <a href={hrefFor('/chinh-sach-bao-mat')} className="block rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">
              Bảo mật thông tin
            </a>
          </li>
        </ul>
      </nav>

      <article className={`${CARD} space-y-6`}>
        <header>
          <h1 className="text-3xl font-black text-slate-900">{policy.title}</h1>
          {info ? <p className="mt-1 text-sm text-slate-500">Áp dụng từ phiên bản điều khoản {info.termsVersion}</p> : null}
        </header>
        {info ? policy.render(info) : <PageMessage title="Đang tải chính sách..." />}
      </article>
    </div>
  )
}
