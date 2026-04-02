# AI Chat 部署命令速查卡

## 这份文档适合什么时候看

这份是短版速查卡。

如果你想看完整复盘，看：

- [2026-03-28-server-deployment-review.md](/Users/xiemin/monter/AI%20Chat/docs/project-notes/2026-03-28-server-deployment-review.md)

如果你只是想临时确认“下一条命令该敲什么”，看这份就够了。

---

## 1. 本地开发

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

---

## 2. Git 常用

### 查看状态

```bash
git status
```

### 添加并提交

```bash
git add .
git commit -m "你的提交说明"
```

### 推送到 GitHub

```bash
git push
```

### 首次关联远程仓库

```bash
git remote add origin git@github.com:xieminwyc/ai-chat.git
git push -u origin main
```

### 测试 GitHub SSH

```bash
ssh -T git@github.com
```

---

## 3. SSH 登录服务器

### 登录

```bash
ssh root@8.148.214.183
```

### 退出

```bash
exit
```

### 中断当前命令

```text
Ctrl + C
```

---

## 4. 服务器常用目录

### 进入项目目录

```bash
cd /root/apps/ai-chat
```

### 看当前目录

```bash
pwd
ls -la
```

---

## 5. 环境变量

### 编辑 `.env.local`

```bash
nano .env.local
```

### 保存退出 `nano`

```text
Ctrl + O
Enter
Ctrl + X
```

### 检查内容

```bash
cat .env.local
```

---

## 6. Prisma / 数据库

### 执行线上 migration

```bash
npx prisma migrate deploy
```

### 单独生成 Prisma Client

```bash
npx prisma generate
```

### 为什么现在通常不用手动跑 `prisma generate`

因为项目里已经有：

```json
"postinstall": "prisma generate"
```

所以：

```bash
npm install
```

后会自动执行。

---

## 7. 服务器部署标准流程

### 第一次部署后，平时更新代码最常用的流程

```bash
ssh root@8.148.214.183
cd /root/apps/ai-chat
git pull
npm install
npx prisma migrate deploy
npm run build
pm2 restart ai-chat
```

---

## 8. PM2 常用

### 看状态

```bash
pm2 status
```

### 看日志

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

---

## 9. Nginx 常用

### 检查配置

```bash
nginx -t
```

### 重载配置

```bash
systemctl reload nginx
```

### 看状态

```bash
systemctl status nginx
```

### 查看当前站点配置

```bash
cat /etc/nginx/sites-available/ai-chat
```

---

## 10. 排错时先查这几个

### 应用日志

```bash
pm2 logs ai-chat
```

### Nginx 状态

```bash
nginx -t
systemctl status nginx
```

### 3000 端口是否在监听

```bash
ss -ltnp | grep :3000
```

### 服务本机能不能访问

```bash
curl http://127.0.0.1:3000
```

说明：

- 在 Linux 服务器上，`ss -ltnp` 通常比 `lsof -i :3000` 更稳定
- 这次项目里就出现过 `lsof` 看起来为空，但 `ss` 能正确查到 `next-server` 正在监听 `3000`

---

## 11. 一句话记忆

### 开发时

```text
本地：npm run dev
```

### 部署时

```text
服务器：git pull -> npm install -> prisma migrate deploy -> npm run build -> pm2 restart
```

### 访问时

```text
用户访问 80 端口
nginx 转发到 3000
pm2 托管 Next.js
数据库是远程 Neon
```
