# 刷宝游戏工具箱：新工具接入与部署

本说明供协作 AI 使用。先确认用户指定的工具名、地址与发布范围；本文本身不授予仓库、域名或生产服务的权限。

## 正式地址与仓库

- 主站：https://torchlightskill.com/
- 已有工具：https://torchlightskill.com/talos/
- 正式仓库：https://github.com/xiaoyihuang0503-cyber/torchlightskill-web
- 发布设置：https://github.com/xiaoyihuang0503-cyber/torchlightskill-web/settings/pages
- 部署记录：https://github.com/xiaoyihuang0503-cyber/torchlightskill-web/actions
- 2026-10-12 核验：GitHub Pages 从 main 分支根目录发布，CNAME 为 torchlightskill.com，HTTPS 已开启。后续执行前应复核设置。

## 选择地址

默认使用主域名路径：`https://torchlightskill.com/<slug>/`。例如 `/buildlab/` 对应仓库 `buildlab/index.html`。无需新 DNS，适合当前静态工具。

独立子域名如 `buildlab.torchlightskill.com` 需要独立托管项目和 DNS 配置，不能通过在主站仓库增加目录自动获得。工具名称须按用户要求确定，buildlab 仅为示例。

## 主域名路径部署流程

### 1. 独立开发与构建

在独立开发目录完成工具，不覆盖主站根目录。纯 HTML/CSS/JS 可直接发布；React/Vue 等工程先构建，只接入公开运行产物。

GitHub Pages 仅提供静态托管。服务器接口、私密 AI 调用、登录和数据库需单独后端；任何 API Key 不得进入前端代码或构建产物。

### 2. 子路径适配

图片、字体、音频、脚本和动态导入需适配 `/<slug>/`。例如使用 `./assets/app.js`，不能误用主站 `/assets/app.js`。Vite 的 base 按实际部署路径配置，例如 `/buildlab/`。

SPA 采用 hash 路由或已验证的静态路由方案；GitHub Pages 不自动将任意深层路径重写到 index.html。检查 manifest、Service Worker 的 scope，避免影响主站与其他工具。

### 3. 取得最新仓库

有仓库权限的环境可克隆：

```sh
git clone https://github.com/xiaoyihuang0503-cyber/torchlightskill-web.git
cd torchlightskill-web
```

复用 checkout 时先执行：

```sh
git status --short
git fetch origin main
git pull --ff-only origin main
```

遇到未提交修改或分叉，先确认归属，再合并自己的改动；不丢弃其他线程修改、不强制推送。没有 GitHub 写权限时，交付补丁或在具备权限的环境继续，不要求把令牌写进代码、文档或命令行。

### 4. 接入公开产物

将运行文件放进仓库 `<slug>/`，保持 `<slug>/index.html` 可直接访问。保留根目录 `.nojekyll` 和原 CNAME 内容 `torchlightskill.com`。

不得复制 `.git`、其他站点 CNAME、.env、Cookie、密钥、私有来源、原始转写、用户数据、测试存档、日志、node_modules 或不必要的源码映射。公开仓库内容可能同时被 Pages 提供，文档也不能含秘密。

不得覆盖已有 talos/ 和其他工具目录。

### 5. 主站入口

在根目录 index.html 的工具列表增加卡片，链接为 `/<slug>/`。使用当前品牌“刷宝游戏工具箱”和现有卡片结构，适配手机。不重写整个首页，不擅自更改已有产品名称、作者信息、域名、统计脚本或权限。

独立子域名已部署时，卡片改用其完整 HTTPS 地址。

### 6. 发布前验证

- 本机主站卡片可进入工具；直接打开和刷新可用。
- 样式、图片、脚本、音频、字体无 404。
- 电脑与手机的主要操作通过，控制台无阻断错误。
- 首页与 talos 工具未被破坏。
- 已按公开文件清单检查，无凭据或私有数据。

### 7. 限定范围提交并发布

获得当前任务明确发布授权后执行。示例命令中的 buildlab 须替换为实际目录：

```sh
git diff --check
git add -- buildlab index.html
git commit -m "Add buildlab tool"
git push origin main
```

若用户指定 PR 工作流，创建 PR 并等待指定的合并流程，不绕过分支保护。若 push 因远端更新拒绝，fetch 后合并或重放自己的改动，重新验证；禁止 force push。

### 8. 线上验收与交付

核对 Actions 中对应提交 SHA 的 Pages 部署 success。push 成功不等于上线完成。

验证正式首页和工具 URL，实际点击卡片、刷新、使用核心操作；核对关键资源返回和内容，保存截图。交付正式地址、提交 SHA、部署记录、验证结果和未验证限制。

回滚只撤回本轮提交，不重置其他人的后续改动，不删除用户存档。已有发布授权不自动授权破坏性操作。

## 独立子域名流程

1. 为新工具准备独立托管项目，例如单独的 GitHub Pages 仓库。
2. 在该项目 Pages 设置填写 `<slug>.torchlightskill.com`，不要修改主站 CNAME。
3. 经用户授权并具有域名管理权限后，新增 DNS：类型 CNAME、主机名 `<slug>`、目标 `xiaoyihuang0503-cyber.github.io`。目标不包含协议、仓库路径或斜杠。
4. 保留主站现有 DNS 记录，等待域名校验和证书签发，核验 HTTPS。
5. 在主站工具列表加入该子域名的链接。

DNS 管理后台与权限未在本说明中核实；没有权限时交付所需记录，等待域名管理者配置，不能宣称已经部署。若使用其他托管商，DNS 目标以该托管项目的实际指引为准。

子域名与主站属于不同来源，localStorage、登录和存档不自动共享。跨站迁移、CORS、Cookie 和共享登录需要另外设计，不能默认为已支持。

官方文档：https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## 推荐任务提示词

读取本文与仓库现有 README、首页结构及适用 AGENTS.md。把我指定的新工具接入 `https://torchlightskill.com/<实际工具目录>/`，完成构建、子路径适配、公开产物检查、首页卡片接入和实际验收。保留现有品牌、工具、CNAME、统计和用户存档。只有在我明确授权上线时才提交推送；没有权限就交付可应用补丁。发布后核验对应 SHA 的 Pages 成功及真实线上操作，给出 URL、提交和截图。不要擅自创建子域名或迁移托管。
