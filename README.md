# TorchlightSkill · 火炬工具箱

公开静态官网：[https://torchlightskill.com/](https://torchlightskill.com/)。仓库包含工具介绍页面与公开运行资源。

## 发布目录

GitHub Pages 从 `main` 分支的仓库根目录发布，根目录 `.nojekyll` 保持静态文件直出。

- `index.html`：工具箱首页。
- `talos/index.html`：塔罗斯经营模拟入口，对应 [https://torchlightskill.com/talos/](https://torchlightskill.com/talos/)。
- 根目录 `CNAME`：官网域名；`talos/` 子目录与首页共用域名和 HTTPS。

## 塔罗斯经营模拟

游戏纯前端运行，图片、声音和 Three.js 随静态文件加载。经营存档与偏好保存在用户浏览器，可通过游戏内导出、导入保留或迁移。

复刻练习与原创挑战，规则持续校准。原创挑战的合约、战斗、压力和积分为实验设定，不代表正式游戏掉落或货币收益；实际玩法以游戏内规则为准。

Three.js 许可证随运行文件保留在 [`talos/vendor/three/LICENSE`](talos/vendor/three/LICENSE)。

当前模拟器版本v0.6：神秘背景音乐与环境声独立循环，四种野兽吞噬音效；声音设置可分别控制音乐、音效与配音。首次点击后播放声音。

当前模拟器版本v0.6.1：首次进入先选择开始或继续；新手从第1日空监狱开始，巡监开启第一间牢房。预设练习和原创挑战会明确说明初始囚犯。取消开局保留原存档；旧存档可以继续。
