# AI Chat 项目数据库工作流

这份文档是给这个项目自己用的，不是泛泛的 Prisma 教程。

当前环境：

- PostgreSQL：Homebrew 安装的 `postgresql@17`
- Prisma：`7.5.0`
- 数据库连接：`DATABASE_URL="postgresql://xiemin@localhost:5432/ai_chat_app"`
- Prisma 配置文件：[prisma.config.ts](/Users/xiemin/monter/AI%20Chat/prisma.config.ts)

## 1. 整体思路

这个项目的数据库流程是：

1. 先启动 PostgreSQL 服务

```bash
brew services start postgresql@17
```

2. 确保数据库本身存在，比如 `ai_chat_app`

```bash
createdb ai_chat_app
```

3. 运行 migration

```bash
npx prisma migrate dev
```

4. 再启动项目

```bash
npm run dev
```

要点：

- 你不是手动建表、手动建列、手动建 trigger
- 你只需要把 PostgreSQL 服务和数据库准备好
- 具体结构由 `prisma/migrations/` 里的 migration 负责落库

## 2. 先启动数据库

查看 Homebrew 管理的 PostgreSQL 服务状态：

```bash
brew services list
```

当前这台机器上看到的是：

```bash
postgresql@17 started
```

启动 PostgreSQL：

```bash
brew services start postgresql@17
```

停止 PostgreSQL：

```bash
brew services stop postgresql@17
```

重启 PostgreSQL：

```bash
brew services restart postgresql@17
```

检查数据库端口是否可连：

```bash
pg_isready
```

如果你想指定地址和端口：

```bash
pg_isready -h localhost -p 5432
```

## 3. 连接配置看哪里

项目连接串放在：

- [.env.local](/Users/xiemin/monter/AI%20Chat/.env.local)

当前内容：

```env
DATABASE_URL="postgresql://xiemin@localhost:5432/ai_chat_app"
```

Prisma 会通过这个配置连接数据库，入口在：

- [prisma.config.ts](/Users/xiemin/monter/AI%20Chat/prisma.config.ts)
- [src/lib/prisma.ts](/Users/xiemin/monter/AI%20Chat/src/lib/prisma.ts)

## 4. 数据库不存在时怎么建

先列出本地数据库：

```bash
psql -l
```

如果没有 `ai_chat_app`，创建它：

```bash
createdb ai_chat_app
```

如果你想删掉重建：

```bash
dropdb ai_chat_app
createdb ai_chat_app
```

## 5. 首次启动项目的完整流程

```bash
brew services start postgresql@17
createdb ai_chat_app
npx prisma migrate dev
npm run dev
```

说明：

- 如果数据库已经存在，`createdb ai_chat_app` 就不用再跑
- `npx prisma migrate dev` 会把 `prisma/migrations/` 里的历史 migration 应用到数据库
- `npm run dev` 才是启动 Next.js 项目

## 6. 日常开发时到底要跑什么

### 情况 A：只改前端 / 组件 / 路由业务逻辑

不用动数据库，直接：

```bash
npm run dev
```

### 情况 B：改了 `schema.prisma`

这时候要跑：

```bash
npx prisma migrate dev
```

它会：

- 根据 `schema.prisma` 的变化生成新 migration
- 应用到本地数据库
- 让数据库结构追上最新代码

### 情况 C：你新增或手改了一条还没执行过的 migration

还是跑：

```bash
npx prisma migrate dev
```

### 情况 D：你改的是一条已经执行过的旧 migration

数据库通常不会自动重跑旧 migration。

这时正确做法是：

- 新建下一条 migration
- 不要指望旧 migration 自动重新执行

## 7. 这个项目里最常用的命令

### 启动项目

```bash
npm run dev
```

### 跑测试

```bash
npm test
```

只跑单个测试文件：

```bash
npm test -- src/app/api/chat/route.test.ts
npm test -- src/components/chat-app.test.tsx
```

### 跑 lint

```bash
npm run lint
```

### 构建生产包

```bash
npm run build
```

说明：

- `build` 不是每次改完都必须跑
- 日常小改动优先跑相关测试和 `lint`
- 接近收尾、改了 Next.js 构建边界、准备交付时，再跑 `build`

### 数据库迁移

```bash
npx prisma migrate dev
```

## 8. 怎么直接连数据库看数据

直接连这个项目的数据库：

```bash
psql "postgresql://xiemin@localhost:5432/ai_chat_app"
```

进库以后常用命令：

```sql
\dt
\d "Chat"
\d "Message"
select * from "Chat";
select * from "Message";
```

退出：

```sql
\q
```

## 9. 这个项目里我经常用过的排查命令

看数据库时区：

```bash
psql "postgresql://xiemin@localhost:5432/ai_chat_app" -c "show timezone;"
```

看数据库当前时间：

```bash
psql "postgresql://xiemin@localhost:5432/ai_chat_app" -c "select now() as now_with_tz, localtimestamp as local_ts;"
```

看会话列表按更新时间排序：

```bash
psql "postgresql://xiemin@localhost:5432/ai_chat_app" -c "select id, title, \"updatedAt\", \"createdAt\" from \"Chat\" order by \"updatedAt\" desc;"
```

看某个 chat 的消息时间：

```bash
psql "postgresql://xiemin@localhost:5432/ai_chat_app" -c "select id, role, \"createdAt\" from \"Message\" where \"chatId\" = '你的-chat-id' order by \"createdAt\" asc;"
```

看项目接口真实返回：

```bash
curl -s "http://localhost:3000/api/chat"
```

测试新建消息：

```bash
curl -s "http://localhost:3000/api/chat" \
  -H "Content-Type: application/json" \
  --data-raw '{"message":"hello"}'
```

测试重命名：

```bash
curl -s -X PATCH "http://localhost:3000/api/chat?chatId=你的-chat-id" \
  -H "Content-Type: application/json" \
  --data-raw '{"title":"新的标题"}'
```

## 10. migration 到底是自动生成还是手写

这个项目两种都有。

更像 Prisma 自动生成的：

- [20260324090800_init/migration.sql](/Users/xiemin/monter/AI%20Chat/prisma/migrations/20260324090800_init/migration.sql)
- [20260325020723_add_chat_updated_at/migration.sql](/Users/xiemin/monter/AI%20Chat/prisma/migrations/20260325020723_add_chat_updated_at/migration.sql)

明显是手写或手工增强过的：

- [20260325103000_use_timestamptz_for_chat_timestamps/migration.sql](/Users/xiemin/monter/AI%20Chat/prisma/migrations/20260325103000_use_timestamptz_for_chat_timestamps/migration.sql)
- [20260325111200_database_managed_chat_timestamps/migration.sql](/Users/xiemin/monter/AI%20Chat/prisma/migrations/20260325111200_database_managed_chat_timestamps/migration.sql)

经验规则：

- 普通建表、加列、索引、外键：优先让 Prisma 生成
- 数据修复、trigger、function、复杂类型转换：自己手写

最常见工作流：

1. 先改 `schema.prisma`
2. 运行 `npx prisma migrate dev`
3. 如果需要高级 SQL，再补 migration

## 11. 这个项目现在的时间规则

当前项目已经改成“数据库统一托管时间”：

- `Chat.createdAt`：数据库负责
- `Chat.updatedAt`：数据库 trigger 负责
- `Message.createdAt`：数据库 trigger 负责
- 新消息写入后，对应 `Chat.updatedAt` 会由数据库自动刷新

所以应用层现在不应该再手动传时间。

## 12. 推荐的最小日常流程

### 第一次跑项目

```bash
brew services start postgresql@17
createdb ai_chat_app
npx prisma migrate dev
npm run dev
```

### 平时开发业务

```bash
brew services start postgresql@17
npm run dev
```

### 改了数据库结构

```bash
brew services start postgresql@17
npx prisma migrate dev
npm run dev
```

### 收尾验证

```bash
npm test
npm run lint
```

需要更强验证时再补：

```bash
npm run build
```
