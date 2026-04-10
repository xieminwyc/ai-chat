# AI Chat Settings Password And Security Roadmap Design

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | 为 `/settings` 增加第一批 verified-only 真实内容 |
| 当前阶段 | protected settings page 的第一轮落地 |
| 推荐方向 | 真实实现“修改密码”，再配两个后续安全入口占位 |
| 目标 | 让 `/settings` 从占位页升级成有真实敏感动作的设置页 |

## 背景

当前项目已经具备：

- `/settings` 页面保护，要求 `verified`
- `/account` 页面已开始承接真实账号信息和验证动作
- 登录、注册、邮箱验证、重新发送验证邮件等 auth 基础链路

但 `/settings` 现在还是一个空壳。下一步最适合让它承接的，不是大而全的设置系统，而是一个真正需要更高信任门槛的动作。

## 这次要解决什么

这次只解决：

1. 在 `/settings` 中真实实现“修改密码”
2. 保留两个后续安全入口占位，帮助页面长成真正的 settings shell

这次**不**做：

- 修改邮箱
- 多设备管理
- 二步验证
- 删除账号

## 方案对比

### 方案 A：只做修改密码表单

优点：

- 最直接
- 后端闭环最明确

缺点：

- 页面仍然像单一表单，不像设置页

### 方案 B：修改密码 + 安全路线图，我方推荐

做法：

- `/settings` 顶部保留 verified-only 设置页说明
- 页面分两块：
  - `Password`：真实修改密码表单
  - `Security roadmap`：两个后续安全卡片，占位但不交互

优点：

- 既有真实敏感动作，又有设置页结构感
- 能更好地表达“这里是更高信任设置区”

缺点：

- 比纯表单多一点页面结构代码

### 推荐结论

采用方案 B。

## 技术设计

### 后端闭环

这次需要新增一条最小密码修改链路：

1. Route Handler
   - 新增 `POST /api/auth/password`
   - 要求当前存在有效 session
   - 校验旧密码 / 新密码 / 确认新密码

2. Service
   - 校验当前用户存在
   - 校验旧密码正确
   - 校验新旧密码不能相同
   - hash 新密码
   - 持久化 password hash

3. Repository
   - 新增更新用户密码 hash 的方法

### 页面分工

继续沿用你当前已经建立起来的边界：

- `src/app/settings/page.tsx`
  - Server Component
  - 负责 `verified` 页面保护
  - 负责渲染页面骨架和安全路线图

- 小型 Client Component
  - 负责修改密码表单交互
  - 负责请求 `/api/auth/password`
  - 负责 loading / success / error

## 页面结构

### 1. Password

字段：

- 当前密码
- 新密码
- 确认新密码

行为：

- 提交中按钮禁用
- 成功显示成功反馈
- 失败显示错误反馈

### 2. Security Roadmap

显示两个只读卡片：

- `登录设备管理`
- `更高信任操作`

它们只用于表达后续方向，不做交互。

## 测试策略

### 后端

- auth service：
  - 旧密码错误时拒绝
  - 新旧密码相同时拒绝
  - 成功时 hash 新密码并更新用户记录

- route：
  - 未登录返回 401
  - 无效 payload 返回 400
  - 成功返回 200

### 前端

- settings page：
  - verified 用户能看到 password 区和 roadmap 区
  - 不满足访问条件仍然重定向

- password form client component：
  - 成功提交显示反馈
  - 失败显示错误
  - 提交中按钮禁用

## 学习重点

这一步最值得记住的是：

1. 为什么修改密码属于 verified-only 动作
2. 一个敏感动作的后端链路通常是 route -> service -> repository
3. 页面保护和动作保护永远不是一回事，verified page 里仍然要做后端校验
