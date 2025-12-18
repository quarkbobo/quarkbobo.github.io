---
title: 下载与解压密码
---

<div id="box" style="padding:16px;border:1px solid #eee;border-radius:12px;">
  <h2 style="margin:0 0 8px;">领取结果</h2>
  <div id="out" style="white-space:pre-wrap;"></div>
</div>

<script>
(function(){
  const API_BASE = "https://feed-me.quark567.workers.dev";
  const out = document.getElementById("out");

  const params = new URLSearchParams(location.search);
  const token = params.get("token");

  if (!token) {
    out.textContent = "缺少参数：token\n请从支付成功页进入本页面。";
    return;
  }

  out.textContent = "正在领取中…";

  fetch(API_BASE + "/api/redeem?token=" + encodeURIComponent(token))
    .then(r => r.json())
    .then(j => {
      if (!j.ok) throw new Error(j.error || "redeem failed");

      // j.download = 你的自有服务器链接
      // j.password = ZIP_PASSWORD
      out.innerHTML =
        "✅ 领取成功\n\n" +
        "下载地址：\n" +
        "<a href='" + j.download + "' target='_blank' rel='noopener'>" + j.download + "</a>\n\n" +
        "解压密码：\n" +
        "<b style='font-size:18px;'>" + j.password + "</b>\n\n" +
        "（注意：token 只能使用一次）";
    })
    .catch(e => {
      out.textContent = "领取失败：" + (e && e.message ? e.message : e) + "\n\n可能原因：token 过期/已使用。";
    });
})();
</script>
