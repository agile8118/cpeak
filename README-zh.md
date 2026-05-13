# Cpeak

[![npm version](https://badge.fury.io/js/cpeak.svg)](https://www.npmjs.com/package/cpeak)

Cpeak 是一个受 Express.js 启发的极简、快速的 Node.js 框架。

这个项目旨在不断改进，直到可以用于复杂的生产应用，目标是比 Express.js 更高性能、更极简。这个框架主要面向处理 JSON 和基于文件的消息体的 HTTP 应用。

这是一个教育项目，作为 [Understanding Node.js: Core Concepts](https://www.udemy.com/course/understanding-nodejs-core-concepts/?referralCode=0BC21AC4DD6958AE6A95) 课程的一部分启动。如果你想学习如何构建这样的框架，并达到能够自己构建这些东西的程度，请查看这个课程！

## 为什么选择 Cpeak？

- **极简主义**：没有不必要的臃肿，零依赖。只有构建快速可靠应用所需的核心要素。
- **高性能**：精心设计以追求速度，**Cpeak** 不会为了过度的可定制性而牺牲速度。
- **教育性**：项目中的每个新变化都会在这个 [YouTube 播放列表](https://www.youtube.com/playlist?list=PLCiGw8i6NhvqsA-ZZcChJ0kaHZ3hcIVdY) 中详细解释。关注这个项目，看看构建一个行业领先产品需要什么！
- **兼容 Express.js**：你可以轻松地从 Cpeak 重构到 Express.js，反之亦然。许多适用于 Express.js 的 npm 包也适用于 Cpeak。

## 目录

- [快速开始](#快速开始)
  - [Hello World 应用](#hello-world-应用)
- [文档](#文档)
  - [引入](#引入)
  - [初始化](#初始化)
  - [中间件](#中间件)
  - [路由处理](#路由处理)
  - [路由中间件](#路由中间件)
  - [URL 变量与参数](#url-变量与参数)
  - [发送文件](#发送文件)
  - [重定向](#重定向)
  - [压缩](#压缩)

## 快速开始

```bash
npm install cpeak
```

### Hello World 应用

```javascript
const cpeak = require('cpeak');
const app = new cpeak();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3000, () => {
  console.log('服务器运行在 http://localhost:3000');
});
```

## 文档

### 引入

```javascript
const cpeak = require('cpeak');
```

### 初始化

```javascript
const app = new cpeak();
```

### 中间件

```javascript
// 全局中间件
app.use((req, res, next) => {
  console.log('请求时间:', Date.now());
  next();
});

// 路由特定中间件
app.get('/protected', authMiddleware, (req, res) => {
  res.send('受保护的路由');
});
```

### 路由处理

```javascript
// GET 请求
app.get('/users', (req, res) => {
  res.json({ users: [] });
});

// POST 请求
app.post('/users', (req, res) => {
  res.status(201).json({ message: '用户已创建' });
});

// PUT 请求
app.put('/users/:id', (req, res) => {
  res.json({ message: '用户已更新' });
});

// DELETE 请求
app.delete('/users/:id', (req, res) => {
  res.json({ message: '用户已删除' });
});
```

### 路由中间件

```javascript
app.get('/admin', adminAuth, (req, res) => {
  res.send('管理面板');
});
```

### URL 变量与参数

```javascript
// URL 变量
app.get('/users/:id', (req, res) => {
  const userId = req.params.id;
  res.json({ userId });
});

// 查询参数
app.get('/search', (req, res) => {
  const query = req.query.q;
  res.json({ query });
});
```

### 发送文件

```javascript
app.get('/file', (req, res) => {
  res.sendFile('/path/to/file.html');
});
```

### 重定向

```javascript
app.get('/old-page', (req, res) => {
  res.redirect('/new-page');
});
```

### 压缩

```javascript
// 启用 gzip 压缩
app.use(compression());
```

## 完整示例

```javascript
const cpeak = require('cpeak');
const app = new cpeak();

// 中间件
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// 路由
app.get('/', (req, res) => {
  res.send('欢迎使用 Cpeak!');
});

app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: '张三' },
    { id: 2, name: '李四' }
  ]);
});

app.post('/api/users', (req, res) => {
  res.status(201).json({ message: '用户创建成功' });
});

// 启动服务器
app.listen(3000, () => {
  console.log('服务器运行在 http://localhost:3000');
});
```

## 版本说明

这是一个正在积极开发的项目。API 可能会随着项目的成熟而发生变化。请关注更新和变更日志。

## 许可证

MIT

---

> 项目地址：[Cododev-Technology/cpeak](https://github.com/Cododev-Technology/cpeak)
> npm 包：[cpeak](https://www.npmjs.com/package/cpeak)
