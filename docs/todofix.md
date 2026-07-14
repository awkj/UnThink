# Unthink 后续激进改造清单

本文记录本轮架构升级后仍值得继续推进的工作。默认允许破坏旧数据和旧接口，不要求提供兼容迁移。

状态说明：

- `[x]` 已完成并通过验证。
- `[-]` 已完成基础能力，仍有明确的后续工作。
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
- [-] 已实现增量 update log、串行写入和按数量 compact；当前仍使用随机文件和目录枚举。
- [ ] 为二进制存储增加明确的 manifest，区分 snapshot、update log 和格式版本。
- [ ] 将随机文件扫描改为有序 WAL，避免依赖目录枚举顺序。
- [ ] compact 使用临时文件加原子替换，确保崩溃时至少保留上一份完整 snapshot。
- [ ] 为 compact、写入中断、损坏文件和并发写入增加故障注入测试。
- [ ] 评估把 Web Logger 从 IndexedDB 改为 OPFS；日志允许直接丢弃，不做迁移。
- [ ] 评估把普通配置从 localStorage 改为结构化 OPFS 文件；不引入 Keychain/Keystore。

完成标准：存储格式有版本说明，断电或写入失败不会同时破坏 snapshot 和 WAL。

## P1：服务端同步

- [x] 服务端升级到 Go 1.26。
- [x] 引入嵌入式、按版本执行的 SQL migrations。
- [x] snapshot 写入使用严格 revision CAS。
- [-] 多实例 SSE 已通过 revision polling 感知其他实例写入；仍待切换到数据库通知。
- [ ] 用 PostgreSQL `LISTEN/NOTIFY` 替代当前多实例 SSE 的定时 revision polling。
- [ ] 为 snapshot CAS、并发 append、跨实例通知和断线重连增加集成测试。
- [ ] 为 migration 增加校验和，禁止已发布 migration 被静默修改。
- [ ] 增加数据库备份、恢复和破坏性 schema 重建命令。
- [ ] 明确清理 change log 的安全水位，结合客户端 acknowledgement 自动回收历史更新。

完成标准：多实例之间不依赖轮询即可实时通知，历史清理不会让离线客户端失去恢复路径。

## P2：React 和 Web

- [x] 接入 React Compiler，并适配装饰器语法和 Vite 8/Rolldown 构建链。
- [x] 增加 PWA manifest、Service Worker 和离线 app shell。
- [x] Web 路由根据路径和设备能力选择桌面或移动布局，Tauri 使用 HashRouter。
- [-] 事件订阅已从强制刷新 Hook 改为 `useSyncExternalStore`；业务状态仍主要使用 broad events。
- [-] 已增加手工 vendor chunks；仍有约 794 KB 的入口 chunk 超过预算。
- [ ] 继续拆分超过阈值的主 chunk，重点处理约 794 KB 的入口 chunk。
- [ ] 将 broad `onStateChange` 继续拆成 selector-based external stores，减少无关组件渲染。
- [ ] 为 OPFS、Service Worker 离线启动、路由刷新和 PWA 更新流程增加浏览器测试。
- [ ] 清理 React Compiler 暂时放宽的 hooks lint 规则，逐项恢复 immutability、purity、refs 和 set-state-in-effect。
- [ ] 评估使用 Worker 承载 Loro import/export、compact 和大型查询，避免阻塞 UI 线程。

完成标准：生产构建无大 chunk 警告，关键交互不因 compact 或大量同步更新掉帧。

## P2：原生平台

- [x] Rust 工程升级到 edition 2024，并设置最低 Rust 1.85。
- [x] macOS 增加原生菜单栏 Today/Inbox 导航。
- [x] Android 使用 NDK 28.2、AGP 8.13.2、JVM 17，并完成 arm64 APK 验证。
- [-] Android back 已接入 Tauri `onBackButtonPress`；Tauri 上游内部仍保留弃用的 `onBackPressed` 调用。
- [ ] macOS 增加 App Intents、Spotlight 索引和 Widget Extension；需要独立 Xcode extension targets。
- [ ] Android 在 Tauri 上游完善 predictive back 后，删除当前旧 `onBackPressed` 路径产生的弃用警告。
- [ ] 增加 macOS 菜单栏导航和 Android back gesture 的端到端测试。

说明：Kotlin 2.3 不在本清单范围内，除非以后 Tauri 官方 Gradle 插件完成 DSL 升级。

## P2：测试和工程化

- [x] 增加基础 GitHub CI，覆盖 TS7、Lint、前端测试、Web 构建、Go 测试和 macOS Cargo check。
- [x] 增加首批前端单元测试。
- [x] 本地验证 Web 生产构建、Go 1.26 tests、macOS Cargo check 和 Android arm64 debug APK。
- [-] 当前测试基础设施可用，但业务核心和存储故障路径覆盖仍不足。
- [ ] 为 core state、recurring rules、drag/drop 和 batch edit 补充高价值单元测试。
- [ ] 为 OPFS 和 Tauri 文件存储建立同一套 contract tests。
- [ ] CI 增加 Android arm64 debug 构建；避免依赖发布签名信息。
- [ ] CI 增加 bundle size budget、migration 校验和测试及最小覆盖率要求。
- [ ] 增加性能基准：冷启动、10 万任务加载、1 万条增量同步和 compact 耗时。

完成标准：架构关键路径都具有回归测试和可量化的性能预算。
