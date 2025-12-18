---
title: 支付确认
---

<div id="box" style="padding:16px;border:1px solid #eee;border-radius:12px;">
  <h2 style="margin:0 0 8px;">正在确认支付状态…</h2>
  <div id="status" style="white-space:pre-wrap;"></div>
</div>

<script>
(function(){
  const API_BASE = "https://feed-me.quark567.workers.dev";
  const statusEl = document.getElementById("status");

  const params = new URLSearchParams(location.search);
  const order = params.get("order");

  if (!order) {
    statusEl.textContent = "缺少参数：order\n请从支付流程进入本页面。";
    return;
  }

  statusEl.textContent = "订单号：" + order + "\n轮询中…";

  async function poll(){
    try{
      const r = await fetch(API_BASE + "/api/order-status?order=" + encodeURIComponent(order));
      const j = await r.json();

      if (!j.ok) throw new Error(j.error || "order-status failed");

      if (j.paid && j.token) {
        statusEl.textContent = "支付成功！正在跳转到下载页面…";
        location.href = "/download/?token=" + encodeURIComponent(j.token);
        return;
      }

      statusEl.textContent = "尚未支付或未到账，请稍候…\n（每 2 秒检查一次）";
    }catch(e){
      statusEl.textContent = "查询失败：" + (e && e.message ? e.message : e) + "\n2 秒后重试…";
    }
    setTimeout(poll, 2000);
  }

  poll();
})();
</script>
