# Session 管理与设备追踪实现笔记

## 这一步在练什么

表面上只是"添加查看活跃设备和撤销登录功能"，但本质上在练 4 件事：

1. **Session 安全模型** - 从单点到多设备的认知升级
2. **设备信息采集** - User-Agent 解析、IP 提取
3. **前后端数据流** - API → 类型定义 → UI 组件
4. **安全性增强** - 改密码自动撤销其他 session

## 已经有的基础（之前实现的）

在开始这一步之前，基础 session 流程已经完成：

| 功能 | 文件位置 |
|------|---------|
| 登录创建 session | `auth-service.ts:loginUser()` |
| Cookie 只存 token | `session.ts:SESSION_COOKIE_NAME` |
| 请求反查 session | `auth-service.ts:getCurrentSession()` |
| 过期 session 失效 | `getCurrentSession()` 内检查 expiresAt |
| 退出登录删 session | `auth-service.ts:logoutUser()` |

## 这一步新增了什么

### 1. 数据库层

```sql
-- Session 表新增字段
ALTER TABLE "Session" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "deviceInfo" JSONB;
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;

-- 新增索引加速查询
CREATE INDEX "Session_userId_lastActiveAt_idx";
```

### 2. Repository 层

**新增方法** (`auth-repository.ts`):

```typescript
findSessionsByUserId(userId)      // 获取用户所有 session
findSessionById(id)               // 根据 ID 查单个 session
deleteSessionById(id)             // 删除指定 session
deleteAllUserSessionsExcept(...)  // 删除除当前外的所有 session
deleteAllUserSessions(userId)     // 删除用户所有 session
updateSessionLastActiveAt(...)    // 更新活跃时间
```

### 3. Service 层

**新增方法** (`auth-service.ts`):

```typescript
getAllUserSessions(userId)         // 获取所有活跃设备
revokeSessionById(id, userId)      // 撤销指定设备
revokeAllOtherSessions(token)      // 撤销所有其他设备
updateSessionActivity(token)       // 更新活跃时间（节流 5 分钟）
```

**修改方法**:

```typescript
// loginUser 新增可选参数
loginUser({ email, password, deviceInfo?, ipAddress? })

// changePasswordForUser 新增参数和行为
changePasswordForUser({ ..., currentSessionToken? })
// 改密码后自动调用 deleteAllUserSessionsExcept
```

### 4. API 层

**新增端点**:

```
GET    /api/auth/sessions       → 获取所有活跃设备
DELETE /api/auth/sessions/:id    → 撤销指定设备
DELETE /api/auth/sessions        → 撤销所有其他设备
```

### 5. 工具层

**新增文件** (`device-info.ts`):

```typescript
parseDeviceInfo(userAgent)       // 解析 User-Agent
extractClientIp(request)         // 从 headers 提取 IP
extractRequestInfo(request)      // 组合以上两个
```

### 6. 前端 UI

**新增组件** (`settings/sessions-form.tsx`):

- 展示当前设备（绿色高亮）
- 展示其他设备列表
- 单个设备撤销按钮
- "撤销所有其他设备"按钮
- 设备信息格式化（设备类型、浏览器、系统）
- 时间格式化（刚刚、X 分钟前、X 小时前）

## 设备信息解析的实现选择

**没有使用第三方库**（如 `ua-parser-js`），而是自己实现了一个简化版本：

```typescript
// 通过关键字匹配设备类型
const mobileKeywords = ["android", "iphone", "ipod", "mobile", "windows phone"];
const tabletKeywords = ["ipad", "tablet", "kindle"];

// 通过正则匹配浏览器
const browserPatterns = [
  [/Edg\/[\d.]+/gi, "Edge"],
  [/Chrome\/[\d.]+/gi, "Chrome"],
  [/Safari\/[\d.]+/gi, "Safari"],
  [/Firefox\/[\d.]+/gi, "Firefox"],
];

// 同样的方式解析操作系统
```

**理由**：
- 覆盖 80% 常见场景
- 不增加依赖包体积
- 未来可以按需替换成专业库

## 活跃时间更新的节流策略

在 `getCurrentSession()` 中实现了节流：

```typescript
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const timeSinceLastActive = Date.now() - session.lastActiveAt.getTime();

if (timeSinceLastActive > FIVE_MINUTES_MS) {
  // 异步更新，不阻塞请求
  updateSessionLastActiveAt(sessionToken, new Date()).catch(() => {});
}
```

**为什么异步**：
- 不让用户请求等待数据库写操作
- 即使更新失败也不影响主流程
- 下次请求会再次尝试更新

**为什么节流**：
- 避免每次请求都写数据库
- 5 分钟对"最后活跃时间"来说精度足够

## 改密码的安全增强

```typescript
// changePasswordForUser 的行为
if (currentSessionToken) {
  // 保留当前 session，撤销其他所有
  await deleteAllUserSessionsExcept(userId, currentSessionToken);
} else {
  // 撤销所有 session（包括当前的）
  await deleteAllUserSessions(userId);
}
```

**场景**：
- 用户在电脑上改密码 → 手机上的登录自动失效
- 密码重置（通过邮件链接）→ 所有设备全部失效

## API 返回的安全设计

```typescript
// GET /api/auth/sessions 的返回
{
  sessions: [
    {
      id: "session_123",
      token: "xxx",     // 只有当前设备的 token 才会返回
      isCurrent: true,
      // ...
    },
    {
      id: "session_456",
      token: null,      // 其他设备的 token 不暴露
      isCurrent: false,
      // ...
    }
  ]
}
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
- `prisma/schema.prisma` - Session 模型新增字段
- `src/server/auth/auth-types.ts` - 类型定义扩展
- `src/server/auth/auth-repository.ts` - 新增 6 个方法
- `src/server/auth/auth-service.ts` - 新增 4 个方法，修改 2 个方法
- `src/app/api/auth/login/route.ts` - 传递设备信息
- `src/app/api/auth/password/route.ts` - 传递当前 session token
- `src/app/settings/page.tsx` - 添加 SessionsForm 组件

**新增的文件**:
- `src/server/auth/device-info.ts` - 设备信息解析
- `src/app/api/auth/sessions/route.ts` - GET/DELETE 处理
- `src/app/api/auth/sessions/[id]/route.ts` - 单个 DELETE 处理
- `src/app/settings/sessions-form.tsx` - UI 组件
- `src/app/settings/sessions-form.test.tsx` - 测试
- `prisma/migrations/20260411150900_add_session_tracking_fields/` - 数据库迁移

## 下一步自然会接什么

1. **新设备登录通知** - 当检测到新设备/IP 时发送邮件
2. **Session 延长策略** - 活跃用户自动延长 session（滑动过期）
3. **异常登录检测** - 同一时间多地登录、IP 变化过大等告警
4. **Webauthn/FIDO2** - 硬件密钥支持，进一步提升安全性
