# AI Chat Account Overview And Verification Action Design

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | 为 `/account` 增加第一批真实账号内容与验证动作 |
| 当前阶段 | protected pages 落地后的第一轮页面内容增强 |
| 推荐方向 | Server Component 承接账号概览，Client Component 承接重新发送验证邮件动作 |
| 目标 | 让 `/account` 从“占位页”升级成一个真实可用的基础账号页 |

## 背景

当前项目已经完成：

- `/account` 页面保护，要求 `authenticated`
- `/settings` 页面保护，要求 `verified`
- 首页头部已经增加到 `/account` 和 `/settings` 的入口
- `/api/auth/resend-verification` 已经存在，并且首页未验证态已经能调用

现在 `/account` 虽然能访问，但内容还只是一个很薄的占位卡片。下一步最自然的增强，不是立刻塞更多设置项，而是先把“账号基础信息 + 邮箱验证动作”做实。

## 这次要解决什么

这次只解决：

1. `/account` 展示更完整的基础账号信息
2. 未验证用户可以直接在 `/account` 重新发送验证邮件
3. 已验证用户在 `/account` 明确看到“已验证，无需动作”

这次**不**做：

- 修改邮箱
- 修改密码
- 设备管理
- `/settings` 的真实设置表单

## 方案对比

### 方案 A：全放在 `page.tsx` 里

做法：

- `page.tsx` 既负责服务端鉴权，也处理按钮交互

优点：

- 文件数少

缺点：

- Server Component 不适合直接承接按钮交互状态
- 页面职责会混在一起

### 方案 B：Server Component + 小型 Client Component，我方推荐

做法：

- `src/app/account/page.tsx` 继续负责 cookie、entry state、访问控制、首屏信息渲染
- 新增一个小型 Client Component，例如 `src/app/account/verification-action.tsx`
- 这个组件只负责：
  - 显示重新发送验证邮件按钮
  - 调 `/api/auth/resend-verification`
  - 反馈 loading / success / error

优点：

- 分工清楚
- 贴合 Next.js 16 Server / Client Component 边界
- 比较容易测

缺点：

- 会多一个文件

### 方案 C：把动作继续留在首页，不进 `/account`

优点：

- 不用加新组件

缺点：

- `/account` 会继续很空
- 用户进了账号页却不能在这里完成最自然的验证动作

### 推荐结论

采用方案 B。

## 页面结构设计

`/account` 第一批内容建议分成两块：

### 1. Account Overview

展示：

- 用户 ID
- 邮箱
- 注册时间
- 当前验证状态

注册时间用更友好的日期格式展示即可，不需要引入复杂本地化。

### 2. Verification Action

根据状态分流：

- 已验证用户：
  - 显示“邮箱已验证”
  - 显示说明“当前账号已经完成验证，无需额外操作”

- 未验证用户：
  - 显示“邮箱未验证”
  - 显示一段短说明，解释为什么建议尽快验证
  - 显示“重新发送验证邮件”按钮
  - 点击后展示成功或失败反馈

## 技术边界

### Server Component：`/account/page.tsx`

负责：

- 读取 cookie
- 解析 `entry-state`
- 执行 `authenticated` 页面访问控制
- 把 `user` 信息转成页面展示所需数据
- 决定是否渲染验证动作组件

### Client Component：Verification Action

负责：

- 按钮点击
- 调 `/api/auth/resend-verification`
- loading 状态
- success / error 文案

这个组件不负责鉴权判断，因为它运行前页面访问已经被服务端保护过。

## 测试策略

### 页面测试

覆盖：

- authenticated verified 用户能看到注册时间与“已验证”状态
- authenticated unverified 用户能看到验证动作区域
- 未登录仍然会被重定向

### 动作组件测试

覆盖：

- 点击按钮会请求 `/api/auth/resend-verification`
- 成功时显示成功反馈
- 接口失败时显示错误反馈
- 请求进行中按钮禁用

## 学习重点

这一步最值得记住的是：

1. Server Component 负责“能不能进入页面”和“首屏看到什么”
2. Client Component 负责“进来之后点按钮会发生什么”
3. 页面内容增强应该优先补真实闭环动作，而不是先堆未来占位入口

## 后续自然延伸

这一步完成后，后面最顺的两条线是：

1. 在 `/account` 继续补更完整的账号信息
2. 在 `/settings` 落第一批 verified-only 设置项
