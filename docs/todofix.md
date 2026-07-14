# Unthink 后续激进改造清单

本文记录本轮架构升级后仍值得继续推进的工作。默认允许破坏旧数据和旧接口，不要求提供兼容迁移。

状态说明：

- `[x]` 已完成并通过验证。
- `[-]` 已完成基础能力，仍有明确的后续工作（当前无此状态）。
- `[ ]` 尚未完成。

## 当前基线

- TypeScript 7 是唯一类型检查编译器。
- Web 任务数据只使用 OPFS。
- Tauri 任务数据使用原始二进制 Loro 文件。
- 新存储布局为 `unthink-v2/db-*/*.loro`，不读取旧 IndexedDB、Base64 文件或旧目录。
- Kotlin 保持 2.2.21，不继续升级到 2.3。
- TS6 包只作为 ESLint 和 Vite 插件所需的 JavaScript Compiler API，不参与类型检查。
- 服务端 SQL migrations 保留，作为数据库结构的正式版本管理机制。

## P0：类型和数据模型

- [x] 使用 TypeScript 7 作为唯一类型检查编译器，删除 TS6 兼容编译流程。
- [x] 保留 TS6 JavaScript Compiler API，仅供 ESLint 和 Vite AST 插件解析源码。
- [x] 主工程已启用 `strict`、`noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`。
- [x] 全局启用 `noUncheckedIndexedAccess`，覆盖 core model、拖拽计算、批量编辑和同步代码。
- [x] 修复数组索引、Map 查询和解析结果中的真实空值分支，未使用批量非空断言掩盖问题。
- [x] 重构可选字段模型，统一“字段缺失”“显式 `undefined`”和 `null` 的语义；重复规则使用 `null` 明确清除。
- [x] 全局启用 `exactOptionalPropertyTypes`。
- [x] 为新的严格类型基线增加 CI gate。

完成标准：主 `tsconfig` 直接启用两项检查，`pnpm check` 无错误，不存在单独的宽松配置。

## P1：存储和 CRDT

- [x] Web 任务数据切换为 OPFS，删除 IndexedDB 回退和旧数据迁移。
- [x] Tauri、Web 和 CLI 使用 `unthink-v2/db-*/*.loro` 新布局，不读取旧目录和 Base64 文件。
- [x] Loro snapshot/update 以原始二进制保存，移除 Base64 编解码开销。
- [x] 已实现增量 update log、串行写入和按数量 compact，不再使用随机文件或目录枚举。
- [x] 为二进制存储增加明确的 manifest，区分 snapshot、update log 和格式版本。
- [x] 将随机文件扫描改为单调序号 WAL，加载时严格按 sequence 重放。
- [x] compact 先写唯一 snapshot 再原子替换 manifest，并保留上一代 manifest 和完整数据。
- [x] 为 compact、写入中断、损坏文件和并发写入增加故障注入 contract tests。
- [x] Web Logger 已从 IndexedDB 改为 OPFS 每标签页每日 NDJSON；旧日志直接丢弃，不做迁移。
- [x] 已评估普通配置：继续使用 localStorage；OPFS 不提升凭据安全性且会增加跨 WebView 文件协调，不引入 Keychain/Keystore。

完成标准：存储格式有版本说明，断电或写入失败不会同时破坏 snapshot 和 WAL。

## P1：服务端同步

- [x] 服务端升级到 Go 1.26。
- [x] 引入嵌入式、按版本执行的 SQL migrations。
- [x] snapshot 写入使用严格 revision CAS。
- [x] 多实例 SSE 使用数据库通知感知其他实例写入，不再轮询 revision。
- [x] 使用 PostgreSQL `LISTEN/NOTIFY`，专用 listener 断线后使用有界指数退避重连。
- [x] 为 snapshot CAS、并发 append、跨实例通知和 listener 断线重连增加集成测试。
- [x] migration 使用 SHA-256 校验和，已发布 migration 被修改时启动失败。
- [x] 增加 `backup`、`restore` 和破坏性 `rebuild` 数据库管理命令。
- [x] change log 以 snapshot revision 和已知客户端最小 acknowledgement 为安全水位自动回收。

完成标准：多实例之间不依赖轮询即可实时通知，历史清理不会让离线客户端失去恢复路径。

## P2：React 和 Web

- [x] 接入 React Compiler，并适配装饰器语法和 Vite 8/Rolldown 构建链。
- [x] 增加 PWA manifest、Service Worker 和离线 app shell。
- [x] Web 路由根据路径和设备能力选择桌面或移动布局，Tauri 使用 HashRouter。
- [x] 事件订阅已改为 `useSyncExternalStore`，并增加 selector-based store；实体详情和编辑叶子组件不再因无关模型变化刷新。
- [x] 桌面、移动端和设置页按路由懒加载，vendor 按职责拆分；最大 JavaScript chunk 约 278 KiB，受 350 KiB CI budget 约束。
- [x] 已拆分原约 794 KiB 的主入口 chunk，生产构建无大 chunk 警告。
- [x] broad `onStateChange` 的高频叶子订阅已迁移到 selector-based external stores。
- [x] 已为 OPFS manifest、Service Worker 离线启动、桌面/移动路由刷新和 PWA 更新流程增加 Playwright 浏览器测试。
- [x] React Compiler hooks lint 的 immutability、purity、refs 和 set-state-in-effect 已全局恢复为 error。
- [x] Loro import/compact snapshot 已接入 Worker 镜像、transferable 数据传递、超时和主线程降级，启动阶段不等待 Worker 首次 WASM 初始化。

完成标准：生产构建无大 chunk 警告，关键交互不因 compact 或大量同步更新掉帧。

## P2：原生平台

- [x] Rust 工程升级到 edition 2024，并设置最低 Rust 1.85。
- [x] macOS 增加原生菜单栏 Today/Inbox 导航。
- [x] Android 使用 NDK 28.2、AGP 8.13.2、JVM 17，并完成 arm64 APK 验证。
- [x] Android back 已接入 Tauri `onBackButtonPress` 和 AndroidX `OnBackPressedDispatcher`，Manifest 启用 predictive back。
- [x] macOS 已增加独立 XcodeGen App Intents、Spotlight 索引和 Widget Extension targets，并在 macOS CI 编译两个 scheme。
- [x] Android 构建通过 Gradle 生成后补丁删除 Wry 旧 `onBackPressed` 调用，arm64 debug 构建不再产生该弃用警告。
- [x] macOS 菜单路由、App Intent/Widget deep link 和 Android back 的原生桥接契约均有自动化测试；浏览器端覆盖对应导航落点。

说明：Kotlin 2.3 不在本清单范围内，除非以后 Tauri 官方 Gradle 插件完成 DSL 升级。

## P2：测试和工程化

- [x] 增加基础 GitHub CI，覆盖 TS7、Lint、前端测试、Web 构建、Go 测试和 macOS Cargo check。
- [x] 增加首批前端单元测试。
- [x] 本地验证 Web 生产构建、Go 1.26 tests、macOS Cargo check 和 Android arm64 debug APK。
- [x] 测试基础设施覆盖业务核心、存储故障路径、浏览器平台流程和原生导航契约。
- [x] core state、recurring rules、drag/drop 和 batch edit 已补充高价值单元测试。
- [x] OPFS 和 Tauri 文件存储共用 `ManifestStorage` contract；浏览器测试验证真实 OPFS，临时原子文件适配器验证 Tauri 文件语义。
- [x] CI 已增加 Android arm64 debug 构建，不依赖发布签名信息。
- [x] CI 已增加 350 KiB bundle budget、migration SHA-256 校验测试和最低覆盖率门槛。
- [x] 已增加冷启动、10 万任务加载/compact 和 1 万条增量同步性能基准及书面预算。

完成标准：架构关键路径都具有回归测试和可量化的性能预算。
