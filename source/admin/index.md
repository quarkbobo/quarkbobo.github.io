---
title: 管理后台（人工确认）
date: 2025-12-18
---

## 人工付款确认（仅管理员）

> ⚠️ 本页面仅管理员使用  
> 登录方式：**浏览器 Cookie 中设置 ADMIN_TOKEN**

---

### 当前状态
<div id="status">检查登录中...</div>

---

### 人工付款记录
<table border="1" cellpadding="8" cellspacing="0" style="width:100%;margin-top:12px;">
  <thead>
    <tr>
      <th>时间</th>
      <th>用户填写的付款信息</th>
      <th>状态</th>
      <th>操作</th>
    </tr>
  </thead>
  <tbody id="list">
    <tr><td colspan="4">加载中...</td></tr>
  </tbody>
</table>

<script>
const API_BASE = "https://feed-me.quark567.workers.dev";

/** 从 Cookie 读取 ADMIN_TOKEN */
function getAdminToken() {
  const m = document.cookie.match(/ADMIN_TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const token = getAdminToken();
const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

if (!token) {
  statusEl.innerHTML = "❌ 未登录，请先设置 ADMIN_TOKEN Cookie";
  listEl.innerHTML = "<tr><td colspan='4'>无权限</td></tr>";
} else {
  statusEl.innerHTML = "✅ 已登录，正在加载数据...";
  loadList();
}

async function loadList() {
  try {
    const r = await fetch(API_BASE + "/admin/manual-list", {
      headers: {
        "Authorization": "Bearer " + token
      }
    });
    if (!r.ok) throw new Error("加载失败");
    const j = await r.json();

    if (!j.list.length) {
      listEl.innerHTML = "<tr><td colspan='4'>暂无记录</td></tr>";
      return;
    }

    listEl.innerHTML = "";
    j.list.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(item.createdAt).toLocaleString()}</td>
        <td>${item.info}</td>
        <td>${item.paid ? "✅ 已确认" : "⏳ 待确认"}</td>
        <td>
          ${item.paid ? "-" : `<button onclick="confirmPay('${item.orderId}')">确认收款</button>`}
        </td>
      `;
      listEl.appendChild(tr);
    });
  } catch (e) {
    statusEl.innerHTML = "❌ 加载失败：" + e.message;
    listEl.innerHTML = "<tr><td colspan='4'>错误</td></tr>";
  }
}

async function confirmPay(orderId) {
  if (!confirm("确认该订单已收款？")) return;
  try {
    const r = await fetch(API_BASE + "/admin/confirm-paid", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ orderId })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "失败");
    alert("已确认");
    loadList();
  } catch (e) {
    alert("失败：" + e.message);
  }
}
</script>

---

### 管理员登录方式（只需一次）

在浏览器控制台执行：

```js
document.cookie = "ADMIN_TOKEN=你在Worker里设置的那个值; path=/";
