# 中国象棋联机部署说明

> 结论先说：**联机象棋必须有一个长期在线的 Node.js 后端**。只有静态网页时，页面能打开，但“建房 / 加入 / 联机走子”不会工作。

## 1) 前端（Hexo / GitHub Pages）

这个目录已经是前端页面：

- `source/中国象棋/index.html`
- `source/中国象棋/main.js`
- `source/中国象棋/styles.css`

发布 Hexo 即可上线页面。

## 2) 后端（Node + Socket.IO）

后端目录在仓库根目录：

- `xiangqi-server/`

启动方式：

```bash
cd xiangqi-server
npm install
npm start
```

默认端口 `3000`，可用环境变量 `PORT` 覆盖。

健康检查：

`GET /api/health`

### 方案 A：最快上线，直接部署到 Render

仓库根目录已经补充了 `render.yaml`，可以直接给 Render 用。

当前仓库里的 `render.yaml` 已配置为 **免费实例**：

```yaml
services:
  - type: web
    name: xiangqi-server
    runtime: node
    plan: free
    rootDir: xiangqi-server
    buildCommand: npm install
    startCommand: npm start
```

也就是说，直接用 Render 的 **Blueprint** 导入仓库即可，不需要自己再手填启动命令。

#### 做法

1. 把整个仓库推到 GitHub。
2. 登录 Render。
3. 选择 **New +** → **Blueprint**，连接这个仓库。
4. Render 会读取仓库根目录的 `render.yaml`，创建一个 `xiangqi-server` 服务。
5. 等部署完成后，你会得到一个地址，例如：

```text
https://xiangqi-server-xxxx.onrender.com
```

6. 打开：

```text
https://xiangqi-server-xxxx.onrender.com/api/health
```

如果返回类似：

```json
{"ok":true,"rooms":0}
```

说明后端已经可用。

#### 免费版说明

- 这个配置走的是 Render **Free** 实例，适合先跑起来、先能用。
- 免费版在 **15 分钟没有请求** 后会休眠。
- 下次再访问时会自动拉起，通常需要 **约 1 分钟**。
- 如果只是你自己测试、或者小规模联机，这个方案够用。
- 如果你后面想更稳定、减少冷启动，再升级到付费实例即可。

### 方案 B：自己买 VPS，直接用仓库里的脚本部署

后端目录已经自带：

- `xiangqi-server/deploy-server.sh`
- `xiangqi-server/deploy-nginx.conf.example`
- `xiangqi-server/ecosystem.config.js`

如果你有 Ubuntu 服务器，可以执行：

```bash
sudo bash xiangqi-server/deploy-server.sh your-domain.com /var/www/Quarkbobo
```

它会帮你安装：

- Node.js
- PM2
- Nginx
- HTTPS 证书（Certbot）

更适合你后面长期稳定使用。

### 方案 C：只想临时测试

本地跑后端也行：

```bash
cd xiangqi-server
npm install
npm start
```

然后本机访问 `http://localhost:3000/api/health`。

但这只能自己测试，别人无法通过公网和你联机，除非你再配内网穿透或公网服务器。

## 3) 页面连接后端

打开 `/中国象棋/` 页面后，在“后端地址”输入框里填你的后端地址（例如 `https://your-xiangqi-server.com`），点击“保存后端地址”即可联机。

该地址会保存在浏览器本地存储里。

### 你现在多了 3 种接入方式

#### 方式 1：手动填

最简单，直接在页面输入框里填。

#### 方式 2：固定写死到页面配置

编辑：

`source/中国象棋/config.js`

例如改成：

```js
window.__XIANGQI_SERVER_CONFIG__ = {
  serverUrl: "https://xiangqi-server-xxxx.onrender.com",
};
```

这样用户打开页面就会自动连后端，不用每次手填。

#### 方式 3：用链接参数分享

你可以直接把联机地址分享成：

```text
/中国象棋/?server=https://xiangqi-server-xxxx.onrender.com
```

别人点开后会自动带上后端地址。

## 推荐路线

如果你现在只是想**最快恢复线上对弈**：

1. 先用 **Render 部署 `xiangqi-server`**；
2. 把得到的地址写进 `source/中国象棋/config.js`；
3. 重新发布 Hexo。

这样改动最小，最快能用。
