# AI Chat CI/CD 与环境变量分层设计

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | AI Chat 项目 CI/CD 与环境变量分层设计 |
| 面向对象 | 项目 owner、后续实施者、未来回看部署链路的自己 |
| 当前阶段 | 已落地实现版 |
| 目标仓库 | `AI Chat` |
| 最终方向 | `CI 校验 + CI 构建产物 + Deploy 发布产物 + 服务器本地 env` |

## 背景

项目最初已经打通过手动部署链路：

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

后续在自动化过程中，实际踩到过几类问题：

1. 服务器每次部署都完整 `npm ci`，非常慢。
2. 长时间无输出时，GitHub Actions 的 SSH 会话容易出现 `Broken pipe`。
3. 如果 deploy 脚本本身发生变化，而部署入口是“先执行旧脚本，再在脚本里 `git pull`”，那么脚本修复通常要下一次部署才生效。
4. CI 与服务器环境变量职责不清时，构建和 Prisma 初始化容易出现误解。

因此，这份文档不再记录“最初理想方案”，而是直接记录当前仓库已经落地的真实实现。

## 最终结论

当前版本最终采用：

- `ci.yml` 负责 `lint / test / build`
- CI 构建成功后，把 `.next` 打包成 artifact
- `deploy.yml` 在 `CI` 成功后触发
- `deploy.yml` 下载 CI artifact，并通过 `scp` 上传到服务器
- 服务器执行 `scripts/deploy.sh`
- `deploy.sh` 继续负责：
  - `git pull`
  - 按需安装依赖
  - 按需重新生成 Prisma Client
  - `prisma migrate deploy`
  - 发布 CI 产物或本地兜底 build
  - `pm2 restart`
  - 健康检查

也就是说，当前线上部署的真实形态已经从：

```text
GitHub Actions -> SSH 进服务器 -> 服务器自己 build
```

升级成：

```text
GitHub Actions CI build
-> 上传 .next 构建产物
-> Deploy workflow 下载 artifact
-> scp 到服务器
-> 服务器发布该产物
```

这比“服务器自己完整构建”更稳，也更少依赖服务器临时网络状态。

## 当前架构

### 应用运行架构

```text
Browser
-> Nginx :80
-> Next.js :3000
-> Neon PostgreSQL
```

### 自动部署架构

```text
push main
-> CI workflow
-> npm ci
-> lint
-> test
-> build
-> 打包 .next 为 deploy-artifact.tgz
-> 上传 artifact
-> Deploy workflow
-> 下载 artifact
-> scp artifact 到服务器 /tmp
-> SSH 登录服务器
-> git pull 最新 main
-> 执行 scripts/deploy.sh /tmp/ai-chat-deploy-artifact.tgz
-> 迁移数据库
-> 发布 .next 产物
-> pm2 restart ai-chat
-> 健康检查
```

## 目标文件

当前落地的关键文件为：

```text
.github/workflows/ci.yml
.github/workflows/deploy.yml
scripts/deploy.sh
scripts/env.mjs
prisma.config.ts
.env.example
.env.test
.env.production
README.md
```

## CI 设计

### 触发规则

- `pull_request` 到 `main`
- `push` 到 `main`

### 职责

CI 只负责验证和构建，不负责真正 SSH 上线。

当前 CI 具体负责：

1. 安装依赖
2. 执行 `eslint`
3. 执行 `vitest`
4. 执行生产构建
5. 将 `.next` 打包成 `deploy-artifact.tgz`
6. 上传名为 `next-build-artifact` 的 artifact

### 当前实际步骤

```text
actions/checkout
-> actions/setup-node
-> npm ci
-> npm run lint
-> npm run test
-> npm run build
-> tar -czf deploy-artifact.tgz .next
-> actions/upload-artifact
```

### 环境变量策略

CI 不使用真实线上密钥，只注入最小占位值：

- `DATABASE_URL`
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_BASE_URL`
- `SILICONFLOW_MODEL`

这些值只用于：

- 让构建链路不因缺环境变量而直接失败
- 让测试和初始化过程满足最低依赖

CI 不负责连接真实生产数据库和真实模型服务。

## Deploy 设计

### 触发规则

Deploy workflow 通过 `workflow_run` 监听 `CI`：

- 仅当 `CI` 成功
- 且事件来源是 `push`
- 且分支是 `main`

时才执行部署。

这意味着：

- PR 会跑 CI，但不会自动发布
- 只有真正 push 到 `main` 的代码，才会触发线上部署

### 当前实际步骤

当前 [deploy.yml](/Users/xiemin/monter/AI%20Chat/.github/workflows/deploy.yml) 的实际流程是：

1. 从触发本次 Deploy 的那次 CI run 中查找 `next-build-artifact`
2. 下载 artifact zip
3. 解压出 `deploy-artifact.tgz`
4. 准备 SSH 私钥和 `known_hosts`
5. 用 `scp` 把 `deploy-artifact.tgz` 上传到服务器 `/tmp/ai-chat-deploy-artifact.tgz`
6. SSH 登录服务器
7. 先执行一次 `git pull origin main`
8. 再执行：

```bash
bash scripts/deploy.sh /tmp/ai-chat-deploy-artifact.tgz
```

### 为什么 Deploy workflow 里要先 `git pull`

这是后续排障后补的关键点。

原因是：

- 如果部署入口一开始执行的是服务器上的旧版 `deploy.sh`
- 而 `deploy.sh` 内部才去 `git pull`
- 那么当前这次部署仍然会按旧脚本继续执行
- 新脚本修复通常要下一次部署才生效

为了避免这个坑，现在 deploy workflow 在远端入口处先 `git pull`，再执行脚本，这样当前这次部署就能直接使用最新版脚本。

## 服务器 `deploy.sh` 设计

### 核心职责

当前 [deploy.sh](/Users/xiemin/monter/AI%20Chat/scripts/deploy.sh) 是服务器上的统一部署入口。

它支持两种模式：

1. 带 CI artifact 的自动部署模式
2. 不带 artifact 的手动兜底模式

### 当前实际流程

```text
进入项目目录
-> 记录 PREVIOUS_HEAD
-> git pull origin main
-> 记录 CURRENT_HEAD
-> 判断依赖文件是否变化
-> 如有必要才执行 npm ci
-> 如有必要才执行 prisma generate
-> 执行 prisma migrate deploy
-> 如果传入 artifact：
   -> 校验 artifact
   -> 替换 .next
-> 否则：
   -> 本地执行 npm run build
-> pm2 restart ai-chat
-> 健康检查
```

### 依赖跳过策略

这部分是当前部署提速的关键。

脚本会比较 `PREVIOUS_HEAD` 和 `CURRENT_HEAD` 是否改动了这些文件：

- `package.json`
- `package-lock.json`
- `.npmrc`
- `patches/` 目录

只有这些依赖相关内容变化时，才会重新执行 `npm ci`。

否则会打印：

```text
[deploy] dependency files unchanged, skipping npm ci
```

这能避免每次部署都重新安装依赖。

### Prisma Client 重新生成策略

如果本次部署没有重新安装依赖，但以下文件发生变化：

- `prisma/schema.prisma`
- `prisma.config.ts`

脚本会单独执行一次：

```bash
npx prisma generate
```

这样能保证 Prisma Client 和最新 schema 保持一致，但不必为此重新完整安装全部依赖。

### 心跳日志设计

为避免长时间静默导致 SSH 会话断开，脚本对长耗时步骤使用 `run_with_heartbeat` 包装：

- `npm ci`
- `prisma generate`
- `prisma migrate deploy`
- `npm run build`

如果步骤执行较久，日志会周期性输出：

```text
[deploy] ... still running (xxs elapsed)
```

这样更方便：

- 在 GitHub Actions 里确认它没有假死
- 排查真正慢的是哪个阶段

### Artifact 发布模式

如果 `deploy.sh` 收到了一个 artifact 路径参数，例如：

```bash
bash scripts/deploy.sh /tmp/ai-chat-deploy-artifact.tgz
```

它会：

1. 先校验该 tar 包可读
2. 删除服务器当前 `.next`
3. 解压 CI 生成的 `.next` 到项目目录

此时服务器不会再执行 `npm run build`。

如果没有传 artifact，脚本仍然会走本地兜底：

```bash
npm run build
```

这保证了：

- 自动部署时优先复用 CI 构建产物
- 手动部署时仍然有后备路径

## 环境变量分层

### 当前约定

项目当前约定的环境文件为：

- `.env.example`
- `.env.local`
- `.env.test`
- `.env.production`

### 真实职责

- `.env.example`
  - 只放示例值
  - 提交到仓库

- `.env.local`
  - 本地开发真实值
  - 服务器线上真实值
  - 不提交

- `.env.test`
  - 本地测试链路切换时使用

- `.env.production`
  - 本地模拟生产风格配置时使用

### 当前 env loader 实现

[scripts/env.mjs](/Users/xiemin/monter/AI%20Chat/scripts/env.mjs) 会根据 `APP_ENV` 选择：

- `local -> .env.local`
- `test -> .env.test`
- `production/pro/prod -> .env.production`

项目当前脚本中：

- `npm run dev`
- `npm run dev:local`
- `npm run dev:test`
- `npm run dev:pro`

都会先通过 `scripts/env.mjs` 把目标 env 文件注入 `process.env`。

### Prisma 配置

[prisma.config.ts](/Users/xiemin/monter/AI%20Chat/prisma.config.ts) 也复用了同一套 env loader。

这意味着：

- 应用本身
- Prisma CLI
- 本地多环境命令

现在都走同一套环境变量选择逻辑。

## GitHub Secrets

当前 GitHub 仅保存 SSH 连接相关 secret：

- `SERVER_HOST`
- `SERVER_PORT`
- `SERVER_USER`
- `SERVER_SSH_KEY`

线上真实业务变量没有搬到 GitHub，仍然保留在服务器本地 `.env.local`。

这样做的原因是：

1. 当前部署仍然是 SSH 到现有服务器执行
2. 线上真实配置已经稳定保存在服务器
3. 第一阶段先把自动化链路跑稳，避免把“部署问题”和“secret 分发系统”混在一起

## 当前方案的优点

### 1. 比纯服务器构建更稳

生产构建现在优先在 GitHub Actions 完成，减少了服务器临时网络、CPU 和内存抖动对构建阶段的影响。

### 2. 比完整镜像方案更轻

不需要现在就引入 Docker 镜像仓库、镜像拉取、容器编排等复杂度。

### 3. 仍保留手动兜底能力

即使 artifact 发布链路临时有问题，服务器上的 `deploy.sh` 仍然能作为本地 build 的后备方案。

### 4. 依赖不变时部署明显更快

跳过 `npm ci` 后，绝大部分日常改动不会再被完整装依赖拖慢。

## 当前方案的边界

当前实现仍然不是最终极形态，它还保留一些刻意接受的现实折中：

1. 服务器上仍然保留源码仓库
2. 服务器仍然可能在依赖变化时执行 `npm ci`
3. 数据库迁移仍然在服务器上执行
4. 发布单位目前是 `.next` 产物，不是完整 standalone 包
5. 没有自动回滚
6. 没有 staging / production 多环境发布

这些都属于后续可继续演进的方向，但不属于当前这一版最小可用自动化部署的范围。

## 建议的观察点

### CI 成功时应看到

- `Run ESLint`
- `Run tests`
- `Build the app`
- `Upload build artifact`

### Deploy 成功时应看到

- `Download build artifact metadata`
- `Unpack build artifact`
- `Upload build artifact to server`
- `Deploy on server`

### 服务器部署日志里应重点关注

如果依赖没变化：

```text
[deploy] dependency files unchanged, skipping npm ci
```

如果是 artifact 发布路径：

```text
[deploy] publishing CI build artifact from /tmp/ai-chat-deploy-artifact.tgz
```

如果最终成功：

```text
[deploy] deployment completed
```

## 未来可升级方向

在当前版本基础上，后续值得继续演进的方向有：

1. 把 `.next` artifact 升级为 Next standalone 产物
2. 让服务器进一步减少对源码仓库的依赖
3. 增加自动回滚
4. 增加 staging 环境
5. 引入更完善的部署日志归档

但在当前阶段，这些都不如“先让主链路稳定、可观察、少折腾”更重要。

## 最终结论

截至当前版本，AI Chat 的 CI/CD 与环境变量分层已经落地为：

- `ci.yml` 负责代码校验与生产构建
- CI 把 `.next` 打成 artifact
- `deploy.yml` 在 CI 成功后下载 artifact 并上传到服务器
- 服务器通过 `deploy.sh` 执行统一发布逻辑
- 依赖未变时跳过 `npm ci`
- Prisma schema 变化时按需 `prisma generate`
- 自动部署优先发布 CI 构建产物，而不是在服务器重新 build
- 线上真实环境变量继续保存在服务器本地 `.env.local`

这套方案已经能满足当前项目阶段最重要的目标：

- 自动化
- 可观察
- 比原来更稳
- 比原来更快
- 仍然保留手动兜底空间
