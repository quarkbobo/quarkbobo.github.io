# Milky Frog 游戏目录接入设计

日期：2026-10-31

## 目标

在 Quarkbobo 的“游戏合集”页面收录 `https://milkyfrog.com/games` 上的全部游戏条目，并部署到现有 GitHub Pages 网站。玩家点击卡片后，在新标签页打开对应游戏的原始托管地址。

## 收录范围与数据

截至 2026-10-31，来源页标注并列出 35 款游戏。页面上另有 10 个 App Store 下载入口，属于应用下载项，不计入游戏目录。保留页面现有的四个 Quarkbobo 本地游戏入口，因此最终目录包含 39 个入口。

新增条目使用页面展示的标题、作者（有标注时）和原始地址：

| 游戏 | 作者（原页有标注时） | 原始地址 |
| --- | --- | --- |
| 俄罗斯奶块 | EIAAN | https://milkcubebycyanchan1eiann.netlify.app/ |
| 合成大奶蛙 | 十二月的狼头 | https://yhsome.github.io/BigNaiWa/v1/ |
| 合成小奶蛙 | 十二月的狼头 | https://yhsome.github.io/SmallNaiWa/ |
| 旅行奶蛙 |  | https://www.bilibili.com/toy/TravelMilkyFrog/index.html |
| 奶国物语 | 雀石不诗人 | https://e.233ly.com/bn1yRe |
| 奶了个蛙 |  | https://junjunya2020.github.io/nailegewa |
| 奶了个蛙2 | 河南农大表白墙 | https://nai-le-ge-wa-wemcta8qgu2.qoder.zone/ |
| 奶蛙2048 | 十二月的狼头 | https://yhsome.github.io/Nai2048/ |
| 奶蛙2048超级版 |  | https://game.0z.hk/game/2048/ |
| 奶蛙爱洗澡 | kingtrain | https://milkfrog-bath.pages.dev/ |
| 奶蛙打砖块 | nnn | https://niuniu513-ask.github.io/milky-breakout/?v=1deb2eb |
| 奶蛙的奶块雨 | 光影集 | https://naiwa-milk-rain.pages.dev/ |
| 奶蛙的小窝 |  | https://naiwaxiaowu.pages.dev/ |
| 奶蛙放屁 | 二奶 | https://naiwa-fart.pages.dev/ |
| 奶蛙飞机大战 | 丶基控Q | https://naiwafly.dpdns.org/ |
| 奶蛙工厂 |  | https://66970010-boop.github.io/frog-miner |
| 奶蛙街舞 | 念因 | https://nailong-dance.pages.dev |
| 奶蛙快跑 |  | https://e.233ly.com/1ABrH3 |
| 奶蛙雷霆小队 | 雀石不诗人 | https://e.233ly.com/v65Ihd |
| 奶蛙奶茶铺 |  | https://naiwanaichadian.pages.dev/ |
| 奶蛙挠痒 | Elio | https://naiwa.bocchi.website/ |
| 奶蛙神跑 |  | https://naiwa.me |
| 奶蛙贪吃蛙 |  | https://milkyfrogs.toolsbox.vip/ |
| 奶蛙踢馆 | 胆子肥嘟嘟 | https://night-market-rumble-54328.app.workbuddy.host/ |
| 奶蛙跳一跳 | 光影集 | https://naiba-jump.pages.dev/ |
| 奶蛙推奶块 | EIAAN | https://sparkly-macaron-5c86c7.netlify.app/ |
| 奶蛙五子棋 |  | https://wudibaolongzhanshi1234.github.io/1335689.giyhub.io/ |
| 奶蛙消消乐 |  | https://chenckx0614.github.io/naiwaxxl/ |
| 奶蛙颜色大挑战 |  | https://milkyfrog.toolsbox.vip/ |
| 奶蛙一跳 | Sn | https://naiwa-jump.pages.dev/ |
| 奶蛙羽毛球 |  | https://www.bilibili.com/toy/naiwa-badminton/index.html |
| 奶蛙jump |  | https://naiwai-jump.github.io/ |
| 勇者奶蛙传 | 雀石不诗人 | https://e.233ly.com/yDkGpm |
| 召唤神龙 | 鱼戏荷 | https://naiwa.games/ |
| 抓奶蛙 | 龙井茉莉 | https://www.bilibili.com/toy/zhua-nai-wa/index.html |

## 页面行为与呈现

- 修改现有游戏合集文章，保留“贪吃蛇CTF”“2048”“中国象棋”“国际象棋”四个本地入口。
- 将 35 个新增游戏显示为与当前主题一致的卡片；卡片包含标题，并在原页面提供作者信息时一并显示。
- 外链在新标签页打开，并使用 `noopener noreferrer`。
- 继续使用当前主题的游戏卡片布局和移动端单列布局，不添加新的运行时依赖或游戏 iframe。

## 资源与边界

只在 Quarkbobo 中发布目录文字和链接，不下载、复制或重新托管第三方游戏代码、图片、音频或其他资源。来源页面没有发现可据以确认这些作品可复制分发的授权信息；链接回原始托管站也更容易保留作者署名及其更新。

第三方地址由各自作者或平台维护，未来可能失效或改址。项目可保证目录链接本身正确，不能保证外部游戏长期在线。

## 部署与验收

- GitHub Pages 仍使用仓库现有的 `master` 分支部署工作流。
- 更新现有游戏页 CI 约束，使它检查 39 个入口：四个原有本地地址保留，35 个新增地址各出现一次。
- 部署后检查 Pages 工作流成功，并在发布页面确认 39 个入口、作者标注和外链目标。
