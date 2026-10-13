# 火炬议会问题管理后台

入口：`/council/admin/`。沿用奶油黄、粗描边风格，只新增后台文件，不改动公开首页、英雄投票、老虎机和投弹计数。

## 已实现

- 管理员邮箱密码登录。每个后台接口都由数据库校验管理员名单。
- 投稿全文搜索，按状态、原始关键词 / 运营分类、北京时间日期筛选，时间 / 点击热度排序与分页。
- 全部、待审核、已公开、拒绝 / 归并数量；投稿关键词分布。
- 单条或本页批量公开 / 拒绝，处理记录与状态冲突提示。
- 分类、内部备注、相似问题归并与解除归并。投稿原文和原始关键词保持不变。
- CSV 导出当前筛选范围的全部结果（每次最多 10,000 条），保留原文，防止表格公式注入。

后台不会自动审核。现有投稿继续保持原来的状态，需管理员明确处理后才改变。

## 本地启动

在仓库根目录执行：

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8080/council/admin/`。Supabase SDK 沿用公开站的固定版本 `2.87.3`，从 esm.sh 加载，失败时切换 jsDelivr。浏览器需要能连接 Supabase 和 SDK CDN。

## 首次安装与账号绑定

代码合并或本地启动不会自动安装数据库接口，也不会创建管理员。部署者需要：

1. 在 `eflkiihedqlcaibpyoqr` 项目通过 Supabase migration 执行 `council/supabase/admin-setup.sql`。脚本新增私有管理员名单、处理元数据、审计表和四个管理 RPC，不改动既有投稿内容、公开计票和 RLS 规则。SQL 已在本地 PostgreSQL 引擎 PGlite 测试，尚未在正式项目执行。
2. 在 Supabase Dashboard → Authentication → Users 创建 / 邀请确定的管理员邮箱账号，并设置密码。Supabase 项目成员账号与应用 Auth 用户是独立的；加入项目成员列表并不自动获得后台权限。不要把密码提交到仓库或发到聊天里。
3. 在 Supabase SQL Editor 绑定已创建的邮箱，以下示例里的邮箱必须替换为实际管理员邮箱：

```sql
do $$
declare
  v_user uuid;
begin
  select id into strict v_user
  from auth.users
  where lower(email) = lower('admin@example.com') and is_anonymous is false;
  insert into council_admin_private.admins(user_id)
  values (v_user) on conflict (user_id) do nothing;
end;
$$;
```

4. 用管理员邮箱密码登录；用另一个普通账号验证不能进入。

撤销权限时从 `council_admin_private.admins` 删除对应记录。下一次调用管理接口立刻失效，无需等 JWT 刷新。

## 权限与数据

`council_admin_private` 应保持为未暴露给 Data API 的 schema。其表均启用 RLS，游客和 `authenticated` 无直接表访问权。只允许 `authenticated` 执行四个公开的 `SECURITY INVOKER` 包装函数，包装函数调用私有 `SECURITY DEFINER` worker。worker 通过 `auth.uid()`、非匿名 Auth 用户和管理员名单校验后才读取或修改数据；不信任客户端参数、`user_metadata` 或 `app_metadata` 授权声明。

前端仅使用已有 `sb_publishable_` key，不包含 service role、数据库密码或管理员名单。后台使用独立的 sessionStorage key，公开站匿名投票身份不会被后台登录覆盖。关闭标签页会清除后台持久存储；若标签页被复制，浏览器可能复制初始 sessionStorage。退出仅注销后台当前会话。

内部分类、备注、归并目标、操作人和历史记录在私有表保存，公开首页不会读取到它们。管理接口及 CSV 不返回投稿作者 UUID。

归并将源问题设为 `rejected`，停止公开，保留原文和源问题点击数。**不将两个问题的点击数相加，也不改变全站被炸次数。** 目标需已公开、未归并，且不可指向自己。若目标已有其他源问题，需先解除原有归并才能将目标再归并，避免形成多层归并。

CSV 按投稿时间从新到旧导出，冻结新投稿截止时间；导出过程中若审核结果影响分页则提示重试。原始关键词统计仍沿用公共站规则，包含待审核和拒绝投稿，后台会明确显示统计范围。

## 验证

```bash
npm ci --prefix council/admin/tests
npm test --prefix council/admin/tests
node --check council/admin/admin.js
git diff --check
```

数据库测试通过 PGlite 的真实 PostgreSQL 权限、RLS 与函数执行验证游客拒绝、普通账号拒绝、名单撤销立即生效、审核原子性、归并和撤销、原文 / 点击记录保留；不连接正式 Supabase，不修改真实投稿。测试依赖固定为 `@electric-sql/pglite@0.5.9`，含 lockfile。

尚待正式环境验收：数据库安装、邮箱账号绑定、管理员登录与真实投稿读写，以及 PC / 手机真实浏览器视觉和交互。当前会话未发布后台，也未在正式数据库执行安装脚本。

对正式项目执行了只读 Security Advisor 检查。现有提示包括：[限流表启用 RLS 且无公开策略](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)、[公开投票 RPC 的 definer 执行权限](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)、[匿名投稿者读取自己问题的策略](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins)，以及[密码泄漏检测未开启](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。前三项对应现有投票与匿名投稿设计，未修改；密码设置需在正式启用邮箱后台时检查。该检查反映现有线上状态，不等于新增后台已完成线上验收。
