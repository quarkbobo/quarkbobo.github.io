---
title: 政治月测后宫版新题题库
date: 2025-12-17
---

<div style="padding:16px;border:1px solid #eee;border-radius:12px;margin:16px 0;">
  <h3>付费下载（￥5）</h3>
  <p>请使用微信或支付宝扫码付款。</p>

  <img src="/images/wechat-pay.png" width="180">

  <p style="margin-top:12px;">
    付款后，请点击下面按钮填写付款信息。
  </p>

  <a href="/success/" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#333;color:#fff;">
    我已付款，填写信息
  </a>
</div>


<script>
(function(){
  const API_BASE = "https://feed-me.quark567.workers.dev";
  const btn = document.getElementById("buyBtn");
  const msg = document.getElementById("buyMsg");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    msg.textContent = "正在创建订单…";

    try {
      const r = await fetch(API_BASE + "/api/create-order", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "create-order failed");

      msg.textContent = "订单已创建，正在跳转支付…";
      // 这里会自动跳到你自己的域名 /success（不会出现 pages.dev）
      location.href = j.pay_url;
    } catch (e) {
      msg.textContent = "失败：" + (e && e.message ? e.message : e);
      btn.disabled = false;
    }
  });
})();
</script>


<div style="padding:16px;border:1px solid #eee;border-radius:12px;margin:16px 0;">
  ...
</div>
<script>
  ...
</script>


