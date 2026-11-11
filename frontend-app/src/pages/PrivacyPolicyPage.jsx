import { hrefFor } from '../hooks/useHashRoute'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8'
const UPDATED_AT = '12/11/2026'

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <div className="space-y-2 text-sm leading-7 text-slate-700">{children}</div>
    </section>
  )
}

/*
  Chính sách bảo mật mô tả đúng những gì hệ thống đang làm (đối chiếu với mã nguồn),
  theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.
*/
export default function PrivacyPolicyPage() {
  return (
    <article className={`${CARD} mx-auto max-w-4xl space-y-8`}>
      <header className="space-y-2">
        <p className="text-sm font-semibold text-slate-500">Cập nhật ngày {UPDATED_AT}</p>
        <h1 className="text-3xl font-black text-slate-900">Chính sách bảo mật</h1>
        <p className="text-sm leading-7 text-slate-600">
          Trang này cho biết BinhTinhStore thu thập dữ liệu cá nhân nào, dùng vào việc gì, giữ trong bao lâu
          và bạn thực hiện quyền của mình ra sao, theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (hiệu lực từ 01/01/2026)
          và Nghị định 356/2025/NĐ-CP.
        </p>
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          BinhTinhStore hiện là website đồ án. Trước khi bán hàng thật, cửa hàng cần bổ sung tên doanh nghiệp,
          địa chỉ, người phụ trách bảo vệ dữ liệu và nhờ luật sư rà soát chính sách này.
        </p>
      </header>

      <Section title="1. Dữ liệu chúng tôi thu thập">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Tài khoản:</strong> họ tên, email, số điện thoại (không bắt buộc) và mật khẩu. Mật khẩu được băm bằng bcrypt; nhân viên cửa hàng không đọc được.</li>
          <li><strong>Giao hàng:</strong> tên người nhận, số điện thoại, tỉnh/thành phố, phường/xã, số nhà và ghi chú đơn hàng.</li>
          <li><strong>Đơn hàng:</strong> sản phẩm, số lượng, giá, mã giảm giá, mã báo giá, phương thức và trạng thái thanh toán.</li>
          <li><strong>Thanh toán VNPay:</strong> chúng tôi không nhận và không lưu số thẻ hay tài khoản ngân hàng. Chỉ lưu mã giao dịch và kết quả VNPay trả về.</li>
          <li><strong>Hoạt động mua sắm:</strong> giỏ hàng (lưu trên máy chủ khi bạn đăng nhập), báo giá Build PC, đánh giá sản phẩm, số serial bảo hành, sản phẩm bạn bấm theo dõi giá (kèm giá mong muốn nếu bạn nhập) và các thông báo gửi tới tài khoản.</li>
          <li><strong>Yêu cầu dịch vụ:</strong> khi bạn đặt lịch kỹ thuật tại nhà, gửi yêu cầu thu cũ hoặc bảo hành: địa chỉ và ngày giờ hẹn, số điện thoại liên hệ, mô tả lỗi, thông tin máy cũ (loại, mẫu, giá mua, thời gian dùng, tình trạng).</li>
          <li><strong>Đổi trả:</strong> sản phẩm, số lượng, lý do và mô tả tình trạng bạn nhập khi yêu cầu đổi hoặc trả hàng; số tiền cửa hàng đã hoàn.</li>
          <li><strong>Trên trình duyệt của bạn (localStorage):</strong> phiên đăng nhập, giỏ hàng, sản phẩm đã xem, sản phẩm yêu thích, cấu hình Build PC đang chọn. Website không dùng cookie quảng cáo hay công cụ theo dõi của bên thứ ba.</li>
          <li><strong>Kỹ thuật:</strong> địa chỉ IP và thời điểm truy cập, dùng để giới hạn số lần gọi và chống tấn công.</li>
        </ul>
      </Section>

      <Section title="2. Mục đích sử dụng">
        <ul className="list-disc space-y-1 pl-5">
          <li>Tạo và quản lý tài khoản, lưu giỏ hàng giữa các thiết bị.</li>
          <li>Xác nhận, giao đơn, thu tiền, huỷ đơn và hoàn tiền.</li>
          <li>Giữ giá theo báo giá, tra cứu bảo hành, chăm sóc khách hàng.</li>
          <li>Hẹn lịch và cử kỹ thuật viên tới đúng địa chỉ, định giá máy thu cũ, xử lý bảo hành.</li>
          <li>Báo trong tài khoản khi giá sản phẩm bạn theo dõi giảm, khi đơn hàng hoặc yêu cầu dịch vụ đổi trạng thái. Không gửi email hay tin nhắn quảng cáo.</li>
          <li>Bảo đảm an toàn hệ thống và thực hiện nghĩa vụ kế toán, thuế.</li>
        </ul>
        <p>Chúng tôi không bán dữ liệu cá nhân và không dùng dữ liệu của bạn để quảng cáo khi chưa có sự đồng ý riêng.</p>
      </Section>

      <Section title="3. Chia sẻ dữ liệu">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Đơn vị vận chuyển:</strong> tên người nhận, số điện thoại và địa chỉ giao hàng.</li>
          <li><strong>VNPay:</strong> mã đơn và số tiền cần thanh toán khi bạn chọn VNPay.</li>
          <li><strong>Cơ quan nhà nước có thẩm quyền:</strong> khi pháp luật yêu cầu.</li>
        </ul>
      </Section>

      <Section title="4. Thời gian lưu trữ">
        <ul className="list-disc space-y-1 pl-5">
          <li>Tài khoản, giỏ hàng, đánh giá: đến khi bạn xoá tài khoản.</li>
          <li>Đơn hàng và chứng từ bán hàng: theo thời hạn pháp luật kế toán, thuế yêu cầu (chứng từ dùng để ghi sổ kế toán lưu tối thiểu 10 năm), kể cả khi bạn đã xoá tài khoản.</li>
          <li>Bảo hành: đến hết thời hạn bảo hành của sản phẩm.</li>
          <li>Yêu cầu đổi trả và số tiền đã hoàn: giữ cùng đơn hàng như chứng từ bán hàng ở trên.</li>
          <li>Yêu cầu dịch vụ: đến khi bạn xoá tài khoản; khi xoá, yêu cầu đang mở bị huỷ và địa chỉ, số điện thoại, mô tả, thông tin máy bị xoá (chỉ giữ mã yêu cầu và ngày để đối soát).</li>
          <li>Báo giá Build PC: giữ giá 48 giờ; sau khi xoá tài khoản, báo giá không còn gắn với bạn.</li>
        </ul>
      </Section>

      <Section title="5. Quyền của bạn">
        <p>Theo Điều 4 Luật Bảo vệ dữ liệu cá nhân, bạn có quyền:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>được biết về việc xử lý dữ liệu; đồng ý hoặc không đồng ý, và rút lại sự đồng ý;</li>
          <li>xem, chỉnh sửa dữ liệu; yêu cầu cung cấp, xoá, hạn chế xử lý dữ liệu; phản đối việc xử lý;</li>
          <li>khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường theo quy định của pháp luật.</li>
        </ul>
        <p>
          Bạn tự làm được ngay trong trang{' '}
          <a href={hrefFor('/tai-khoan')} className="font-semibold text-red-600 underline">Tài khoản của tôi</a>:
          tải toàn bộ dữ liệu cửa hàng đang giữ về máy (tệp JSON), đổi địa chỉ giao hàng mặc định, và xoá tài khoản.
          Với yêu cầu khác, hãy liên hệ cửa hàng; chúng tôi phản hồi trong thời hạn pháp luật quy định.
        </p>
      </Section>

      <Section title="6. Khi bạn xoá tài khoản">
        <ul className="list-disc space-y-1 pl-5">
          <li>Họ tên, email, số điện thoại, địa chỉ mặc định và mật khẩu bị thay bằng giá trị vô danh; tài khoản bị khoá và không đăng nhập lại được.</li>
          <li>Giỏ hàng, đánh giá sản phẩm, danh sách theo dõi giá và thông báo của bạn bị xoá; báo giá Build PC không còn gắn với bạn.</li>
          <li>Yêu cầu dịch vụ đang mở bị huỷ; địa chỉ, số điện thoại, mô tả và thông tin máy trong các yêu cầu dịch vụ bị xoá.</li>
          <li>Đơn hàng đã đặt được giữ lại làm chứng từ bán hàng như mục 4.</li>
          <li>Nếu còn đơn đang xử lý hoặc đang giao, bạn cần chờ giao xong hoặc huỷ đơn trước; còn yêu cầu đổi trả đang xử lý thì chờ cửa hàng hoàn tiền hoặc gửi hàng đổi xong.</li>
          <li>Sau khi xoá, bạn có thể đăng ký lại bằng chính email đó như một tài khoản mới.</li>
        </ul>
      </Section>

      <Section title="7. Bảo vệ dữ liệu">
        <p>
          Mật khẩu được băm; phiên đăng nhập hết hạn sau 15 phút và được làm mới bằng token riêng;
          chỉ tài khoản quản trị mới xem được đơn hàng của khách; tra cứu bảo hành công khai chỉ hiện tên sản phẩm và thời hạn,
          không hiện thông tin người mua. Khi triển khai thật, website phải chạy qua HTTPS.
        </p>
      </Section>

      <Section title="8. Thay đổi chính sách">
        <p>Khi chính sách thay đổi, chúng tôi cập nhật ngày ở đầu trang và thông báo trên website trước khi áp dụng.</p>
      </Section>
    </article>
  )
}
