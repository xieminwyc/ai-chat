# ============================================================
# 阶段一：deps — 只做一件事：安装 npm 依赖
# 单独做这一阶段的目的：把"装依赖"和"构建代码"分开，
# 这样下次代码变了但依赖没变，Docker 可以直接用缓存，不用重新 npm ci
# ============================================================
# 基于官方 Node 20 镜像（alpine = 体积极小的 Linux）
FROM node:20-alpine AS deps
# 在容器内创建并进入 /app 目录（相当于 mkdir + cd）
WORKDIR /app

# 只先复制依赖配置文件（不复制源码）
COPY package.json package-lock.json ./
# 复制 prisma schema（npm ci 的 postinstall 会执行 prisma generate）
COPY prisma ./prisma

# 按照 package-lock.json 精确安装依赖，同时自动触发 prisma generate
RUN npm ci

# ============================================================
# 阶段二：builder — 执行 Next.js 构建
# 从阶段一拿到 node_modules，加上源码，跑 next build
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

# 从阶段一把装好的依赖搬过来
COPY --from=deps /app/node_modules ./node_modules
# 把本地项目源码全部复制进去
COPY . .

# 构建时需要这些环境变量存在，但不会真正连接数据库或调用 AI
# 真实值在容器启动时通过 --env-file 注入，这里只是让 build 不报错
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV SILICONFLOW_API_KEY="placeholder"
ENV SILICONFLOW_BASE_URL="https://api.siliconflow.cn/v1"
ENV SILICONFLOW_MODEL="placeholder"
# 关掉 Next.js 向外发送的匿名使用统计
ENV NEXT_TELEMETRY_DISABLED=1

# 执行 next build，产出 .next/standalone 目录
RUN npm run build

# ============================================================
# 阶段三：runner — 最终运行镜像（只保留运行时必需的东西）
# 重新开一个干净的镜像！源码、devDependencies、测试文件全部丢掉
# 只从阶段二复制构建产物，这样最终镜像体积小、更安全
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

# 告诉 Node/Next.js 当前是生产环境
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建一个没有特权的普通系统用户来运行应用（安全最佳实践，不用 root）
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 从阶段二只复制运行需要的产物：1
# 静态文件（图片、favicon 等）
COPY --from=builder /app/public ./public
# standalone 产物（含最小 node_modules）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# CSS/JS 资源文件
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# standalone 的 file tracing 有时漏掉 Prisma 生成的客户端，手动补上
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# prisma schema + migration 文件（docker-deploy.sh 用临时容器跑 migrate 时需要）
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# 切换到普通用户（之后的命令和容器启动都以这个用户身份运行）
USER nextjs

# 声明容器监听 3000 端口（给 docker compose / Nginx 看的）
EXPOSE 3000
ENV PORT=3000
# 监听所有网卡，否则容器外无法访问
ENV HOSTNAME="0.0.0.0"

# 容器启动时执行的命令 —— standalone 模式下 next build 会生成 server.js
CMD ["node", "server.js"]
