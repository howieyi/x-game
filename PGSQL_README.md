`createdb` 是 PostgreSQL 自带的一个命令行工具，用来**创建数据库**。

在你这个项目里：

```bash
createdb xgame
```

等价于执行 SQL：

```sql
CREATE DATABASE xgame;
```

它会创建一个名为 `xgame` 的数据库，后面你的 `.env` 中：

```dotenv
DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/xgame
```

这里最后的 `xgame` 就必须对应这个数据库名称。

---

### 它什么时候需要执行？

只有在**第一次初始化本地 PostgreSQL** 时需要。

例如：

1. 安装 PostgreSQL
2. 启动 PostgreSQL
3. 创建数据库

```bash
createdb xgame
```

4. 导入表结构

```bash
pnpm db:push
# 或
pnpm db:migrate
```

之后就不用再执行 `createdb` 了。

---

### 如果提示找不到 `createdb`

例如：

```text
zsh: command not found: createdb
```

说明 PostgreSQL 客户端没有安装，或者没有加入 PATH。

可以先检查：

```bash
which createdb
```

或者：

```bash
createdb --version
```

---

### macOS（Homebrew）

如果你用的是 Homebrew，可以安装：

```bash
brew install postgresql@17
```

启动：

```bash
brew services start postgresql@17
```

然后创建数据库：

```bash
createdb xgame
```

---

### 如果数据库已经存在

执行：

```bash
createdb xgame
```

可能会看到：

```text
createdb: error: database "xgame" already exists
```

这不是错误，只说明数据库已经创建好了，可以直接执行：

```bash
pnpm db:push
```

---

### 更推荐先确认你的环境

由于你前面遇到的是 `.env` 报错，我建议先确认 PostgreSQL 是否已经安装并运行，而不是直接执行 `createdb`。

依次执行下面几个命令，把输出发给我：

```bash
which psql
psql --version

which createdb
createdb --version

brew services list | grep postgres
```

这样我可以判断：

- PostgreSQL 是否已经安装
- `createdb` 是否可用
- 数据库服务是否已经启动
- 下一步应该执行 `createdb`、`createdb -U postgres xgame`，还是根本不需要创建数据库。