# 中国象棋联机部署说明

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

## 3) 页面连接后端

打开 `/中国象棋/` 页面后，在“后端地址”输入框里填你的后端地址（例如 `https://your-xiangqi-server.com`），点击“保存后端地址”即可联机。

该地址会保存在浏览器本地存储里。
