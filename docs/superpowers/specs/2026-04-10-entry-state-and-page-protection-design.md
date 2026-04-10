# AI Chat 统一入口状态与页面保护设计

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | 统一首页入口状态，并为未来 protected pages 建立可复用页面保护规则 |
| 当前阶段 | 第一阶段身份体系收口设计 |
| 面向对象 | 当前实施者、后续扩展账号页面的人、未来回看入口策略的人 |
| 推荐方向 | 抽离共享 `entry-state` 服务端模块，统一首页与 session 接口的身份入口判定，并预留 `authenticated` / `verified` 两类页面保护规则 |
| 目标仓库 | `AI Chat` |

## 背景

当前项目已经完成：

- 邮箱 + 密码注册登录
- 邮箱验证与未验证用户限制
- guest session 与游客试用计数
- guest history merge
- merge 后的 `auth-shell` 入口切换

但“入口规则”现在仍然分散在多个地方：

- `src/server/page/home-data.ts`
- `src/app/api/auth/session/route.ts`
- `src/components/chat-app.tsx`
- 个别 API route 里的鉴权判断

这些代码共同决定了“当前请求到底应该进入哪一种首页状态”，但它们没有被收口成一套显式规则。结果是：

1. 首页和 session 接口各自重复做身份推导。
2. guest / auth-shell / verified / unverified 的边界主要靠实现细节维持，不够显式。
3. 未来一旦新增 `/account`、`/settings`、`/workspace` 这类 protected pages，很容易再次复制一套 cookie 判定逻辑。
4. Next.js 16 已经把 `middleware` 更名为 `proxy`，但官方也明确不建议把 `proxy` 当完整鉴权方案；如果没有共享入口状态模块，后面很难安全接入轻量跳转层。

所以现在最自然的下一步，不是继续往首页里加条件分支，而是把现有“入口状态判断”抽成一层共享服务端能力。

## 这次要解决什么

这次设计只解决一件事：

> 把“当前请求进入应用时，应该落到哪一种身份入口状态”统一成一套服务端规则，并让首页 `/` 与 `/api/auth/session` 都消费同一份结果。

同时，这次要顺手为未来 protected pages 预留两类页面保护规则：

- `authenticated`
- `verified`

但这次**不**做：

- 全站 `proxy.ts` 强制拦截落地
- 用 `proxy` 替代 route / service 内的硬鉴权
- 新增完整账号中心页面
- 调整首页视觉或交互结构

## 统一后的入口状态

建议把当前项目已有的身份入口收口成下面 5 种显式状态：

1. `signed_out_guest_preview`
   - 没有登录态
   - 没有有效 guest session
   - 没有进入 auth-shell 强制入口
   - 首页展示 guest preview，不提前创建新的 guest workspace

2. `signed_out_guest_workspace`
   - 没有登录态
   - 有有效 guest cookie
   - 对应 guest session 仍 active、未过期、未 merged
   - 首页按 guest 身份恢复聊天和试用状态

3. `signed_out_auth_shell`
   - 没有登录态
   - `ai-chat-auth-shell=1`
   - 首页优先显示登录 / 注册入口，而不是继续走 guest 恢复

4. `authenticated_unverified`
   - 有登录态
   - 当前 user 未完成邮箱验证
   - 首页仍按 authenticated user 渲染工作台，但聊天能力受限，且不暴露 `mergeCandidate`

5. `authenticated_verified`
   - 有登录态
   - 当前 user 已完成邮箱验证
   - 首页按正常 user workspace 渲染
   - 如果当前浏览器里仍有有效且未 merged 的 guest session，可附带 `mergeCandidate`

这 5 种状态并不是新产品规则，而是把你当前已经在运行的规则显式命名出来。

## 推荐方案

### 方案 A：继续让每个入口各自判断

优点：

- 改动小
- 不需要新模块

缺点：

- 首页和 session 接口会继续复制判断逻辑
- 后续 protected pages 仍会各写各的
- `auth-shell`、guest、verified 边界更难长期维护

### 方案 B：抽共享 `entry-state` 模块，我方推荐

优点：

- 首页和 session 接口共享同一套身份入口状态
- 未来页面保护可直接复用
- 让 `proxy.ts` 以后只负责轻量 redirect，而不是背完整会话逻辑

缺点：

- 需要整理现有入口判断路径
- 会引入一个新的服务端抽象层

### 方案 C：这次直接补完整 `proxy.ts`

优点：

- 表面上更“统一”
- 为未来页面跳转铺路更直接

缺点：

- 对当前项目来说偏重
- Next.js 16 官方不建议用 `proxy` 替代完整鉴权
- 现在真正需要统一的是状态解析，不是拦截器本身

### 推荐结论

采用 `方案 B`。

也就是：

- 先统一入口状态解析
- 让首页和 session 接口消费同一状态
- 预留页面保护 helper
- 暂不把完整 `proxy.ts` 强行落地

## 模块职责设计

### 1. `src/server/auth/entry-state.ts`

新增共享模块，建议只负责两件事：

1. 把 cookie 相关输入解析成统一入口状态
2. 基于入口状态回答“某类页面能不能访问”

它不应该：

- 直接渲染 UI
- 直接返回 `HomePageData`
- 直接返回 `/api/auth/session` 的 response
- 替代 API route 里的硬鉴权

建议这里产出的核心结构类似：

- `kind`
- `user`
- `guestSession`
- `mergeCandidate`

再提供轻量页面保护判断，比如：

- `resolveProtectedPageAccess(state, "authenticated")`
- `resolveProtectedPageAccess(state, "verified")`

### 2. 首页消费层

`src/server/page/home-data.ts` 不再自己重新推导身份入口，而是：

1. 读取 cookie
2. 调用 `entry-state`
3. 按状态组装 `HomePageData`

这样首页逻辑会更像“状态翻译器”，而不是“状态计算器”。

### 3. Session 接口消费层

`src/app/api/auth/session/route.ts` 同样改成：

1. 读取 cookie header
2. 调用 `entry-state`
3. 把统一入口状态翻译成前端可读 payload

这样首页 bootstrap 和 session 刷新接口就能共享同一组身份边界。

### 4. 未来页面保护层

这次先只把接口设计好，不急着给所有路径接入 `proxy.ts`。

后面新增独立 protected pages 时，页面可以直接声明自己需要哪种访问等级：

- `authenticated`
- `verified`

对于这些未来页面，默认策略是：

- 首页 `/` 继续页面内分流
- 独立 protected pages 更适合直接 redirect

## 数据流设计

建议把统一数据流固定成下面这样：

1. 入口读取 cookie
   - session cookie
   - guest cookie
   - auth-shell cookie

2. `entry-state` 解析身份入口
   - authenticated verified / unverified
   - signed out auth shell
   - signed out guest workspace / preview

3. 消费方各自翻译结果
   - `home-data` 组装首页需要的完整初始数据
   - `auth/session` 组装前端刷新态需要的摘要数据
   - 未来 protected pages 只拿访问结论，不自己重复解 cookie

4. route / service 继续做硬鉴权
   - `POST /api/chat`
   - `POST /api/guest/merge`
   - 未来 server actions / route handlers

也就是说：

> `entry-state` 负责统一“你现在应该从哪个入口进入应用”，但不负责替代“你现在有没有权限执行某个动作”。

## 错误处理边界

这里要特别明确一件事：

`entry-state` 应该尽量是“可消费状态”模型，而不是“异常驱动”模型。

因此建议规则是：

- 缺少 guest cookie：降级成 `signed_out_guest_preview`
- guest 已过期：降级成 `signed_out_guest_preview`
- guest 已 merged：降级成 `signed_out_guest_preview`
- 有 `auth-shell=1` 且无登录态：进入 `signed_out_auth_shell`
- 有登录态但未验证：进入 `authenticated_unverified`

换句话说，入口解析阶段尽量不要把“无效 guest”当成错误抛给页面。

真正应该报错的地方仍然是：

- route handler
- service 规则校验
- 明确的用户动作链路

这样做的好处是：页面入口更稳定，业务动作错误也不会被偷偷吞掉。

## 与 Next.js 16 `proxy` 的关系

Next.js 16 文档已经明确：

- `middleware` 已更名为 `proxy`
- `proxy` 更适合做轻量跳转、重写、头信息处理
- 不应该当完整 session management / authorization 方案

因此这次设计的立场是：

1. 先统一入口状态模块
2. 未来如需 `proxy.ts`，只用来做轻量 redirect
3. 所有 route / server action 仍必须自己做硬鉴权

这能避免后面把权限判断错误地压到 CDN 前置层。

## 测试策略

建议新增或调整以下测试：

1. `src/server/auth/entry-state.test.ts`
   覆盖 5 种入口状态，确认统一状态解析稳定。

2. `src/server/page/home-data.test.ts`
   改成验证首页是否正确消费统一入口状态，而不是继续校验分散判断细节。

3. `src/app/api/auth/session/route.test.ts`
   验证 session route 是否根据统一入口状态输出正确 payload。

4. 页面保护 helper 测试
   覆盖：
   - `authenticated` 页面要求
   - `verified` 页面要求
   - signed-out / unverified / guest / auth-shell 的访问结论

## 成功标准

这次设计落地后，应该达到下面这些效果：

- 首页和 `/api/auth/session` 不再各自复制入口状态判断
- guest / auth-shell / verified / unverified 的边界被显式命名
- 未来 protected pages 可以复用统一访问规则，而不是重新查 cookie
- 未来如接入 `proxy.ts`，只负责轻量 redirect，不承担完整鉴权
- API route 的硬鉴权职责保持不变

## 一句话总结

这次不是再加一层“更严格的鉴权系统”，而是把你项目里已经存在的 5 种身份入口状态正式收口成一个共享服务端模块，让首页、session 接口和未来页面保护都说同一种“入口语言”。
