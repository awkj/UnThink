# Tooling 工具说明

这个目录保存项目开发、构建和 CI 使用的辅助工具。它们不属于应用运行时代码，不会被打进最终产品；除 Vite 插件外，脚本都可以通过 `package.json` 中的命令执行。

项目使用 Node.js 24，简单的 TypeScript 工具可以直接通过 `node` 运行，不需要先编译。

## 命令行工具

### `generate-env.ts`

根据仓库根目录的 `.env.example` 生成 `.env`，为认证、PostgreSQL 和 RustFS 创建安全随机凭据。

```bash
pnpm env:generate
pnpm env:generate --stdout # 只输出，不写文件
pnpm env:generate --force  # 覆盖已有 .env 并轮换全部凭据
```

默认不会覆盖已有 `.env`，生成的文件权限为 `0600`。

### `check-bundle-size.ts`

检查 `dist/assets` 中所有 JavaScript chunk，任何单个文件超过 350 KiB 都会失败。Vite 自带的大小限制只产生警告，这个脚本会返回非零退出码，因此可以作为 CI 门禁。

```bash
pnpm check:bundle
```

该命令会先执行 Web 构建，再检查产物；GitHub Actions 也会执行它。

### `validate-native-integrations.ts`

检查 Android 和 Apple 原生集成所依赖的关键配置与代码是否仍然存在，包括：

- Android 预测式返回手势
- Tauri Deep Link 与原生导航
- Apple App Intents
- Spotlight 索引
- Widget 扩展

```bash
pnpm check:native
```

这是一项轻量的契约检查，不代替 Android、macOS 或 iOS 的实际编译。GitHub Actions 会执行它，并另外编译对应的原生目标。

### `performance-benchmark.ts`

对任务模型执行大数据量基准测试，默认创建并加载 100,000 个任务，再应用 10,000 个增量更新。超过脚本内的性能预算时命令失败。

```bash
pnpm bench
BENCH_TASKS=10000 BENCH_UPDATES=1000 pnpm bench
```

该工具目前用于手动检查性能，没有在 CI 中运行，以避免共享 CI 机器性能波动造成误报。

## Vite 构建插件

### `vite-plugin-detect-unused-files/`

Web 构建完成后，将 `src/` 下的 TypeScript 文件与实际模块图比较。如果发现没有被入口引用的运行时代码，构建会失败。测试、类型声明、Worker、CLI 和平台专用入口按 `vite.config.ts` 中的规则排除。

该检查默认启用；临时排查构建问题时可以设置 `CHECK_UNUSED=false` 关闭。

### `vite-plugin-common-files/`

分别分析桌面端和移动端入口的本地依赖图，阻止两个平台意外共享不允许共享的实现文件。允许共享的核心、服务、UI、插件和本地化目录由 `vite.config.ts` 排除规则声明。

该插件在 Vite 构建时自动运行，用于维护桌面端与移动端的代码边界。

## 维护约定

- 新增工具时，同时在 `package.json` 添加清晰的命令，并更新本文档。
- 可由 Node.js 24 直接运行的脚本优先使用 `.ts`。
- 只在 CI 使用的检查也应保留本地命令，方便提交前复现。
- 删除工具时，同时清理 `package.json`、`vite.config.ts`、类型声明和不再使用的依赖。
