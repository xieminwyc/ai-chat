# 从 0 开始搭建 Frontend Study Assistant

## 这个文档是干什么的

这份文档用来回顾这个项目是怎么一步一步搭起来的，适合在你忘了“为什么会有这些文件、这些命令、这些表”时回来对照看。

当前项目不是接 OpenAI 的版本，而是：

- `Next.js` 前后端一体项目
- 前端聊天页面
- 后端 `/api/chat` 接口
- `PostgreSQL` 数据库存储聊天记录
- `Prisma` 负责数据库建模和访问
- 回复逻辑先用规则函数实现

---

## 第一阶段：创建项目骨架

一开始我们先创建了一个 `Next.js + TypeScript` 项目。

核心目标不是立刻做复杂功能，而是先把这些东西跑起来：

- 一个页面
- 一个接口
- 一个最小可运行的聊天界面

这个阶段主要产物有：

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/components/chat-app.tsx`
- `src/app/api/chat/route.ts`

这里最重要的理解是：

- `page.tsx` 是页面入口
- `layout.tsx` 是全局布局
- `chat-app.tsx` 是真正的聊天 UI 组件
- `route.ts` 是服务端接口

---

## 第二阶段：先跑通前后端链路

在还没接数据库之前，我们先让页面能够：

1. 输入消息
2. 发请求到 `/api/chat`
3. 后端返回回复
4. 前端把回复显示出来

这个阶段的目的不是“做真 AI”，而是先理解：

- 前端怎么调后端
- 后端怎么接请求
- 请求和返回的数据结构长什么样

也就是先把：

`页面 -> 接口 -> 页面`

这条链路打通。

---

## 第三阶段：放弃 OpenAI，改成规则回复

原本我们尝试过接 OpenAI，但因为 API 额度问题，后面把项目切换成了：

**不用 OpenAI，先做一个有真实数据库和规则回复的聊天式全栈应用**

这样做的好处是：

- 不依赖付费模型
- 更专注学习前后端和数据库
- 后面如果要换成真实模型，只需要替换回复生成逻辑

当前回复逻辑在：

- `src/lib/chat.ts`

这个文件现在扮演的角色就是：

**学习助手的大脑（规则版）**

---

## 第四阶段：安装并连接 PostgreSQL

为了让这个项目从 demo 变成真正的全栈应用，我们接入了 PostgreSQL。

你本机做过的关键步骤：

```bash
brew install postgresql@17
brew services start postgresql@17
psql --version
```

这些命令分别表示：

- 安装 PostgreSQL
- 启动 PostgreSQL 服务
- 检查客户端工具是否可用

然后你又创建了项目数据库：

```sql
CREATE DATABASE ai_chat_app;
```

这一步之后，项目就有了真正存数据的地方。

---

## 第五阶段：接入 Prisma

Prisma 不是数据库本身，而是我们项目里访问数据库的一层工具。

你可以把它理解成：

- `schema.prisma`：数据库蓝图
- `migration.sql`：Prisma 自动生成并执行的 SQL
- `src/lib/prisma.ts`：项目里统一访问数据库的客户端入口

当前关键文件有：

- `prisma/schema.prisma`
- `prisma/migrations/.../migration.sql`
- `prisma.config.ts`
- `src/lib/prisma.ts`

这里最重要的理解是：

- 你主要维护的是 `schema.prisma`
- `migration.sql` 通常不是手写，而是 Prisma 自动生成

---

## 第六阶段：设计当前数据库结构

当前项目有两张核心业务表：

### `Chat`

表示一个聊天会话。

主要字段：

- `id`
- `title`
- `createdAt`

### `Message`

表示一条聊天消息。

主要字段：

- `id`
- `chatId`
- `role`
- `content`
- `createdAt`

关系是：

- 一个 `Chat` 对应多个 `Message`
- 每条 `Message` 属于一个 `Chat`

数据库里你会看到 3 张表，是因为还有一张：

- `_prisma_migrations`

这张是 Prisma 自己用来记录迁移历史的，不是业务表。

---

## 第七阶段：让接口真正写数据库

当前最核心的服务端逻辑在：

- `src/app/api/chat/route.ts`

它现在做的事情是：

1. 接收前端传来的消息
2. 调用 `createAssistantReply(message)` 生成规则回复
3. 如果已有 `chatId`，就继续写进原会话
4. 如果没有 `chatId`，就新建一个 `Chat`
5. 把用户消息写进 `Message`
6. 把助手回复写进 `Message`
7. 返回 `chatId` 和 `reply` 给前端

这是当前项目最关键的全栈闭环。

---

## 第八阶段：前端页面当前做了什么

当前前端页面主要在：

- `src/components/chat-app.tsx`

它现在负责：

- 输入框
- 消息列表
- 点击发送
- 请求 `/api/chat`
- 接收返回值
- 把用户消息和助手消息显示出来
- 显示后端错误

也就是说，这个组件已经不是单纯静态页面了，而是一个真正有前后端交互的页面。

---

## 第九阶段：测试和验证

为了让项目不是“看起来能跑”，而是“真的稳定”，我们还补了测试：

- `src/lib/chat.test.ts`
- `src/components/chat-app.test.tsx`

这些测试现在主要在验证：

- 规则回复逻辑是否符合预期
- 聊天组件是否能正常显示回复
- 后端报错时前端是否能显示错误信息

目前已经验证通过的命令有：

```bash
npm test
npm run lint
npm run build
```

这说明当前版本不只是开发环境能跑，构建也已经能通过。

---

## 当前项目最关键的文件

如果你后面回来看，优先看这几个：

- `src/app/api/chat/route.ts`
- `src/components/chat-app.tsx`
- `src/lib/chat.ts`
- `src/lib/prisma.ts`
- `prisma/schema.prisma`

这几份文件加起来，基本就是当前项目的主干。

---

## 你现在已经学到的东西

到当前这一步，你其实已经接触了这些核心能力：

- Next.js 页面结构
- App Router
- 服务端接口 `route.ts`
- 前端调用后端接口
- PostgreSQL 基础
- Prisma 建模与迁移
- 聊天系统最小数据库设计
- 规则式服务端回复逻辑

这已经不是“只会前端页面”，而是已经进入全栈主干了。

---

## 关键概念复盘

下面这些是当前阶段最值得反复回看的关键点。

### 1. 为什么 `layout.tsx` 很重要

在 `Next.js App Router` 里，`layout.tsx` 是整个应用的全局外壳。

它主要负责：

- 提供最外层 `<html>` 和 `<body>`
- 包住所有页面
- 放全局样式、字体、metadata

它不像 `chat-app.tsx` 那样直接负责业务，但它是框架级骨架，所以不能简单理解成“没用可以删”。

### 2. 为什么 `page.tsx` 和 `layout.tsx` 没看到显式调用关系

这是因为 `Next.js` 和 `Vue` 的常见写法不同。

在 `Next.js App Router` 里：

- `layout.tsx`
- `page.tsx`
- `route.ts`

这类关系很多是 **框架根据文件结构自动建立的**，不是你自己手动 `import` 出来的。

所以：

- `page.tsx -> chat-app.tsx` 是显式调用
- `layout.tsx -> page.tsx` 是框架自动组装

### 3. 为什么前端组件是 `.tsx`，不是 `.vue`

这是因为：

- `.vue` 是 Vue 单文件组件格式
- `.tsx` 是 TypeScript + JSX，用于 React / Next.js 组件

在这个项目里：

- 页面和组件一般是 `.tsx`
- 纯逻辑文件一般是 `.ts`

比如：

- `src/components/chat-app.tsx`：组件
- `src/lib/chat.ts`：规则回复逻辑

### 4. 为什么 `chatId` 一样，但不是同一个 message id

在聊天系统里：

- `Chat` 表示一个会话
- `Message` 表示会话中的每条消息

同一轮用户提问和助手回答，都会属于同一个会话，所以它们的 `chatId` 一样。

但每条消息自己的 `id` 仍然不同。

也就是说：

- `chatId`：说明“这条消息属于哪个聊天”
- `message.id`：说明“这条消息自己是谁”

### 5. 为什么 `messages Message[]` 没有变成数据库里的一列

因为它是 **Prisma 的关系描述字段**，不是数据库真正存储的普通列。

数据库真正需要的是：

- `Message.chatId`

只要在 Message 表里保存 `chatId`，数据库就已经能表达：

**一个 Chat 对应多个 Message**

所以：

- `chatId` 会变成真实列
- `messages Message[]` 不会变成真实列

### 6. Prisma 是什么

Prisma 不是数据库本身，而是项目里访问数据库的一层工具。

你可以这样理解：

- PostgreSQL：真正存数据的数据库
- Prisma：项目里操作数据库的工具层

Prisma 主要负责：

- 定义 schema
- 生成 migration
- 生成数据库客户端
- 让 TypeScript 操作数据库更方便

### 7. `schema.prisma` 和 `migration.sql` 的关系

你主要维护的是：

- `prisma/schema.prisma`

Prisma 会根据它自动生成：

- `prisma/migrations/.../migration.sql`

你可以把它理解成：

- `schema.prisma`：蓝图
- `migration.sql`：真正执行给数据库的 SQL

### 8. 为什么数据库里会有 `_prisma_migrations`

除了业务表：

- `Chat`
- `Message`

你还会看到：

- `_prisma_migrations`

这张表是 Prisma 自己用来记录迁移历史的，不是业务表。

它的作用是告诉 Prisma：

- 哪些 migration 已经执行过
- 当前数据库结构处于哪个版本

### 9. `src/lib/prisma.ts` 是干什么的

它是项目里统一创建 Prisma Client 的地方。

你可以理解成：

**所有后端代码访问数据库时，先从这里拿 `prisma` 实例。**

这样做的好处是：

- 避免每个文件都重复创建数据库客户端
- 开发模式下更稳定
- 数据库访问入口更统一

### 10. 为什么测试里要加 `cleanup()`

因为前端组件测试会把组件渲染到测试环境里。

如果一个测试跑完不清理，下一个测试继续渲染时，前一个测试的 DOM 可能还残留着，容易出现：

- 页面里有两个“发送”按钮
- 测试相互污染

所以：

```ts
afterEach(() => {
  cleanup();
});
```

表示：

**每个测试跑完后，把测试页面清空。**

### 11. `findMany` 是什么

`findMany` 是 Prisma 提供的“查多条记录”方法。

例如：

- `prisma.chat.findMany(...)`：查很多个会话
- `prisma.message.findMany(...)`：查某个会话下的很多条消息

它和 `findUnique` 的区别是：

- `findUnique`：查唯一的一条
- `findMany`：查多条，返回数组

### 12. `response.ok` 和状态码的关系

前端的 `response.ok` 是根据 HTTP 状态码判断的：

- `200 ~ 299` -> `response.ok === true`
- 其他状态码 -> `response.ok === false`

所以后端不能只返回 JSON，还要返回正确状态码。

例如：

- 成功返回数据：默认 `200`
- 参数问题：通常 `400`
- 服务端内部出错：通常 `500`

### 13. 为什么数据库里会有 3 张表

当前你会看到：

- `Chat`
- `Message`
- `_prisma_migrations`

其中：

- `Chat` 和 `Message` 是业务表
- `_prisma_migrations` 是 Prisma 自己记录迁移历史用的表

### 14. 为什么 `messages Message[]` 不是数据库里的一列

因为它是 Prisma 的关系描述字段，不是数据库里真正存储的普通列。

真正落到数据库里的，是：

- `Message.chatId`

数据库用这个外键来表达：

**一个 Chat 拥有很多个 Message**

### 15. 为什么删除 `Chat` 时 `Message` 也会一起消失

这是因为我们在 `schema.prisma` 里给 `Message -> Chat` 的关系写了：

```prisma
onDelete: Cascade
```

它的意思是：

- 删掉一条 `Chat`
- 数据库会自动把属于这个 `Chat` 的所有 `Message` 一起删掉

这叫 **级联删除**。

所以当前删除会话功能，不需要你手动先一条条删消息，再删会话；数据库关系已经帮你把这件事接住了。

### 16. 为什么会话标题要和正文回复分开生成

现在 `src/lib/chat.ts` 里，回复逻辑已经分成了两种模式：

- `reply`：返回右侧聊天区域看到的完整学习助手回复
- `title`：返回左侧会话列表看到的简短标题

这是因为：

- 正文回复需要更完整，能解释学习建议
- 会话标题需要更短，更像“这一轮对话在聊什么”

所以现在创建新会话时，不再直接用 `message.slice(...)`，而是用单独的标题生成逻辑。

### 17. 为什么 `updatedAt` 很重要

现在 `Chat` 表里除了：

- `id`
- `title`
- `createdAt`

还多了一个：

- `updatedAt`

它表示：

**这条会话最近一次发生变化的时间**

这里的“变化”包括：

- 发了一条新消息
- 改了会话标题

会话列表现在按 `updatedAt desc` 排序，所以最近活跃的聊天会自动顶到最上面。这比单纯按 `createdAt` 排，更像真实聊天产品。

### 18. 为什么要把 `chatId` 同步到 URL

现在当前会话不只保存在：

- React state
- `localStorage`

还会同步到 URL，比如：

```text
/?chatId=xxxx
```

这样做的好处是：

- 刷新页面时，更容易恢复到正确会话
- 以后如果要做更完整的路由结构，会更顺
- 你会开始真正理解“前端状态”和“路由状态”是两件相关但不同的东西

当前实现里，页面首次加载时会优先读 URL 里的 `chatId`，只有没有时才回退到 `localStorage`。

### 19. 为什么重命名标题要走后端接口

虽然“改标题”看起来只是一个小 UI 操作，但它本质上改的是数据库里的 `Chat.title`。

所以正确流程仍然是：

1. 前端输入新标题
2. 请求 `PATCH /api/chat?chatId=...`
3. 后端更新数据库
4. 前端再更新本地列表状态

这件事很适合用来理解：

**只要数据是“真实持久化数据”，最终都应该经过服务端。**

---

## 接下来大致蓝图

从当前这个基础版本开始，后面建议按下面这条线继续学。

### 阶段 1：读出历史聊天记录

目标：

- 页面刷新后不丢消息
- 根据 `chatId` 读取已有消息
- 前端初始化时从数据库加载内容

这一阶段你会重点学到：

- 后端如何查询数据库
- 前端如何在页面初始化时请求数据
- `Chat` / `Message` 从“只会存”变成“会存也会读”

当前这个阶段已经完成。

### 阶段 2：做多会话列表

目标：

- 左侧显示历史会话
- 点击某个会话切换聊天内容
- 支持新建会话

这一阶段你会重点学到：

- 多接口拆分
- 会话列表查询
- URL / 状态 / `chatId` 的关系

当前这个阶段也已经完成。

### 阶段 3：升级规则回复逻辑

目标：

- 把学习助手做得更像一个真正产品
- 根据不同学习主题返回更合适的回复
- 为后续替换成模型能力留好结构

这一阶段你会重点学到：

- 服务端业务逻辑设计
- 模块化组织
- 可替换架构

当前这个阶段已经做了第一步：

- 会话标题优化
- 删除会话能力
- URL 同步当前会话
- 会话按最近活跃时间排序

也就是说，项目已经开始从“能跑的聊天原型”往“更像产品的聊天应用”推进。

### 阶段 4：再接入真正的模型能力

等你前后端和数据库主线更稳以后，再考虑：

- 接 OpenAI
- 接本地模型
- 做流式输出
- 做工具调用
- 做知识库/RAG

这时候你就不是“为了学 API 而接模型”，而是把模型接进一套已经成型的全栈骨架里。

---

## 接下来的下一步

当前最推荐继续做的是：

**继续完善会话列表体验，比如做真正的动态路由、增加搜索、或者支持用户手动排序。**

这样你接下来会继续学到：

- 会话列表的产品体验怎么继续打磨
- 前端状态和路由状态怎么协同
- 会话标题什么时候生成、什么时候允许用户修改
- 一个真实全栈聊天页是怎么逐步长出来的
