---
title: 政治月测后宫版新题题库
date: 2025-12-17
---

<div style="padding:16px;border:1px solid #eee;border-radius:12px;margin:16px 0;">
  <h3 style="margin:0 0 8px;">付费下载</h3>
  <p style="margin:0 0 12px;">支付 5 元后自动获取下载链接与解压密码。</p>
  <button id="buyBtn" style="padding:10px 14px;border-radius:10px;border:0;cursor:pointer;">
    立即购买（5元）
  </button>
  <div id="buyMsg" style="margin-top:10px;white-space:pre-wrap;"></div>
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


