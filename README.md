[中文](README_zh_CN.md)

# siyuan-plugin-2md

<img src="./icon.png" width="160" height="160" alt="icon">

Batch convert the documents of Siyuan Notes into Markdown files, and support Mkdocs, Hexo, Hugo, Vitepress, Vuepress, Obsidian and other platforms

## Core Features

- **One-key operation**: Support one-key batch conversion
- **Property Conversion**: Support property conversion to FrontFormatter
- **Select Notes**: Support custom selection of notebooks, default select first one
- **Document Mode**: Supports using the currently opened document as the root document to export it along with its sub-documents.
- **Preset Support**: Allows saving multiple preset configurations to facilitate personalized export requirements for various platforms.
- **Output Configuration**: Support custom output directory (the output directory of the corresponding platform can be set separately, and the default output is to the user `[siyuan-note Workspace]/temp/siyuan2md/[platform name]` directory)

## Obsidian Vault export (local version 1.3.0)

Select **Obsidian Vault** and export into a Vault root directory. Parent documents
become `Topic/Topic.md`, with children alongside that folder note. Document mode
includes the selected root without its ancestors. Local `assets/` files of any
extension are copied with path-hash names and linked using Obsidian wikilinks.
Reference-style attachments use note-relative Markdown destinations. Filename
sanitization and collision handling apply to the planned document paths.

Missing files, unresolved links, renamed titles and block links downgraded to
their containing notes are recorded in `.siyuan-export-report.json`. Remote
links stay online; block-level anchors, query embeds, widgets and HTML attachment
conversion are not implemented. Old README exports and `.obsidian` settings are
not removed or modified. Attachment copying does not add native preview support
for unsupported file formats.

Run `pnpm exec tsc --noEmit`, `pnpm test:export` and `pnpm build` to verify.
Build output is in `dist/`; the installed plugin is not overwritten automatically.

## FAQ

* Q1: What is the origin of this plugin?

  A1: For those who are lazy and don't want to publish individual documents one by one, you can use this tool to export in batches.

## Changelog

**v1.0.0 major update**

- first version

For more update records, please check [CHANGELOG](https://github.com/terwer/siyuan-plugin-2md/blob/main/CHANGELOG.md)

## Donate

If you approve of this project, invite me to have a cup of coffee, which will encourage me to keep updating and create
more useful tools~

### Wechat

<div>
<img src="https://static-rs-terwer.oss-cn-beijing.aliyuncs.com/donate/wechat.jpg" alt="wechat" style="width:280px;height:375px;" />
</div>

### Alipay

<div>
<img src="https://static-rs-terwer.oss-cn-beijing.aliyuncs.com/donate/alipay.jpg" alt="alipay" style="width:280px;height:375px;" />
</div>

## Thanks

Thanks to [frostime](https://github.com/siyuan-note/plugin-sample-vite-svelte) for the project template
