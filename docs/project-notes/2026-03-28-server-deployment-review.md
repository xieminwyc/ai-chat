# AI Chat 项目部署学习复盘

## 这份文档是干什么的

这份文档不是泛泛的 Linux 或部署教程，而是专门复盘这次 **把这个 Next.js + Prisma + PostgreSQL 项目真实部署到服务器** 的全过程。

目标只有一个：

**以后你再回看这份文档时，能快速想起来这次到底学了什么、做了什么、为什么这么做。**

---

## 1. 这次我到底完成了什么

这次不是只学了一些概念，而是已经真实打通了下面这条链路：

```text
本地开发
-> GitHub
-> 阿里云服务器
-> 远程 PostgreSQL（Neon）
-> Prisma migration
-> Next.js 生产启动
-> PM2 托管
-> Nginx 反向代理
-> 公网访问
```

这意味着：

- 代码已经可以推到 GitHub
- 服务器已经可以拉代码部署
- 数据库已经不再依赖本机 `localhost`
- 应用已经能在服务器上跑起来
- 访问入口已经不是临时的 `:3000`，而是通过 `nginx` 走 `80` 端口

---

## 2. 这次学到的核心概念

### 2.1 `dev`、`build`、`start`

你已经搞明白：

- `npm run dev`
  - 开发模式
  - 适合本地写代码时使用
- `npm run build`
  - 生成生产构建产物
  - 上线前必须跑
- `npm run start`
  - 启动已经构建好的生产服务
  - 更接近线上真实运行方式

最简单的记忆：

```text
dev = 开发
build = 打包生产版本
start = 运行生产版本
```

---

### 2.2 `localhost` 在不同机器上不是一个东西

这是这次非常重要的一个点。

你已经理解：

- 在你自己电脑上：

```text
localhost = 你自己的 Mac
```

- 在服务器上：

```text
localhost = 那台服务器自己
```

所以如果服务器上的 `DATABASE_URL` 写的是：

```env
DATABASE_URL="postgresql://...@localhost:5432/..."
```

那它连的是 **服务器自己的数据库**，不是你本地电脑上的数据库。

---

### 2.3 为什么应用和数据库最好分开

这次你也真正碰到了：

- 应用可以放在阿里云服务器
- 数据库更适合放在独立远程服务里

你最后用的是：

- 应用：阿里云广州服务器
- 数据库：Neon 远程 PostgreSQL

这更接近公司里的常见思路：

```text
应用服务器 -> 远程数据库
```

而不是：

```text
应用服务器 + 数据库全塞在一台机器上
```

---

### 2.4 `pm2` 和 `nginx` 分别负责什么

你现在已经知道它们不是一个东西。

#### `pm2`

负责：

- 让 `next start` 一直活着
- 你退出 SSH 后进程不退出
- 服务器重启后进程还能恢复

#### `nginx`

负责：

- 监听 `80` / `443`
- 接用户请求
- 把请求转发到 `3000` 端口上的 Next.js

最简单的记忆：

```text
pm2 管进程
nginx 管流量入口
```

---

### 2.5 为什么 `8.148.214.183:3000` 和 `8.148.214.183` 不一样

你已经理解端口的概念了。

- `http://8.148.214.183:3000`
  - 访问服务器的 `3000` 端口
  - 等于直接访问 Next.js 服务

- `http://8.148.214.183`
  - 默认访问 `80` 端口
  - 现在是 `nginx` 在接收

然后再由 `nginx` 转发到：

```text
127.0.0.1:3000
```

---

## 3. 这次项目的实际部署结构

这次项目最终结构可以记成这样：

```text
浏览器
-> http://8.148.214.183
-> nginx (80)
-> Next.js (3000)
-> Neon PostgreSQL
```

项目目录在服务器上是：

```text
/root/apps/ai-chat
```

当前服务托管方式：

- Node 服务：`pm2`
- Web 入口：`nginx`
- 数据库：Neon

---

## 4. 这次最重要的命令

## 4.1 本地开发相关

### 启动开发环境

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

### 启动生产服务

```bash
npm run start
```

### 执行 migration 到远程数据库

```bash
npx prisma migrate deploy
```

---

## 4.2 Git / GitHub 相关

### 查看状态

```bash
git status
```

### 添加改动

```bash
git add .
```

### 提交

```bash
git commit -m "你的提交说明"
```

### 推送

```bash
git push
```

### 第一次关联远程仓库

```bash
git remote add origin git@github.com:xieminwyc/ai-chat.git
git push -u origin main
```

### 测试 GitHub SSH

```bash
ssh -T git@github.com
```

---

## 4.3 SSH / 服务器登录相关

### 登录服务器

```bash
ssh root@8.148.214.183
```

### 退出 SSH

```bash
exit
```

或者：

```text
Ctrl + D
```

### 停止当前前台命令

```text
Ctrl + C
```

---

## 4.4 Linux 常用命令

### 看当前用户

```bash
whoami
```

### 看当前目录

```bash
pwd
```

### 看文件

```bash
ls
ls -la
```

### 查看文件内容

```bash
cat 文件名
```

### 编辑文件

```bash
nano 文件名
```

### 保存并退出 `nano`

```text
Ctrl + O
Enter
Ctrl + X
```

---

## 4.5 环境变量相关

### 编辑服务器上的 `.env.local`

```bash
cd /root/apps/ai-chat
nano .env.local
```

这次核心环境变量包括：

```env
DATABASE_URL="你的 Neon 连接串"
SILICONFLOW_API_KEY=你的 key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Qwen/Qwen2.5-7B-Instruct
```

---

## 4.6 数据库 / Prisma 相关

### 运行线上 migration

```bash
npx prisma migrate deploy
```

### 单独生成 Prisma Client

```bash
npx prisma generate
```

### 为什么后来不常手动跑这个

因为项目里现在已经有：

```json
"postinstall": "prisma generate"
```

所以执行：

```bash
npm install
```

后会自动生成 Prisma Client。

---

## 4.7 服务器部署相关

### 进入项目目录

```bash
cd /root/apps/ai-chat
```

### 安装依赖

```bash
npm install
```

### 构建

```bash
npm run build
```

### 启动

```bash
npm run start
```

---

## 4.8 PM2 相关

### 查看服务状态

```bash
pm2 status
```

### 查看日志

```bash
pm2 logs ai-chat
```

### 重启服务

```bash
pm2 restart ai-chat
```

### 停止服务

```bash
pm2 stop ai-chat
```

### 删除服务

```bash
pm2 delete ai-chat
```

### 保存当前 PM2 进程列表

```bash
pm2 save
```

---

## 4.9 Nginx 相关

### 检查配置语法

```bash
nginx -t
```

### 重载配置

```bash
systemctl reload nginx
```

### 查看 nginx 状态

```bash
systemctl status nginx
```

### 查看当前站点配置

```bash
cat /etc/nginx/sites-available/ai-chat
```

### 编辑站点配置

```bash
nano /etc/nginx/sites-available/ai-chat
```

---

## 5. 这次碰到过的重要坑

## 5.1 `localhost` 误判

一开始最大的问题之一就是把：

```text
localhost
```

想成了“我的电脑”。

实际上在服务器里它表示：

```text
服务器自己
```

---

## 5.2 Prisma Client 没生成导致构建报错

你碰到的报错本质上不是 Prisma 代码写错，而是：

```text
@prisma/client 装了
但生成产物没出来
```

所以后来加上了：

```json
"postinstall": "prisma generate"
```

---

## 5.3 浏览器里 `crypto.randomUUID` 报错

本地访问 `localhost` 时没问题，但公网 IP 访问时出了：

```text
crypto.randomUUID is not a function
```

这让你理解了：

- 本地 `localhost` 和公网 IP 在浏览器里环境并不完全一样
- 前端代码有时要做浏览器兼容兜底

---

## 5.4 为什么直接访问 `:3000` 不够正规

虽然能跑，但这不是更标准的上线方式。

更标准的是：

```text
用户 -> 80/443 -> nginx -> 3000
```

所以后面我们才加了 `nginx`。

---

## 5.5 为什么只跑 `npm run start` 还不够

因为如果只是直接在 SSH 里运行：

```bash
npm run start
```

那么：

- 断开 SSH
- 关闭会话
- 进程可能就没了

所以后面要交给：

```text
pm2
```

来托管。

---

## 6. 以后更新线上代码的标准流程

以后你本地改完代码并推到 GitHub 后，服务器上最常用的更新流程就是：

```bash
ssh root@8.148.214.183
cd /root/apps/ai-chat
git pull
npm install
npm run build
pm2 restart ai-chat
```

这是你后面最应该熟练掌握的一套命令。

---

## 7. 以后排错时先查哪里

## 7.1 应用日志

```bash
pm2 logs ai-chat
```

如果页面打不开、接口 500、运行异常，先看这里。

---

## 7.2 Nginx 状态和配置

```bash
systemctl status nginx
nginx -t
```

如果你改了代理配置后访问异常，先看这里。

---

## 7.3 端口监听

```bash
lsof -i :3000
```

看 Next.js 服务到底有没有在监听。

---

## 7.4 数据库链路

如果接口报和 Prisma / PostgreSQL 相关的错误，先看：

- `.env.local` 里的 `DATABASE_URL`
- `pm2 logs ai-chat`
- 重新执行一次：

```bash
npx prisma migrate deploy
```

---

## 8. 第一阶段学完后，我到底算到了什么程度

如果把这一阶段命名成：

**“把一个全栈项目真实部署到服务器并跑起来”**

那你已经完成得很好了。

你现在已经不只是：

- 听懂 Linux
- 听懂 SSH
- 听懂 Nginx

而是已经真的做过：

- SSH 登录服务器
- GitHub 推送
- 服务器拉代码
- 配远程数据库
- 运行 migration
- 生产构建
- 用 PM2 托管
- 用 Nginx 转发

这和单纯看教程是两回事。

---

## 9. 我下一阶段最该学什么

这不是这次部署必须做，但它是自然的下一步。

### 1. 学会更新线上项目

把下面这套命令练熟：

```bash
git pull
npm install
npm run build
pm2 restart ai-chat
```

### 2. 学会看日志排错

重点熟悉：

```bash
pm2 logs ai-chat
nginx -t
systemctl status nginx
```

### 3. 以后再加域名和 HTTPS

等你对当前 IP 部署彻底熟了，再做：

- 域名解析
- HTTPS
- 备案相关问题

### 4. 最后再学 CI/CD

也就是从：

```text
手动部署
```

升级成：

```text
自动部署
```

---

## 10. 一句话复盘

这次你真正学到的，不是几个零散命令，而是：

**如何把一个本地开发的 Next.js + Prisma 项目，接上远程 PostgreSQL，部署到 Linux 服务器，用 PM2 挂住进程，再用 Nginx 对外提供访问。**
