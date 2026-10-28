# 目标逐项审计

审计原则：以当前文件、真实浏览器输出及可打开原型为证据；最终选型不是本轮执行前置条件。5个游戏的任务书误数已用源文件/生成页证据纠正为4，不缩减真实内容范围。

| 要求 | 当前证据 | 结论 |
|---|---|---|
| 先读进度，保留既有部署/动画记录 | 首轮读取、freeze.json的PROGRESS/BLOCKED前缀；freeze-final.json prefix=true | 已保留，仅追加 |
| SHA256与旧证据备份，复跑原test/probe | 287项freeze.json；previous-leader/；node-tests.log；original-probe.log；baseline/ | 268通过、0跳过；12视图0控制台错误 |
| ≤10行开工回执 | PROGRESS本轮8行开工回执 | 已交 |
| 只在白名单写入，不部署/改源码/题库/CI/依赖 | freeze-final.json changed=[]、productionDiff空、HEAD相同；delivery-audit unexpected=[]；git状态 | 已验证 |
| 最多5条有证据的布局结论 | README/REPORT五条，分别引用原/新metrics、源内容和截图，实测与判断分开 | 已交 |
| 真实内容，原品牌/摘要/目录/NEW约束 | content.json 6posts/7archive/3groups/4games/2完整body；14来源SHA；56场景正文与headingID核验；冻结测试 | 无虚构；72小时之外不手工NEW；放大标题自然换行的未来契约差异已说明 |
| A/B真正不同结构，仍保留原站星球 | home-a.html先hero后latest；home-b.html桌面grid并排、手机recent先planet；截图；planet-source.json | 桌面与手机均可区分；静帧明确标注 |
| frontend-design与网页规范 | DESIGN.md token/构图/自评；独立设计审查建议已在第2轮处理；REPORT列规范来源 | 已使用，无需新增插画 |
| 原型入口、切换、内页桌面/手机 | index.html、2首页、2文章、archive、games；56场景/112截图 | 可实际打开，非生成UI图片 |
| 原链接与所有文章可达 | content原href、localByTitle映射；56场景HTTP/锚点对照、4game精确href、全部6标题 | 原站入口保留；无假控件 |
| 无目录居中，有目录桌面右侧/手机details | article-layout样式、原正文；目录键盘打开/跳转断言、截图 | 已验证 |
| 同尺寸前后对比 | compare.html/js，8页面/区域×2视口；audit真实键盘切换，16组naturalWidth/Height | 已交，原型工具条高度如实说明 |
| 1440×1000/390×844及320/768额外检查 | 最终56场景还含820×900；原始metrics/screenshot | 已验证 |
| ≥44px入口、焦点、200%可读、不重叠/裁切 | 56场景触控、横向geometry；129补充含上下区间相交、下方焦点；200%游戏人工图审 | 已验证检查范围；非所有浏览器/路径的穷尽证明 |
| 减少动态 | 7页reduced-motion场景无运行动态；静态原型 | 不外推动画性能 |
| 密度、正文起点、找到入口步骤比较 | README问题1–5；baseline与visual-metrics；不把6→2篇当单卡压缩；手机正文晚47.6px保留 | 已交，不伪称全面提前 |
| 独立验收实际运行，故障注入红→绿 | verify.cjs与最终log；同assertNoHorizontalOverflow检测780→390；真实home hash相同 | 已验证；仅临时副本，已移除 |
| 不改冻结测试、skip、门槛；最多2轮 | 冻结指纹；保留第1轮失败、第2轮及审查修正；CDP/日志基础设施原因另记 | 已遵守，没有第3套/第3轮设计扩展 |
| 推荐、取舍、实施优先顺序、未解决项 | README/REPORT、DESIGN；A推荐，B快速内容，4步实施建议，真实GPU/字体/手机首屏/用户测试限制 | 已交 |
| PROGRESS/BLOCKED、实际输出及预览 | 本轮最终追加记录；BLOCKED末尾“无”；最终回复和4001预览 | 随交付提供，尚未实施/发布 |

最终证据主目录：`evidence/verification-2026-09-08T13-33-48-256Z/`。主代理另查看最终A/B、手机文章、比较页、报告200%及游戏200%截图。没有把静帧或测试绿灯当作审美选定。
