# 火炬议会 · Supabase Free + Realtime 交接

## 问题管理后台

新增代码在 `council/admin/`，数据库安装脚本为本目录 `admin-setup.sql`。
功能、权限设计、本地启动、管理员绑定与测试见 `../admin/README.md`。
脚本需要部署时单独执行；新增代码不代表正式项目已安装后台。

状态：新加坡独立 Supabase Free 项目已建立，创建于 2026-10-12。仅涉及火炬议会，与旧 AI 面试项目分离。

- Supabase 项目 ID：`eflkiihedqlcaibpyoqr`
- Region：`ap-southeast-1`
- 项目控制台：https://supabase.com/dashboard/project/eflkiihedqlcaibpyoqr
- 网站：https://torchlightskill.com/council/
- 网页前端：`council/index.html` 和 `council/share/`
- 公开只读和匿名 RPC 客户端：`council/live-core.js`
- 两个启动入口：`council/live-bootstrap.js` 和 `council/share/live-bootstrap.js`

## 数据库（实际已执行）

Supabase migration：`create_torchlight_council_live_polling`（通过 Supabase Migration 接口）以及 `secure_auto_rls_trigger_and_private_vote_policy`。

| 数据表 | 作用 | 游客权限 |
|---|---|---|
| `public.council_topics` | 题目、开关和截止时间 | 只读 |
| `public.council_choices` | 28 英雄特性及 2+4 选项，真实计票计数器 | 只读 |
| `public.council_votes` | 每个匿名 Supabase Auth 用户在每题的唯一票（联合主键） | 无权限 |
| `public.council_vote_events` | 投票/改选事件，**不含用户身份** | 只读 + Realtime |
| `public.council_questions` | 玩家提问、作者 UUID、审核状态 | 仅已审核的正文或自己的问题 |
| `public.council_keyword_stats` | 预设分类关键词次数，含待审核投稿 | 只读 + Realtime |

Realtime publication：`council_choices` UPDATE、`council_vote_events` INSERT、`council_keyword_stats` INSERT/UPDATE。

数据库函数均以最小参数暴露：

- `council_cast_vote(p_topic,p_choice)`：仅 authenticated 调用；校验截止时间和合法选项；行锁/咨询锁串行化同账号重复票，原子增加/撤销计数；只有有效新增/改选才写事件。自证身份来自 `auth.uid()`，不能由前端传用户 UUID。
- `council_my_votes()`：仅 authenticated，可读取调用者自己的选择。
- `council_submit_question(p_body)`：仅 authenticated，限定 8–160 字、最近 1 分钟/最近 24h 的频率、去重，问题默认为 `pending`；关键词根据服务端固定分类生成并汇总（即使正文仍待审核）。
- `council_question_keywords(text)`：内部辅助函数，不能由匿名公开用户执行。

项目自带的 `public.rls_auto_enable()` 触发器函数已撤销公共执行权限。所有公开数据表均启用 RLS，仅公开汇总和审核后正文。Supabase Security Advisor 的 authenticated definer 警告中，上述三个 RPC 的特权运行是特意设计的入口，必须配合函数内部 `auth.uid()` 校验和角色执行授权。

## 上线前需要确认

**Supabase 控制台开启 Anonymous Sign-Ins**：

https://supabase.com/dashboard/project/eflkiihedqlcaibpyoqr/auth/providers

页面首次访问只获取匿名公开汇总，不消耗 Auth MAU；首次点击投票或提交问题时调用 `signInAnonymously()`。如果 GoTrue 的匿名登录未开启，游客只能浏览，无法投票或提问。这个设置不能通过当前 Supabase MCP 插件完成，需要组织管理者在控制台开启。

## 公共数据与分享

- 全站票数**从零开始**；禁止将以前网页的模拟票数导入数据库。
- 仅后端确认的 INSERT 事件在客户端弹出气泡；已经移除网页自动制造票数的演出代码。
- Realtime 断开时每隔约 12 秒刷新公共汇总；客户端只发布公开 `sb_publishable_` key，**不存放 secret、service_role 或数据库密码**。
- 旧浏览器 localStorage 的「模拟投票」不得迁移为真实选票。新选择以服务器 `council_my_votes()` 的结果为准。
- 每条问题先进入审核队列。运营在 Supabase Table Editor 将 `council_questions.status` 设为 `approved` 后，其他玩家才能看到正文。聚合关键词包括待审核投稿，需避免营销时将其误解为已审核意见。
- Supabase 匿名账户不等于实名唯一玩家；清空浏览器或新设备可能产生不同匿名身份。数据库已提供每账号一票和基本频率限制，面向大流量需另加 CAPTCHA、防机器人和 Abuse 监控。

## 验收要求

1. Supabase Auth 匿名登录已启用。
2. PC/手机两个浏览器分别投给不同英雄：总数增加、另一个页面展示真实 +1 气泡、换票后原英雄 -1 和新英雄 +1。
3. 同一浏览器重复点同一个英雄不重复计票；刷新后仍显示自己的选项。
4. 从 `/council/share/?kind=hero&hero=bing_2` 直接投票，回到主站应看到同一条真实选票。
5. 圆桌提问进入待审核；其他浏览器关键词增加且没有泄露未审核正文；审核后才出现在最近问题。
6. 核对 GitHub Pages 发布和实际加载，不仅是源码语法。
