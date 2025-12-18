---
title: 付款确认
---

<div style="padding:16px;border:1px solid #eee;border-radius:12px;">
  <h2>付款确认</h2>

  <p>请填写付款信息（用于人工核对）：</p>

  <input id="note" placeholder="付款备注 / 微信昵称 / 时间" style="width:100%;padding:8px;">
  <button id="submit" style="margin-top:10px;padding:8px 12px;">提交</button>

  <div id="msg" style="margin-top:10px;"></div>
</div>

<script>
(function(){
  const API = "https://feed-me.quark567.workers.dev";
  const btn = document.getElementById("submit");
  const msg = document.getElementById("msg");

  btn.onclick = async () => {
    const note = document.getElementById("note").value.trim();
    if (!note) {
      msg.textContent = "请填写付款信息";
      return;
    }

    msg.textContent = "提交中…";

    const r = await fetch(API + "/api/manual-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note })
    });
    const j = await r.json();

    if (j.ok) {
      msg.textContent = "提交成功，请等待确认";
    } else {
      msg.textContent = "提交失败";
    }
  };
})();
</script>
