# Redis 缓存与限流防刷学习笔记

## 这一步到底在练什么

表面上看，这一轮只是加了 Redis、缓存和限流。

但如果从“后端能力成长”的角度看，真正练的是 4 件事：

1. **区分数据真身和加速层**
   PostgreSQL 还是主数据库，Redis 只是加速和保护，不是新的真相来源。
2. **把基础设施和业务逻辑拆开**
   Redis 连接、缓存封装、限流算法、业务策略分别放在不同层，而不是都塞进 route。
3. **学会在失败时降级**
   Redis 挂了以后，登录、聊天、session 恢复不能一起挂掉。
4. **把“性能”和“安全”接到真实业务**
   不是做一个孤立 demo，而是把它接到登录接口和聊天接口。

---

## 先用一句话说白

这一轮代码的核心思想只有两句：

> PostgreSQL 负责“存真数据”，Redis 负责“少查库”和“别被刷爆”。
>
> Redis 是增强层，不是依赖 Redis 才能活下去的核心层。

---

## 这一轮最终落地了什么

### 1. Redis 连接封装

文件：

- `src/lib/redis.ts`

职责：

- 读取 `REDIS_URL` 或 `REDIS_HOST/PORT/...`
- 创建 `ioredis` 客户端
- 用单例模式复用客户端
- Redis 没配置时直接返回 `null`

这一步最重要的认知不是“会连 Redis”，而是：

**连接层只负责连，不负责业务判断。**

也就是说，`redis.ts` 不知道“这是 session 缓存”还是“这是登录限流”，它只提供一个基础客户端。

---

### 2. 缓存服务封装

文件：

- `src/server/cache/cache-service.ts`

职责：

- 提供统一的 `get/set/delete/exists`
- 提供 `getJson()` 和 `setJson()`，避免业务层自己 `JSON.stringify`
- 提供 `remember()`，把最常见的 Cache-Aside 读流程包装起来
- Redis 异常时自动吞掉错误，回退到原始数据源

你可以把它理解成：

```text
业务层
  ↓
cache-service
  ↓
Redis / 内存 / 空实现
```

这样做的价值是，业务层不需要关心底层到底是 Redis、内存还是降级空实现。

---

### 3. 限流算法和策略拆开

文件：

- `src/server/rate-limit/rate-limiter.ts`
- `src/server/rate-limit/token-bucket.ts`
- `src/server/rate-limit/sliding-window.ts`
- `src/server/rate-limit/rate-limit-error.ts`
- `src/server/rate-limit/rate-limit-policies.ts`

这里有两个层次：

**算法层**

- `token-bucket.ts`
- `sliding-window.ts`

它们只负责回答一个问题：

> 这个 key 现在还能不能继续请求？

**策略层**

- `rate-limit-policies.ts`

它负责回答另一个问题：

> 登录场景该用哪个算法？参数设多少？聊天场景要不要限游客？

这两个问题分开，代码就清楚很多。

---

### 4. 接入真实业务

文件：

- `src/app/api/auth/login/route.ts`
- `src/app/api/chat/route.ts`
- `src/server/auth/auth-service.ts`

这一步不是“造轮子”，而是“把轮子装到车上”。

落地后的真实效果：

- 登录接口会先过限流，再校验账号密码
- 聊天接口会在用户发消息前做速率检查
- session 恢复会先查缓存，没命中再查数据库
- 登出、改密码、重置密码、验邮箱时会主动删掉旧 cache

---

## 这一轮最关键的边界

### PostgreSQL 还是真身

这个项目里：

- `User`
- `Session`
- `Chat`
- `Message`

这些都还在 PostgreSQL。

Redis **没有**替代数据库，它只做两类事情：

1. **缓存**：例如 session 的读取结果
2. **计数/状态**：例如限流窗口里的计数

所以正确理解应该是：

```text
PostgreSQL = source of truth
Redis = accelerator + protector
```

这也是为什么 Redis 不可用时，主流程仍然要尽量能跑。

---

### Route 层负责“请求上下文”，Service 层负责“业务行为”

#### 登录接口

`/api/auth/login` 这一层知道：

- 邮箱是多少
- IP 是多少
- 设备信息是什么
- 这是一次 HTTP 请求

所以登录限流放在 route 层是合理的：

```text
Request
  ↓ parse body / ip / device info
  ↓ enforceLoginRateLimit()
  ↓ loginUser()
  ↓ set cookie
```

因为限流依赖的是“请求上下文”，不是纯业务实体。

#### Session 缓存

而 session 恢复属于服务端身份恢复逻辑：

- 给我一个 `sessionToken`
- 我来返回当前 session

所以缓存放在 `auth-service.ts:getCurrentSession()` 里更合理。

---

## 为什么缓存接在 `getCurrentSession()`

这一轮缓存没有乱加，而是只先加在一个非常值得缓存的点：

- `getCurrentSession(sessionToken)`

原因有 3 个：

1. **读取频率高**
   登录后的很多接口都会先恢复当前 session。
2. **数据体积小**
   一个 session + user 摘要很适合做缓存。
3. **失效点清楚**
   登出、改密码、重置密码、验邮箱、撤销 session 时都能明确删掉。

这个点是学缓存的好入口，因为它满足“高频读、低复杂度、失效边界明确”。

---

## Cache-Aside 在这个项目里是怎么走的

### 读流程

```text
getCurrentSession(token)
  ↓
先查 cache key: auth:session:${token}
  ↓
命中：直接返回
  ↓
未命中：查 PostgreSQL
  ↓
查到后写回缓存（TTL 5 分钟）
  ↓
返回结果
```

### 写/失效流程

当这些动作发生时，会主动删缓存：

- `logoutUser()`
- `verifyEmailToken()`
- `changePasswordForUser()`
- `resetPasswordWithToken()`
- `revokeSessionById()`
- `revokeAllOtherSessions()`

这比“傻等 TTL 自己过期”更靠谱，因为安全相关数据最好尽量快地失效。

---

## 为什么缓存 TTL 设成 5 分钟

这不是唯一正确答案，但对这个项目是一个合理起点：

- 太短：缓存价值不高
- 太长：用户状态变化后，旧数据滞留太久

session 这类数据的特点是：

- 读很多
- 写不算频繁
- 但安全相关，不能一直旧下去

所以 `5 分钟` 是一个适合学习和第一版落地的折中值。

---

## 为什么限流用了两种算法

### 1. 滑动窗口：适合登录 IP

用在：

- 同一 IP 每小时最多 10 次登录尝试

原因：

- 这里更关心“一个时间段内到底试了多少次”
- 滑动窗口比固定窗口更平滑
- 适合防暴力破解这种“统计过去一段时间次数”的场景

你可以把它理解成：

```text
现在时间往前推 1 小时
把这 1 小时里的请求时间戳都拿出来
如果数量 >= limit，就拒绝
```

---

### 2. 令牌桶：适合聊天消息和邮箱维度登录

用在：

- 同一邮箱每分钟最多 3 次登录尝试
- 同一用户每分钟最多 30 条聊天消息

原因：

- 它允许“适度突发”
- 又能随着时间逐步恢复
- 比较像真实用户行为

比如聊天时，用户连续发 2 到 3 条消息不一定是攻击，但连续高速刷几十条就很可疑。

令牌桶更适合这种“允许短突发，但不能持续猛冲”的场景。

---

## 为什么聊天限流暂时只限正式用户

这是一个很值得注意的实现选择。

在 `rate-limit-policies.ts` 里，聊天限流逻辑对 `guest` 直接跳过了：

- 正式用户：走 `chatMessageRateLimiter`
- 游客：先不走 Redis 限流

原因不是“游客不需要保护”，而是：

**游客本来就已经有试用额度限制。**

也就是：

- 游客靠 `guest trial count` 控制
- 正式用户靠 `token bucket` 控制频率

两层保护的目标不同：

- 试用额度：防止无限白嫖
- 频率限流：防止短时间把接口打爆

---

## Redis 挂了为什么还要能跑

这是这一轮最应该学会的工程判断。

### 缓存层的降级

`cache-service.ts` 的设计是：

- 读 Redis 失败，返回 `null`
- 写 Redis 失败，静默忽略
- 业务继续回数据库

也就是：

```text
Redis 坏了 = 变慢
不是 = 直接挂
```

### 限流层的降级

限流层做了一个不同的选择：

- 有 Redis：优先用 Redis store
- 没 Redis：回退到进程内 memory store

这意味着：

- 单机开发可用
- Redis 本地没起也能先跑逻辑
- 但多实例部署时，memory store 不是全局一致的

所以要记住：

> memory fallback 适合学习和单机，不适合当作正式分布式限流方案。

---

## 这一轮实际参数怎么理解

### 登录

- IP：`10 次 / 1 小时`
- 邮箱：`3 次 / 1 分钟`

这是一种“双保险”：

- IP 维度防一台机器狂试很多账号
- 邮箱维度防一个账号被连续猛撞

### 聊天

- 用户：`30 条 / 1 分钟`

这个值不是绝对标准，而是第一版保护线。

如果后面接真实用户，要根据模型成本、接口延迟、产品形态继续调。

---

## 建议怎么读这批代码

如果你现在回头读代码，推荐顺序是：

1. `src/server/rate-limit/rate-limit-policies.ts`
   先看“项目到底限了什么”
2. `src/app/api/auth/login/route.ts`
   看登录限流怎么接进请求链路
3. `src/app/api/chat/route.ts`
   看聊天限流怎么接到真实业务
4. `src/server/auth/auth-service.ts`
   看 session 缓存怎么接进身份恢复
5. `src/server/cache/cache-service.ts`
   看通用缓存封装到底提供了什么
6. `src/lib/redis.ts`
   最后再看 Redis 客户端怎么创建
7. `src/server/rate-limit/token-bucket.ts`
8. `src/server/rate-limit/sliding-window.ts`

先从“业务效果”倒着读，再回到底层，会比一上来啃算法轻松很多。

---

## 这一轮最该记住的几句话

> 缓存不是为了替代数据库，而是为了减少数据库被重复问同一个问题。

> 限流不是为了为难正常用户，而是为了阻止恶意请求把正常用户也拖死。

> Redis 在这里是增强层，所以它挂了以后，核心业务应该尽量降级而不是一起崩。

> 算法层解决“怎么算”，策略层解决“限谁、限多少、报什么错”。

---

## 文件变更清单

### 新增的文件

- `docs/superpowers/specs/2026-04-11-redis-cache-and-rate-limit-learning.md`
- `src/lib/redis.ts`
- `src/lib/redis.test.ts`
- `src/server/cache/cache-service.ts`
- `src/server/cache/cache-service.test.ts`
- `src/server/rate-limit/rate-limiter.ts`
- `src/server/rate-limit/token-bucket.ts`
- `src/server/rate-limit/token-bucket.test.ts`
- `src/server/rate-limit/sliding-window.ts`
- `src/server/rate-limit/sliding-window.test.ts`
- `src/server/rate-limit/rate-limit-error.ts`
- `src/server/rate-limit/rate-limit-policies.ts`

### 主要修改的文件

- `package.json`
- `src/app/api/auth/login/route.ts`
- `src/app/api/chat/route.ts`
- `src/server/auth/auth-service.ts`

---

## 下一步最自然的延伸

如果继续学，下一步最值得做的是这 3 个：

1. **把更多高频读场景接进缓存**
   例如用户 profile 摘要、某些轻量列表。
2. **把限流结果接进响应头**
   例如 `Retry-After`、剩余额度、重置时间。
3. **区分开发级 fallback 和生产级要求**
   本地可以 memory fallback，生产环境则要求 Redis 必须可用。

---

## 对应文档

- 设计文档：`docs/superpowers/specs/2026-04-11-redis-cache-and-rate-limit-design.md`
- 上一阶段学习笔记：`docs/superpowers/specs/2026-04-11-session-management-learning.md`
