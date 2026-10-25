[English](README.md)

# Markdown批量转换

<img src="./icon.png" width="160" height="160" alt="icon">

将思源笔记的文档批量转换为Markdown文件，支持Mkdocs、Hexo、Hugo、Vitepress、Vuepress、Obsidian等平台对应的FrontFormatter

## 核心特色

- **一键操作**：支持一键批量转换
- **属性转换**：支持属性转换为FrontFormatter
- **选择笔记**：支持自定义选择笔记本，默认选择第一个笔记本
- **文档模式**：支持把当前打开的文档作为根文档，导出该文档以及它下面的子文档
- **预设支持**：支持保存多个预设配置，方便各种平台个性化导出需求
- **输出配置**：支持自定义输出目录（可单独设置对应平台的输出目录，默认输出到用户 `[思源笔记工作空间]/temp/siyuan2md/[平台名称]` 目录）

## Obsidian Vault 导出（本地优化版 1.3.0）

导出平台选择 **Obsidian Vault**，输出目录选择一个 Vault 根目录（建议先导出到空目录检查）。
父文档输出为 `项目/项目.md`，子文档输出为 `项目/子文档.md`；有子文档的下级文档继续使用同名文件夹笔记。
文档模式包含所选根文档，且不包含它上方的祖先目录。

- 文档链接根据思源文档 ID 与实际输出路径转换为 Obsidian 双链。
- 本地 `assets/` 附件不限扩展名，自动查找文档、笔记本与全局资源目录，复制到 Vault 的资源目录。
- 图片等嵌入使用 `![[assets/文件]]`，普通附件使用 `[[assets/文件|名称]]`；引用式 Markdown 附件使用相对于当前笔记的路径。
- 附件名带源路径哈希，避免不同资源目录中同名文件覆盖；这不会将 Office 等格式转换为 Obsidian 原生预览格式。
- Windows 非法字符、Obsidian 链接特殊字符和保留名称会处理；标题清洗后重名或大小写冲突时追加文档 ID。
- 资源目录必须位于 Vault 内；原有 `/assets` 配置会解释为 Vault 内的 `assets`。
- 缺失附件、范围外文档链接和块引用降级情况记录在 `.siyuan-export-report.json`。缺失附件保留原链接，不中断导出。
- 块引用目前跳转到所在文档，不保留块级精确定位；网络链接保留在线地址。思源查询嵌入、挂件及 HTML 附件未做专用转换。
- 不自动删除旧导出的 `README.md`，也不创建 `.obsidian` 配置。父文件夹笔记是普通 Markdown 文件，不会自动赋予文件夹点击行为。

开发验证：`pnpm install --frozen-lockfile`、`pnpm exec tsc --noEmit`、`pnpm test:export`、`pnpm build`。
构建产物位于 `dist/`，不会自动覆盖已安装的插件目录。

## FAQ

* Q1：做这个插件的缘起是什么？

  A1：对于比较懒，又不想单个文档一个个发布操作的，可用这个工具批量导出。

## 更新历史

**v1.0.0 主要更新**

- 第一个版本

更多更新记录请查看 [CHANGELOG](https://github.com/terwer/siyuan-plugin-2md/blob/main/CHANGELOG.md)

## 捐赠

如果您认可这个项目，请我喝一杯咖啡吧，这将鼓励我持续更新，并创作出更多好用的工具~

### 微信

<div>
<img src="https://static-rs-terwer.oss-cn-beijing.aliyuncs.com/donate/wechat.jpg" alt="wechat" style="width:280px;height:375px;" />
</div>

### 支付宝

<div>
<img src="https://static-rs-terwer.oss-cn-beijing.aliyuncs.com/donate/alipay.jpg" alt="alipay" style="width:280px;height:375px;" />
</div>

## 感谢

感谢 [frostime](https://github.com/siyuan-note/plugin-sample-vite-svelte) 提供的项目模板
