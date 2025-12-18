---
title: 管理后台（人工确认）
date: 2025-12-18
---

## 人工付款确认（仅管理员）

<div id="status">加载中...</div>

<table border="1" cellpadding="8" cellspacing="0" style="width:100%;margin-top:12px;">
  <thead>
    <tr>
      <th>时间</th>
      <th>用户填写的付款信息</th>
      <th>状态</th>
      <th>操作</th>
    </tr>
  </thead>
  <tbody id="tbody">
    <tr><td colspan="4">加载中...</td></tr>
  </tbody>
</table>

<script>
const API_BASE = "https://feed-me.quark567.workers.dev"; // 如不同请改
const statusEl = document.getElementById("status");
const tbody = document.getElementById("tbody");

// 从 Cookie 读取 ADMIN_TOKEN
function getToken() {
  const m = document.cookie.match(/ADMIN_TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const token = getToken();
if (!token) {
  statusEl.innerHTML = "❌ 未登录：请在控制台设置 Cookie：document.cookie='ADMIN_TOKEN=xxx; path=/' 然后刷新";
  tbody.innerHTML = "<tr><td colspan='4'>无权限</td></tr>";
} else {
  statusEl.innerHTML = "✅ 已登录，正在加载数据...";
  loadList();
}

async function loadList() {
  try {
    const r = await fetch(API_BASE + "/admin/manual-list", {
      headers: { "Authorization": "Bearer " + token }
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error("加载失败: " + r.status + " " + t);
    }

    const j = await r.json();
    const list = j.list || [];

    if (!list.length) {
      tbody.innerHTML = "<tr><td colspan='4'>暂无记录</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    list.forEach(item => {
      const tr = document.createElement("tr");
      const time = item.createdAt ? new Date(item.createdAt).toLocaleString() : "-";
      const note = item.note || "(空)";
      const status = item.confirmed ? "✅ 已确认" : "⏳ 待确认";

      const btn = item.confirmed
        ? `<button disabled>已确认</button>`
        : `<button onclick="confirmPaid('${item.id}')">确认收款</button>`;

      tr.innerHTML = `
        <td>${time}</td>
        <td>${escapeHtml(note)}</td>
        <td>${status}</td>
        <td>${btn}</td>
      `;
      tbody.appendChild(tr);
    });

    statusEl.innerHTML = "✅ 数据加载完成";
  } catch (e) {
    statusEl.innerHTML = "❌ " + e.message;
    tbody.innerHTML = "<tr><td colspan='4'>加载失败</td></tr>";
  }
}

async function confirmPaid(id) {
  if (!confirm("确认该条记录已收款？确认后会生成下载token。")) return;

  try {
    const r = await fetch(API_BASE + "/admin/confirm", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id })
    });

    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { throw new Error("接口返回非JSON: " + text); }

    if (!r.ok || !j.ok) throw new Error(j.error || ("确认失败: " + r.status));

    const tokenStr = j.token;
    const link = location.origin + "/download/?token=" + encodeURIComponent(tokenStr);

    alert("已确认！\n给用户这个链接领取密码：\n" + link);
    loadList();
  } catch (e) {
    alert("失败：" + e.message);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}
</script>

---

### 管理员登录（只需一次）
在浏览器控制台执行（把 xxx 换成你 Worker 里设置的 ADMIN_TOKEN）：

```js
document.cookie = "ADMIN_TOKEN=xxx; path=/";
