---
title: 管理后台（人工确认）
---

<div style="padding:16px;border:1px solid #eee;border-radius:12px;">
  <h2>人工付款确认</h2>
  <p>仅管理员可用</p>

  <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th>时间</th>
        <th>用户填写的付款信息</th>
        <th>状态</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody id="list">
      <tr><td colspan="4">加载中…</td></tr>
    </tbody>
  </table>
</div>

<script>
(function(){
  const API = "https://feed-me.quark567.workers.dev";
  const ADMIN_TOKEN = "请在这里填你的 ADMIN_TOKEN"; // ⚠️ 只给你自己用
  const tbody = document.getElementById("list");

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  async function load() {
    tbody.innerHTML = "<tr><td colspan='4'>加载中…</td></tr>";

    const r = await fetch(API + "/admin/manual-list", {
      headers: { Authorization: "Bearer " + ADMIN_TOKEN }
    });
    const j = await r.json();

    if (!j.ok) {
      tbody.innerHTML = "<tr><td colspan='4'>加载失败</td></tr>";
      return;
    }

    if (!j.list.length) {
      tbody.innerHTML = "<tr><td colspan='4'>暂无记录</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    j.list.forEach(item => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${fmtTime(item.createdAt)}</td>
        <td>${item.note || ""}</td>
        <td>${item.confirmed ? "已确认" : "待确认"}</td>
        <td>
          ${item.confirmed
            ? "已发货"
            : `<button data-id="${item.id}">确认已付款</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });

    // 绑定按钮事件
    document.querySelectorAll("button[data-id]").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("确认该用户已付款？")) return;

        const id = btn.getAttribute("data-id");
        btn.disabled = true;
        btn.textContent = "处理中…";

        const r2 = await fetch(API + "/admin/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + ADMIN_TOKEN
          },
          body: JSON.stringify({ id })
        });
        const j2 = await r2.json();

        if (j2.ok) {
          alert("已确认！下载链接：\n" +
            location.origin + "/download/?token=" + j2.token);
          load(); // 重新加载列表
        } else {
          alert("确认失败");
          btn.disabled = false;
          btn.textContent = "确认已付款";
        }
      };
    });
  }

  load();
})();
</script>
