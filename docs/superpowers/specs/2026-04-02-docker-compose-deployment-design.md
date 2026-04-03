# AI Chat Docker Compose 部署设计

## 文档概览

| 项目 | 内容 |
| --- | --- |
| 文档主题 | AI Chat Docker Compose 部署设计 |
| 面向对象 | 项目 owner、后续实施者、未来回看容器化路径的自己 |
| 当前阶段 | 第二阶段部署方案设计 |
| 目标仓库 | `AI Chat` |
| 推荐方向 | `Docker + docker compose + GHCR + GitHub Actions SSH 发布` |

## 背景

当前仓库已经落地了一版可用的自动化部署链路：

```text
push main
-> CI 跑 lint / test / build
-> CI 上传 .next artifact
-> Deploy workflow 下载 artifact
-> SSH 登录服务器
-> 服务器执行 deploy.sh
-> 发布 .next 产物
```

这版方案已经比最初“服务器自己完整构建”更稳，但仍然存在天然边界：

1. 服务器上仍然保留源码仓库。
2. 服务器上仍然要维护 Node、npm、PM2。
3. 服务器在依赖变化时仍可能执行 `npm ci`。
4. CI 构建环境与服务器运行环境仍有潜在差异。
5. 部署脚本会随着场景增多不断变复杂。

因此，下一阶段更推荐把部署升级为 Docker 化。

## 目标

这一阶段 Docker 化的目标是：

1. 让应用以容器运行，而不是直接由 PM2 托管 `next start`。
2. 尽量统一本地、CI、线上三处的运行环境。
3. 让服务器尽量只做“拉取镜像并启动容器”，而不是现场构建。
4. 保留当前已经熟悉的 GitHub Actions + SSH 触发方式，降低迁移成本。
5. 不在第一版 Docker 化里同时引入太多新概念，比如 Kubernetes、蓝绿发布、自动回滚。

## 不做

这一版明确不做：

- Kubernetes
- 多节点部署
- 自动回滚
- 灰度 / 蓝绿发布
- 同时把数据库也容器化
- 一上来就替换掉现有 Nginx 入口

## 方案比较

### 方案 A：服务器上 `docker compose build && docker compose up -d`

流程：

```text
GitHub Actions
-> SSH 登录服务器
-> git pull
-> 服务器本地 docker compose build
-> docker compose up -d
```

优点：

- 最容易从当前脚本式部署迁过去
- 不需要镜像仓库
- 一开始理解成本最低

缺点：

- 服务器仍然自己 build
- 构建慢的问题只是从 `npm build` 变成 `docker build`
- 服务器仍然依赖源码、网络和构建环境

### 方案 B：CI 构建镜像，导出 tar，通过 SSH 传到服务器

流程：

```text
GitHub Actions build image
-> docker save
-> scp 到服务器
-> docker load
-> docker compose up -d
```

优点：

- 服务器不需要构建镜像
- 不需要外部镜像仓库

缺点：

- 传输镜像 tar 通常很大
- workflow 会明显变重
- 镜像缓存和版本管理都不够优雅

### 方案 C：CI 构建镜像并推到 GHCR，服务器只 pull 并 `docker compose up -d`

流程：

```text
push main
-> GitHub Actions build Docker image
-> push 到 GHCR
-> SSH 登录服务器
-> docker compose pull
-> docker compose up -d
```

优点：

- 服务器不再现场构建
- 镜像版本清晰
- 本地、CI、线上更容易统一
- 是从当前方案升级到容器化最平衡的一条路

缺点：

- 需要引入镜像仓库概念
- 需要新增 GHCR 登录和镜像权限配置

## 推荐结论

推荐采用：

`方案 C：Docker + docker compose + GHCR + GitHub Actions SSH 发布`

推荐原因：

1. 比当前脚本式部署更稳定。
2. 比“服务器自己 build 镜像”更快、更一致。
3. 继续沿用你已经打通的 GitHub Actions + SSH 入口，不会突然换一整套操作习惯。
4. 对当前单机部署场景足够合适。

## 最终架构

### 运行架构

```text
Browser
-> Nginx :80
-> docker compose service: ai-chat
-> container:3000
-> Neon PostgreSQL
```

### 发布架构

```text
push main
-> CI workflow
-> lint / test
-> docker build
-> push image to GHCR
-> Deploy workflow
-> SSH 登录服务器
-> docker compose pull
-> docker compose up -d
-> 健康检查
```

## 推荐目录与文件

仓库侧建议新增：

```text
Dockerfile
.dockerignore
compose.yml
.github/workflows/ci.yml
.github/workflows/deploy.yml
scripts/docker-deploy.sh
docs/superpowers/specs/2026-04-02-docker-compose-deployment-design.md
```

服务器侧建议保留：

```text
/root/apps/ai-chat/
  compose.yml
  .env.production
  scripts/
    docker-deploy.sh
```

## Dockerfile 设计

### 推荐方向

推荐使用多阶段构建：

1. `deps`
   - 安装依赖
2. `builder`
   - 执行 `next build`
3. `runner`
   - 只保留运行需要的内容

### 推荐输出模式

推荐在 Next 配置中启用：

```ts
output: "standalone"
```

原因：

- 它更适合 Docker 部署
- 镜像更小
- 运行层不需要完整源码和完整 `node_modules`

### 镜像中应包含

- `.next/standalone`
- `.next/static`
- `public`
- 运行时所需的最小依赖

### 镜像中不应包含

- `.git`
- 本地开发缓存
- 测试文件
- 无关文档

## docker compose 设计

### 第一版服务划分

第一版 compose 只需要一个应用服务：

```text
services:
  ai-chat:
```

原因：

- 数据库当前仍然使用 Neon
- Nginx 已经在服务器上独立存在
- 第一版先让应用本身容器化，不急着把所有组件都塞进 compose

### 应用容器职责

- 暴露 3000 端口
- 读取服务器本地 `.env.production`
- 运行 `node server.js` 或 standalone 产物入口

### Nginx 职责

- 继续在宿主机运行
- 反向代理到 Docker 容器暴露的 3000 端口

这样迁移风险最小，因为：

- 域名和入口不用大改
- 宿主机上的 Nginx 仍然是稳定入口

## 环境变量策略

### 核心原则

Docker 化后仍然推荐：

- GitHub 不保存真实业务密钥
- 线上真实环境变量继续保存在服务器本地

### 具体策略

- CI 构建镜像时：
  - 只使用最小占位 env
  - 目标是让 build 成功

- 服务器运行容器时：
  - 通过 `env_file` 或环境变量注入真实 `.env.production`
  - 目标是保证运行时连接真实数据库和模型服务

### 为什么这样做

因为当前项目的关键 env 主要偏运行时：

- `DATABASE_URL`
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_BASE_URL`
- `SILICONFLOW_MODEL`

只要不把真实业务逻辑提前到 build 阶段，这种分层方式是合理的。

## CI 设计

### 职责

Docker 化后的 CI 推荐变成：

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `docker build`
5. 将镜像推送到 GHCR

### 镜像 tag 建议

建议至少保留两类 tag：

- `latest`
- `git sha`

例如：

```text
ghcr.io/<owner>/ai-chat:latest
ghcr.io/<owner>/ai-chat:<commit-sha>
```

这样做的好处：

- 最新部署可直接使用 `latest`
- 出问题时也能根据 sha 回看对应镜像

## Deploy 设计

### 触发规则

仍然保持：

- `push main`
- CI 成功后
- 再触发 Deploy

### 当前推荐流程

```text
Deploy workflow
-> SSH 登录服务器
-> 登录 GHCR
-> docker compose pull
-> docker compose up -d
-> 健康检查
```

### 为什么继续保留 SSH 入口

原因很简单：

1. 你当前已经熟悉 SSH 到服务器部署。
2. 这能复用现有机器与权限体系。
3. 对当前单机部署来说足够简单直接。
4. 比“一次性切换到更复杂平台”更稳。

## 服务器脚本设计

推荐新增：

```text
scripts/docker-deploy.sh
```

它的职责建议非常收敛，只做：

1. 进入项目目录
2. `git pull`
3. `docker compose pull`
4. `docker compose up -d`
5. 按需执行数据库迁移
6. 健康检查

### 关于数据库迁移

这里有两个候选方向：

#### 方向 A：在宿主机执行 `prisma migrate deploy`

优点：

- 延续当前思路
- 上手更直接

缺点：

- 宿主机仍要保留 Node/Prisma CLI

#### 方向 B：在容器内执行 migration

优点：

- 更符合 Docker 化目标
- 宿主机依赖更少

缺点：

- 第一版需要多处理一次执行时机

### 推荐结论

第一版建议先接受过渡形态：

- 应用运行走容器
- migration 可先保留在宿主机或临时容器中执行

等主链路稳定后，再把 migration 也彻底容器化。

## 与当前方案的关系

这份 Docker 方案不是否定当前实现，而是下一阶段升级方向。

当前版本的价值仍然在于：

- 已经打通自动化链路
- 已经把 CI 与 Deploy 分离
- 已经把日志、SSH、脚本入口这些基础问题暴露并解决了一轮

Docker 化是在这个基础上继续往前走，而不是推倒重来。

## 第一版实施建议

建议按下面顺序推进：

### 第一步：先补 Docker 基础文件

- `Dockerfile`
- `.dockerignore`
- `compose.yml`

### 第二步：先在本地跑通 compose

- 本地 `docker build`
- 本地 `docker compose up`
- 验证访问、env、数据库连接

### 第三步：再改 GitHub Actions

- CI build 并 push GHCR
- Deploy SSH 到服务器执行 `docker compose pull/up -d`

### 第四步：最后迁移线上

- 服务器安装 Docker / Compose
- 保留现有 Nginx
- 首次切换到容器运行

## 风险与注意点

### 1. 环境变量分层仍要保持清晰

即使 Docker 化，也不代表 env 问题自动消失。

要继续坚持：

- CI 用占位值
- 线上容器用服务器真实 env

### 2. 不要一上来把所有东西都容器化

第一版只容器化应用本身最稳。

### 3. 镜像仓库权限要提前理顺

如果使用 GHCR，需要先确认：

- 仓库权限
- GitHub Actions 推送权限
- 服务器拉取权限

### 4. 迁移步骤不要混太多变量

Docker 化已经是一次较大的部署形态升级，不建议同时再改：

- 域名入口
- 数据库拓扑
- Nginx 主结构

## 最终结论

对当前 AI Chat 项目，下一阶段最合适的 Docker 化方向是：

- 使用 `Dockerfile` 构建 Next.js 应用镜像
- 使用 `docker compose` 在服务器运行容器
- GitHub Actions 继续作为触发入口
- CI 负责构建镜像并推送到 GHCR
- Deploy 通过 SSH 登录服务器执行 `docker compose pull && docker compose up -d`
- 继续保留服务器本地真实 `.env.production`

这条路比继续深挖脚本式部署更值得投入，因为它能真正统一：

- 构建环境
- 运行环境
- 发布单元

也更符合项目后续长期演进方向。
