# 参与贡献

感谢你愿意改进原子代办。

## 开始之前

1. 搜索现有 Issue，确认问题或建议尚未被提出。
2. 对较大的功能改动，建议先创建 Issue 说明使用场景和设计方案。
3. Fork 项目并从 `main` 分支创建功能分支。

## 开发流程

```powershell
pnpm install
pnpm start
pnpm check
```

提交 Pull Request 时，请说明改动目的、验证方法以及界面变化；涉及视觉调整时请附截图。

## 代码约定

- 保持代码清晰、依赖精简。
- 不要提交 `dist/`、`node_modules/` 或包含个人任务的数据。
- 新增 IPC 能力时继续保持 `contextIsolation: true`、`nodeIntegration: false` 和沙箱模式。
- Windows 通知、窗口尺寸和多显示器行为发生变化时，请进行实际桌面环境验证。
