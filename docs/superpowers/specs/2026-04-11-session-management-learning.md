# Session 管理与设备追踪学习笔记

## 这一步在练什么

表面上只是"添加查看活跃设备和撤销登录功能"，但本质上在练 4 件事：

1. **Session 安全模型的升级** - 从单点到多设备的管理思维
2. **设备信息采集** - User-Agent 解析、IP 提取与存储
3. **前后端数据流** - API → 类型定义 → UI 组件的完整链路
4. **安全性增强** - 改密码自动撤销其他 session 的安全设计

## 已经有的基础（上一阶段继承）

在开始这一步之前，基础 session 流程已经完成：

| 功能 | 文件位置 |
|------|---------|
| 登录创建 session | `auth-service.ts:loginUser()` |
| Cookie 只存 token | `session.ts:SESSION_COOKIE_NAME` |
| 请求反查 session | `auth-service.ts:getCurrentSession()` |
| 过期 session 失效 | `getCurrentSession()` 内检查 expiresAt |
| 退出登录删 session | `auth-service.ts:logoutUser()` |

## 这一步新增了什么

### 数据库层
```sql
ALTER TABLE "Session" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "deviceInfo" JSONB;
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
CREATE INDEX "Session_userId_lastActiveAt_idx";
```

### Repository 层
```typescript
findSessionsByUserId(userId)      // 获取用户所有 session
findSessionById(id)               // 根据 ID 查单个 session
deleteSessionById(id)             // 删除指定 session
deleteAllUserSessionsExcept(...)  // 删除除当前外的所有 session
deleteAllUserSessions(userId)     // 删除用户所有 session
updateSessionLastActiveAt(...)    // 更新活跃时间
```

### Service 层
```typescript
getAllUserSessions(userId)         // 获取所有活跃设备
revokeSessionById(id, userId)      // 撤销指定设备
revokeAllOtherSessions(token)      // 撤销所有其他设备
updateSessionActivity(token)       // 更新活跃时间（节流 5 分钟）
```

### API 层
```
GET    /api/auth/sessions       → 获取所有活跃设备
DELETE /api/auth/sessions/:id    → 撤销指定设备
DELETE /api/auth/sessions        → 撤销所有其他设备
```

## 设备信息解析的实现选择

**没有使用第三方库**（如 `ua-parser-js`），而是自己实现了一个简化版本：

```typescript
// 通过关键字匹配设备类型
const mobileKeywords = ["android", "iphone", "ipod", "mobile"];
const tabletKeywords = ["ipad", "tablet", "kindle"];
// 通过正则匹配浏览器和操作系统
```

**理由**：
- 覆盖 80% 常见场景
- 不增加依赖包体积
- 未来可以按需替换成专业库

## 活跃时间更新的节流策略

```typescript
const FIVE_MINUTES_MS = 5 * 60 * 1000;
if (timeSinceLastActive > FIVE_MINUTES_MS) {
  // 异步更新，不阻塞请求
  updateSessionLastActiveAt(sessionToken, new Date()).catch(() => {});
}
```

**为什么异步**：不让用户请求等待数据库写操作
**为什么节流**：避免每次请求都写数据库，5 分钟精度足够

## 改密码的安全增强

```typescript
// changePasswordForUser 的行为
if (currentSessionToken) {
  await deleteAllUserSessionsExcept(userId, currentSessionToken);
} else {
  await deleteAllUserSessions(userId); // 密码重置场景
}
```

**效果**：用户在电脑上改密码 → 手机上的登录自动失效

## API 返回的安全设计

```typescript
{ sessions: [
  { id: "session_123", token: "xxx", isCurrent: true },   // 当前设备有 token
  { id: "session_456", token: null, isCurrent: false }    // 其他设备 token 不暴露
]}
```

**为什么其他设备的 token 是 null**：
- 前端不需要其他设备的 token
- 避免 accidentally 泄露到浏览器存储
- 只用 `id` 来标识要撤销的设备

## 这一步最该记住的句子

> Session 是"登录状态的真身"，Cookie 只是"去哪里找真身的凭证"。
>
> 改密码应该撤销所有旧 session，就像换锁要没收旧钥匙。

## 文件变更清单

**修改的文件**:
- `prisma/schema.prisma`
- `src/server/auth/auth-types.ts`
- `src/server/auth/auth-repository.ts`
- `src/server/auth/auth-service.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/password/route.ts`
- `src/app/settings/page.tsx`

**新增的文件**:
- `src/server/auth/device-info.ts`
- `src/app/api/auth/sessions/route.ts`
- `src/app/api/auth/sessions/[id]/route.ts`
- `src/app/settings/sessions-form.tsx`
- `prisma/migrations/20260411150900_add_session_tracking_fields/`

## 下一步

这一步完成后，Session 管理的基础能力已经完整。下一阶段会进入：

**Redis 缓存 + 限流防刷** - 更深层的后端性能与安全技术

对应设计文档：`docs/superpowers/specs/2026-04-11-redis-cache-and-rate-limit-design.md`
