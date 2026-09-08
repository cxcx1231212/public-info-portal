# 123六合网这是一个与“一路发平特”完全独立的 Cloudflare Worker + D1 项目。## 首次部署1. 安装依赖：`pnpm install`2. 创建独立数据库：`npx wrangler d1 create 123-liuhe-db`3. 把返回的 `database_id` 填入 `wrangler.jsonc`4. 初始化数据库：`npx wrangler d1 execute DB --remote --file=./schema.sql`5. 设置后台密码：`npx wrangler secret put ADMIN_PASSWORD`6. 设置随机会话密钥：`npx wrangler secret put ADMIN_SESSION_SECRET`7. 发布：`pnpm run deploy`后台入口：`/admin.html`## 本地开发1. `pnpm install`2. `pnpm run db:local`3. 建立 `.dev.vars`，填写 `ADMIN_PASSWORD` 与 `ADMIN_SESSION_SECRET`4. `pnpm run dev`不要把 `.dev.vars`、后台密码或会话密钥提交到代码仓库。

当前生产环境通过 Cloudflare Workers Builds 从 main 分支自动部署。
