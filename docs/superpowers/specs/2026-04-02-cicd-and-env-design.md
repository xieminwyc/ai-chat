# AI Chat CI/CD 与环境变量分层设计

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | AI Chat 项目 CI/CD 与环境变量分层设计 |
| 面向对象 | 项目 owner、后续实施者、未来回看部署链路的自己 |
| 当前阶段 | 从手动部署升级到最小可用自动化部署 |
| 目标仓库 | `AI Chat` |
| 推荐方向 | `CI + SSH 自动部署 + 服务器 deploy.sh + 本地多环境命令` |

## 背景与目标

当前项目已经完成了这条手动部署链路：

```text
本地开发
-> GitHub
-> 阿里云服务器
-> Neon PostgreSQL
-> Prisma migration
-> Next.js 生产构建
-> PM2 托管
-> Nginx 反向代理
-> 公网访问
```

下一阶段不再重复练习手动部署，而是把已经验证可行的部署步骤整理成一套最小可用的 CI/CD 结构，并同时解决环境变量管理不够清晰的问题。

本次设计目标有 4 个：

1. 把 `lint / test / build` 放进 GitHub Actions，形成 CI。
2. 在 `push main` 后自动触发服务器部署，形成第一版 CD。
3. 让服务器自动部署与手动部署共享同一套部署脚本，降低维护成本。
4. 引入本地可切换的环境变量方案，支持 `npm run dev:test` 和 `npm run dev:pro` 这类命令。

## 一期范围

本次设计只覆盖以下内容：

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- 仓库内的环境变量加载方案
- `prisma.config.ts` 的环境变量读取方式调整
- 服务器上的 `scripts/deploy.sh`
- README 的项目说明、启动方式、环境变量说明、部署说明

## 一期不做

- Docker 镜像部署
- 多环境发布流水线
- 自动回滚
- 蓝绿部署
- preview 环境
- 把线上真实业务密钥同步保存在 GitHub

## 方案选型

### 方案 A：单个 workflow 同时处理 CI 和部署

优点：

- 文件少
- 最容易快速跑通

不足：

- CI 和部署职责混在一起
- 后续扩展环境、权限和手动触发会变乱

### 方案 B：`ci.yml` 与 `deploy.yml` 分离

优点：

- 结构清楚
- 符合常见团队实践
- 后续更容易扩展 staging / production

不足：

- 比单文件方案多一点理解成本

### 方案 C：部署命令写死在 workflow 中

优点：

- 上手直接

不足：

- 自动部署和手动部署走两套逻辑
- 排查线上问题时不够直观

### 推荐方案

推荐采用：

`方案 B + 服务器 deploy.sh`

也就是：

- GitHub 上拆分 `ci.yml` 和 `deploy.yml`
- 服务器上维护一份 `deploy.sh`
- GitHub Actions 通过 SSH 登录服务器，只负责调用 `deploy.sh`

推荐原因：

- 这最贴近当前已经打通的手动部署链路
- 自动与手动部署共用一套命令，排查成本低
- 后续学 Docker 时，也能清楚看见“脚本式部署”和“镜像式部署”的边界

## 目标结构

### GitHub 侧

```text
.github/
  workflows/
    ci.yml
    deploy.yml
```

### 仓库侧

```text
.env.example
.env.local
.env.test
.env.production
README.md
prisma.config.ts
scripts/
  env.mjs
```

### 服务器侧

```text
/root/apps/ai-chat/
  scripts/
    deploy.sh
```

## CI 设计

### 触发规则

- `pull_request` 到 `main` 时运行
- `push` 到 `main` 时运行

### 目标

证明当前提交至少满足：

- 依赖可安装
- 代码通过 lint
- 单元测试通过
- 项目可成功生产构建

### 核心步骤

```text
checkout
-> setup node
-> npm ci
-> npm run lint
-> npm run test
-> npm run build
```

### 环境变量策略

CI 不使用真实生产密钥，而是使用安全占位值。

原因：

- CI 的目标是验证代码链路，不是连接真实线上模型服务
- 当前测试已能通过 mock 和 `process.env` 覆盖关键分支
- 真实 API key 和数据库连接串不应暴露给每次构建

CI 如需环境变量，只注入最小占位值，例如：

- `DATABASE_URL`
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_BASE_URL`
- `SILICONFLOW_MODEL`

这些值用于让构建和必要初始化不报缺失错误，不代表真的调用线上资源。

## CD 设计

### 触发规则

- `push` 到 `main`
- 只有在 CI 成功后才继续部署

### workflow 依赖方式

推荐让 `deploy.yml` 依赖 `ci.yml` 的成功结果，而不是单纯和 `ci.yml` 并行触发。

第一版可接受的实现方式包括：

- `workflow_run` 监听 `ci.yml` 成功后再启动部署
- 或在同一 workflow 内通过 `needs` 串联，但这不属于当前推荐结构

本次设计优先推荐：

- `ci.yml` 独立负责校验
- `deploy.yml` 使用 `workflow_run` 只在 `ci.yml` 成功且分支为 `main` 时触发

### 整体流程

```text
push main
-> ci.yml 成功
-> deploy.yml 启动
-> GitHub Actions 读取 SSH secrets
-> SSH 登录阿里云服务器
-> 执行 /root/apps/ai-chat/scripts/deploy.sh
-> 部署日志回传到 Actions
```

### GitHub Secrets

第一版只需要保存 SSH 连接相关 secrets：

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_PORT`
- `SERVER_SSH_KEY`

不把真实业务环境变量搬到 GitHub 的原因：

- 当前生产环境已经稳定放在服务器本地
- 服务器本地 `.env.local` 更贴合现有部署结构
- 第一版先把自动化流程跑稳，再考虑是否引入更复杂的 secret 分发机制

## 服务器 `deploy.sh` 设计

### 职责

`deploy.sh` 是服务器上的唯一部署入口，负责执行已经验证可行的手动部署步骤。

### 标准流程

```text
进入项目目录
-> 拉取 main 最新代码
-> 安装依赖
-> 执行 prisma migrate deploy
-> 执行 next build
-> pm2 restart ai-chat
-> 做健康检查
```

### 具体要求

- 使用 `set -e`，任一步失败立刻停止
- 每个阶段打印清晰日志，便于看 GitHub Actions 输出
- 健康检查失败时返回非 0，明确标记部署失败

### 健康检查建议

第一版健康检查可以先保持简单，例如：

- 检查本机 `3000` 端口服务可访问
- 或访问应用首页 / 某个轻量 GET 接口

第一版不要求做完整的自动回滚逻辑。

## 环境变量分层设计

### 文件约定

仓库中采用以下文件：

- `.env.example`
- `.env.local`
- `.env.test`
- `.env.production`

### 各文件职责

` .env.example `

- 提交到 GitHub
- 只放变量名与示例值
- 用于提示开发者需要哪些变量

` .env.local `

- 本地真实开发配置
- 不提交到 GitHub
- 默认本地开发命令使用它

` .env.test `

- 用于本地切换到“测试链路配置”
- 可提交到 GitHub，但只能放安全值、假值或可公开的测试配置
- 不放真实私密 key

` .env.production `

- 用于本地模拟“偏生产的连接配置”
- 如果提交到 GitHub，也只能放示例值或非敏感默认值
- 线上真实密钥仍只保存在服务器本地

### 命令命名

保留用户期望的命名方式：

- `npm run dev`
- `npm run dev:local`
- `npm run dev:test`
- `npm run dev:pro`

对应含义：

- `dev` / `dev:local`：本地开发，加载 `.env.local`
- `dev:test`：本地开发服务器，但加载 `.env.test`
- `dev:pro`：本地开发服务器，但加载 `.env.production`

### 关键约束

命令名可以叫 `test` / `pro`，但不直接把 `NODE_ENV` 切成 `test` 或 `production` 来驱动 `next dev`。

原因：

- `next dev` 本质是开发服务器，应保持开发模式
- Next.js 官方对 `NODE_ENV=test` 有专门的 `.env.test` 加载语义
- 如果直接滥用 `NODE_ENV`，容易把 `Next`、`Vitest`、`Prisma` 的行为混在一起

因此推荐引入自定义环境标识，例如：

- `APP_ENV=local`
- `APP_ENV=test`
- `APP_ENV=production`

然后由仓库内统一的 env loader 根据 `APP_ENV` 选择加载哪个文件。

### 与 Next.js 默认加载规则的关系

Next.js 在 `next dev` 下仍会自动读取 `.env.local`。为了让 `dev:test` 和 `dev:pro` 生效，env loader 需要在启动 `next dev` 之前先把目标文件中的变量注入 `process.env`。

这样可以利用 Next.js 官方的优先级规则：

`process.env` 优先于 `.env.*`

结果就是：

- `dev` / `dev:local` 仍然主要依赖 `.env.local`
- `dev:test` 可用 `.env.test` 覆盖相同 key
- `dev:pro` 可用 `.env.production` 覆盖相同 key

## `prisma.config.ts` 设计

### 当前问题

当前 `prisma.config.ts` 写死读取 `.env.local`，会带来两个问题：

1. Prisma 命令无法跟随 `dev:test` / `dev:pro` 切换。
2. 应用和 Prisma 的环境选择逻辑不一致，后续容易排查困难。

### 目标

让 Prisma 和应用共用同一套环境选择规则。

### 推荐实现

- 在仓库内新增一个统一 env loader，例如 `scripts/env.mjs`
- 由它根据 `APP_ENV` 解析目标 env 文件
- `prisma.config.ts` 调用同一套逻辑，不再写死 `.env.local`

这样后续命令就能扩展为：

- `npm run prisma:generate`
- `npm run prisma:generate:test`
- `npm run prisma:generate:pro`
- `npm run prisma:migrate:test`
- `npm run prisma:migrate:pro`

第一版不要求一次把所有 Prisma 命令都补齐，但至少要把环境加载机制先统一。

## README 设计

当前 README 还是模板内容，需要替换为真实项目说明。

### README 至少包含

- 项目简介
- 当前技术栈
- 主要目录说明
- 本地启动方式
- 环境变量说明
- 测试与构建命令
- 线上部署结构
- CI/CD 流程说明

### README 应回答的问题

- 这个项目是做什么的
- 本地第一次拉下来怎么跑
- 需要准备哪些环境变量
- `dev` / `dev:test` / `dev:pro` 各自是什么意思
- 当前线上是怎么部署的
- 自动部署依赖哪些 GitHub secrets

## 数据流与职责边界

### 本地开发链路

```text
npm run dev[:target]
-> env loader 读取目标 env 文件
-> Next.js 开发服务器启动
-> Prisma 与 AI provider 读取统一 process.env
```

### 自动部署链路

```text
开发者 push main
-> GitHub Actions CI 校验
-> GitHub Actions Deploy
-> SSH 登录服务器
-> deploy.sh
-> 服务器本地 .env.local
-> Next.js + Prisma + PM2
```

### 责任划分

- GitHub Actions：触发、校验、连接服务器
- `deploy.sh`：执行服务器部署步骤
- 服务器 `.env.local`：承载真实线上配置
- env loader：为本地命令和 Prisma 统一选择环境文件

## 错误处理与失败策略

### CI 失败

- 直接阻止部署
- 用户在 PR / Actions 页面看失败项

### SSH 连接失败

- `deploy.yml` 标红
- 不会影响服务器当前已运行版本

### migration 失败

- `deploy.sh` 立即退出
- `pm2 restart` 不应继续执行

### build 失败

- `deploy.sh` 立即退出
- 当前已在线版本继续保留

### 健康检查失败

- 部署流程标红
- 提醒人工排查服务状态、日志和 PM2

## 测试策略

本次设计的验证重点包括：

- `ci.yml` 能在 GitHub Actions 跑通
- `deploy.yml` 能在 CI 成功后触发
- `deploy.sh` 可手动执行，也可被 Actions 调用
- `dev:test` / `dev:pro` 能切换到对应环境文件
- `prisma.config.ts` 不再写死读取 `.env.local`
- README 能清楚说明项目与部署方式

### 一期实现后的最小验收标准

满足以下条件即可认为一期达标：

- PR 能自动跑 `lint/test/build`
- `main` 提交能自动触发部署
- 自动部署失败时日志可读
- 本地能通过 npm scripts 在 `.env.local`、`.env.test`、`.env.production` 间切换
- README 不再是默认模板

## 开放问题

以下问题本次设计先不阻塞实施，但应在后续演进时再判断：

- 是否需要为测试环境引入独立数据库
- 是否需要为部署脚本增加备份与回滚
- 是否要把服务器 root 用户替换为专用 deploy 用户
- 什么时候进入 Docker 化部署

## 结论

第一版最适合当前项目的路径不是直接上 Docker，而是先把已验证的服务器部署经验产品化为一套最小 CI/CD。

推荐落地方案为：

- GitHub 使用 `ci.yml + deploy.yml`
- 服务器使用统一 `deploy.sh`
- 本地引入 `APP_ENV` 驱动的环境文件选择机制
- Prisma 改为跟随统一 env loader
- README 更新为真实项目说明

这能在不大幅增加复杂度的前提下，让项目从“会手动部署”进入“理解并拥有可重复自动部署链路”的阶段。
