# OPC 仪表盘

个人公司操作系统：官网 + 账号登录 + 仪表盘。

## 快速开始

1. 安装 [Node.js](https://nodejs.org)
2. 双击 **`start.bat`**
3. 浏览器打开 **http://localhost:8080**（官网）
4. 右上角 **注册 / 登录**
5. 登录后自动进入 **仪表盘**（`/app`）

## 页面结构

| 路径 | 说明 |
|------|------|
| `/` | 官网：介绍产品、注册登录 |
| `/app` | 仪表盘：总览、四大部门、记录管理 |

## 账号与数据

- 用户名 3–20 字符（中文、字母、数字、下划线）
- 密码至少 6 位
- 每个账号的数据保存在 `data/users/{用户ID}/dashboard.json`
- 侧边栏可 **导出 / 导入** JSON 备份

## 开发

```bash
cd dashboard
node server.js
```

## 文件

```
dashboard/
├── start.bat          # 一键启动
├── server.js          # 服务 + 注册登录 + 数据 API
├── index.html         # 官网
├── app.html           # 仪表盘
├── css/
├── js/
└── data/
    ├── users.json
    └── users/{id}/dashboard.json
```

## 迁移旧数据

若之前用过单机版 `data/opc_dashboard_data.json`，**第一个注册的账号**会自动继承这份数据。
