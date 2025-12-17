---
title: 支付确认中
layout: page
---

<div id="status">正在确认支付结果，请勿关闭页面…</div>

<script>
(function () {
  const order = new URLSearchParams(location.search).get('order');
  if (!order) {
    document.getElementById('status').innerText = '订单参数缺失';
    return;
  }

  const timer = setInterval(() => {
    fetch('https://你的-workers域名/api/order-status?order=' + order)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          clearInterval(timer);
          location.href = '/download/?token=' + d.token;
        }
      });
  }, 2000);
})();
</script>
