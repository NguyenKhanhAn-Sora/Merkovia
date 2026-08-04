/**
 * Email OTP — bản gọn, nền sáng, nhiều chữ thật, ít markup.
 * Kiểu "transactional" tiêu chuẩn để tăng khả năng vào Inbox (tránh Spam/Quảng cáo):
 * tỉ lệ text/HTML cân bằng, không ảnh, không gradient nặng, một cột đơn giản.
 * Style inline vì nhiều email client bỏ qua thẻ <style>.
 */
export function renderOtpEmail(code: string, ttlMinutes: number): string {
  const preheader = 'Mã xác thực để hoàn tất đăng ký tài khoản Merkovia.';

  return `<!doctype html>
<html lang="vi">
  <body style="margin:0;padding:0;background:#f4f4f7;color:#1f2430;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6e6ee;border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 0;">
                <p style="margin:0;font-size:18px;font-weight:700;color:#6d28d9;letter-spacing:1px;">Merkovia</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Xin chào,</p>
                <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
                  Bạn vừa yêu cầu tạo tài khoản Merkovia bằng địa chỉ email này. Hãy dùng mã xác thực bên dưới để hoàn tất đăng ký:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 4px;" align="center">
                <div style="display:inline-block;background:#f6f4ff;border:1px solid #e2dbff;border-radius:10px;padding:16px 28px;">
                  <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:#4c1d95;font-family:'Courier New',Courier,monospace;">${code}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;">
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4b5563;">
                  Mã có hiệu lực trong <strong>${ttlMinutes} phút</strong>. Nếu bạn yêu cầu một mã mới, mã này sẽ tự động hết hiệu lực.
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
                  Vì lý do bảo mật, vui lòng không chia sẻ mã này cho bất kỳ ai. Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email — tài khoản sẽ không được tạo.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 28px;">
                <p style="margin:0;font-size:14px;line-height:1.6;">Trân trọng,<br />Đội ngũ Merkovia</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:16px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9aa0ac;">
                  Đây là email tự động phục vụ việc xác thực tài khoản.<br />
                  © ${new Date().getFullYear()} Merkovia
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Khung email dùng chung (nền sáng, ít markup — thân thiện bộ lọc spam). */
function shell(preheader: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
  <body style="margin:0;padding:0;background:#f4f4f7;color:#1f2430;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6e6ee;border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 0;">
                <p style="margin:0;font-size:18px;font-weight:700;color:#6d28d9;letter-spacing:1px;">Merkovia</p>
              </td>
            </tr>
            ${body}
            <tr>
              <td style="padding:22px 32px 28px;">
                <p style="margin:0;font-size:14px;line-height:1.6;">Trân trọng,<br />Đội ngũ Merkovia</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:16px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9aa0ac;">
                  Đây là email tự động phục vụ bảo mật tài khoản.<br />
                  © ${new Date().getFullYear()} Merkovia
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Email chứa OTP để ĐẶT LẠI MẬT KHẨU. */
export function renderPasswordResetEmail(
  code: string,
  ttlMinutes: number,
): string {
  return shell(
    'Mã xác thực để đặt lại mật khẩu Merkovia.',
    `<tr>
      <td style="padding:20px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Xin chào,</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
          Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Merkovia của bạn. Hãy dùng mã xác thực bên dưới:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 4px;" align="center">
        <div style="display:inline-block;background:#f6f4ff;border:1px solid #e2dbff;border-radius:10px;padding:16px 28px;">
          <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:#4c1d95;font-family:'Courier New',Courier,monospace;">${code}</span>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4b5563;">
          Mã có hiệu lực trong <strong>${ttlMinutes} phút</strong>. Sau khi đổi mật khẩu, bạn sẽ bị đăng xuất khỏi mọi thiết bị.
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
          <strong>Nếu bạn không yêu cầu việc này</strong>, hãy bỏ qua email — mật khẩu của bạn không thay đổi. Tuyệt đối không chia sẻ mã cho bất kỳ ai.
        </p>
      </td>
    </tr>`,
  );
}

export function renderPasswordResetText(
  code: string,
  ttlMinutes: number,
): string {
  return [
    'Xin chào,',
    '',
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Merkovia của bạn.',
    `Mã xác thực của bạn là: ${code}`,
    '',
    `Mã có hiệu lực trong ${ttlMinutes} phút. Sau khi đổi mật khẩu, bạn sẽ bị đăng xuất khỏi mọi thiết bị.`,
    'Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.',
    '',
    'Trân trọng,',
    'Đội ngũ Merkovia',
  ].join('\n');
}

/**
 * Email báo tài khoản KHÔNG dùng mật khẩu (đăng ký bằng Google / SĐT).
 * Nhờ vậy web vẫn trả lời chung chung mà người dùng thật vẫn biết phải làm gì.
 */
export function renderNoPasswordEmail(method: string): string {
  return shell(
    'Về yêu cầu đặt lại mật khẩu Merkovia.',
    `<tr>
      <td style="padding:20px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Xin chào,</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
          Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho địa chỉ email này. Tuy nhiên, tài khoản Merkovia của bạn
          đăng nhập bằng <strong>${method}</strong> nên <strong>không có mật khẩu</strong> để đặt lại.
        </p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
          Bạn chỉ cần vào trang đăng nhập và chọn <strong>${method}</strong> là được.
        </p>
        <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">
          Nếu bạn không yêu cầu việc này, hãy bỏ qua email — tài khoản của bạn vẫn an toàn.
        </p>
      </td>
    </tr>`,
  );
}

export function renderNoPasswordText(method: string): string {
  return [
    'Xin chào,',
    '',
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho địa chỉ email này.',
    `Tuy nhiên tài khoản Merkovia của bạn đăng nhập bằng ${method} nên không có mật khẩu để đặt lại.`,
    `Bạn chỉ cần vào trang đăng nhập và chọn ${method}.`,
    '',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    '',
    'Trân trọng,',
    'Đội ngũ Merkovia',
  ].join('\n');
}

/** Email báo gian hàng bị xử lý sau khi admin xem xét báo cáo vi phạm. */
export function renderShopViolationEmail(params: {
  shopName: string;
  action: 'warning' | 'suspend';
  reasons: string;
  note: string;
}): string {
  const { shopName, action, reasons, note } = params;
  const isSuspend = action === 'suspend';
  return shell(
    isSuspend
      ? `Gian hàng "${shopName}" đã bị tạm đình chỉ.`
      : `Gian hàng "${shopName}" nhận cảnh báo vi phạm.`,
    `<tr>
      <td style="padding:20px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Xin chào,</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
          Đội ngũ Merkovia đã xem xét các báo cáo vi phạm liên quan đến gian hàng
          <strong>${shopName}</strong> (lý do được báo: ${reasons}) và đưa ra quyết định:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 32px 0;">
        <div style="border-radius:10px;padding:14px 18px;background:${isSuspend ? '#fef2f2' : '#fffbeb'};border:1px solid ${isSuspend ? '#fecaca' : '#fde68a'};">
          <p style="margin:0;font-size:14px;font-weight:700;color:${isSuspend ? '#b91c1c' : '#92400e'};">
            ${isSuspend ? 'Tạm đình chỉ hoạt động gian hàng' : 'Cảnh báo vi phạm'}
          </p>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">${note}</p>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
          ${
            isSuspend
              ? 'Gian hàng tạm thời không thể đăng bán sản phẩm mới hoặc nhận thanh toán cho đến khi được xem xét lại. Nếu cho rằng đây là nhầm lẫn, vui lòng liên hệ đội ngũ hỗ trợ Merkovia.'
              : 'Đây là cảnh báo — gian hàng vẫn hoạt động bình thường. Vui lòng khắc phục vấn đề trên để tránh bị tạm đình chỉ trong các lần vi phạm tiếp theo.'
          }
        </p>
      </td>
    </tr>`,
  );
}

export function renderShopViolationText(params: {
  shopName: string;
  action: 'warning' | 'suspend';
  reasons: string;
  note: string;
}): string {
  const { shopName, action, reasons, note } = params;
  const isSuspend = action === 'suspend';
  return [
    'Xin chào,',
    '',
    `Đội ngũ Merkovia đã xem xét các báo cáo vi phạm liên quan đến gian hàng "${shopName}" (lý do được báo: ${reasons}).`,
    isSuspend
      ? 'Quyết định: TẠM ĐÌNH CHỈ hoạt động gian hàng.'
      : 'Quyết định: CẢNH BÁO vi phạm.',
    `Chi tiết: ${note}`,
    '',
    isSuspend
      ? 'Gian hàng tạm thời không thể đăng bán sản phẩm mới hoặc nhận thanh toán. Nếu cho rằng đây là nhầm lẫn, vui lòng liên hệ đội ngũ hỗ trợ Merkovia.'
      : 'Gian hàng vẫn hoạt động bình thường. Vui lòng khắc phục vấn đề để tránh bị tạm đình chỉ trong các lần vi phạm tiếp theo.',
    '',
    'Trân trọng,',
    'Đội ngũ Merkovia',
  ].join('\n');
}

/** Phiên bản text thuần cho email client không hiển thị HTML. */
export function renderOtpText(code: string, ttlMinutes: number): string {
  return [
    'Xin chào,',
    '',
    'Bạn vừa yêu cầu tạo tài khoản Merkovia bằng địa chỉ email này.',
    `Mã xác thực của bạn là: ${code}`,
    '',
    `Mã có hiệu lực trong ${ttlMinutes} phút. Nếu bạn yêu cầu một mã mới, mã này sẽ tự động hết hiệu lực.`,
    'Vì lý do bảo mật, vui lòng không chia sẻ mã này cho bất kỳ ai.',
    'Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email — tài khoản sẽ không được tạo.',
    '',
    'Trân trọng,',
    'Đội ngũ Merkovia',
  ].join('\n');
}
