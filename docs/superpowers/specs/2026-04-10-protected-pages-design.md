# AI Chat Protected Pages Design

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | 为 `AI Chat` 新增两个最小可用的受保护页面 |
| 当前阶段 | 统一入口状态之后的第一轮页面保护落地 |
| 目标页面 | `/account` 与 `/settings` |
| 推荐方向 | 直接在页面级 Server Component 里消费 `entry-state` 与 `resolveProtectedPageAccess()` |

## 背景

当前项目已经完成了：

- 统一入口状态解析 `entry-state`
- `authenticated` / `verified` 两类页面访问 helper
- 首页 `/` 与 `/api/auth/session` 对共享身份入口规则的消费

但现在还没有任何真实页面去消费 `resolveProtectedPageAccess()`，所以这层能力虽然已经存在，仍缺一个真正的落点。现在最自然的下一步，就是做两个最小 protected pages，把两种访问要求都跑通。

## 这次要解决什么

这次只解决两件事：

1. 新增 `/account`
   - 要求 `authenticated`
   - 已登录但邮箱未验证的用户也能进入
   - 展示最基础的账号信息

2. 新增 `/settings`
   - 要求 `verified`
   - 已登录但邮箱未验证的用户不能进入
   - 不满足条件时直接重定向回首页 `/`

这次**不**做：

- 完整账号中心
- 设置表单提交
- `proxy.ts`
- 全站导航改造

## 推荐方案

### 方案 A：页面内直接消费 `entry-state`

做法：

- 在 `app/account/page.tsx` 和 `app/settings/page.tsx` 中直接读取 cookie
- 调用 `resolveEntryStateFromCookieStore()`
- 调用 `resolveProtectedPageAccess()`
- 不满足访问条件时执行 `redirect("/")`

优点：

- 贴合当前仓库已经建立好的入口状态模型
- 页面规则最直观，测试也最简单
- 符合 Next.js 16 的 Server Component 用法

缺点：

- 两个页面会各自保留一小段相似的访问判断代码

### 方案 B：先抽通用页面守卫 helper

优点：

- 以后 protected pages 扩展更统一

缺点：

- 现在只有两个页面，抽象收益不高
- 容易在第一轮就为了“优雅”多建一层

### 推荐结论

采用方案 A。

原因很简单：当前目标不是造一个完整 page-guard 框架，而是用最小真实页面验证两类访问规则真的成立。

## 页面行为定义

### `/account`

- 未登录：重定向到 `/`
- 已登录但邮箱未验证：允许进入
- 已登录且邮箱已验证：允许进入

页面展示内容先保持最小：

- 页面标题
- 用户 `id`
- 用户邮箱
- 邮箱验证状态

### `/settings`

- 未登录：重定向到 `/`
- 已登录但邮箱未验证：重定向到 `/`
- 已登录且邮箱已验证：允许进入

页面内容先只做一个非常小的占位说明，证明这个页面已经完成更高门槛保护。

## 技术设计

Next.js 16 本地文档已经确认：

- `page.tsx` 默认是 Server Component
- `redirect()` 可以在 Server Component 渲染时直接使用
- Server Component 适合读取 cookie、查询服务端状态并决定是否继续渲染

所以这次页面层的标准流程是：

1. `await cookies()`
2. `resolveEntryStateFromCookieStore(cookieStore)`
3. `resolveProtectedPageAccess(state, requirement)`
4. 若不允许则 `redirect("/")`
5. 若允许则渲染最小页面内容

## 测试策略

每个页面各自补一组聚焦测试：

- `/account`
  - 未登录时抛出 redirect
  - `authenticated_unverified` 时成功渲染
  - `authenticated_verified` 时成功渲染

- `/settings`
  - 未登录时抛出 redirect
  - `authenticated_unverified` 时抛出 redirect
  - `authenticated_verified` 时成功渲染

测试会优先 mock：

- `next/headers` 的 `cookies`
- `next/navigation` 的 `redirect`
- `@/server/auth/entry-state`

这样测试聚焦于页面保护规则本身，而不是重复验证 cookie 解析实现。

## 后续延伸

这两个页面落地后，下一步就会更清晰：

- 如果后面 protected pages 变多，再考虑提炼共用 helper
- 如果需要更早地做路径级跳转，再评估是否加轻量 `proxy.ts`
- 如果 `/settings` 开始承接敏感动作，就继续沿用 `verified` 规则
