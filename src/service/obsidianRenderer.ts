import { SiyuanDevice } from "zhi-device"
import { HtmlUtil } from "zhi-common"
import BaseMarkdownRenderer from "./baseMarkdownRenderer"
import ExportMode from "../models/ExportMode"
import { rewriteMarkdownLinks, sanitizeFileName, transformMarkdownText } from "../utils/exportPath"

/**
 * 将思源文档导出为 Obsidian Vault。
 * 先规划所有文档的最终路径，再写入正文和重写链接，确保文件名清洗、
 * 同名消歧及父文档的「文件夹/同名.md」结构不会导致内部链接失效。
 */
export default class ObsidianRenderer extends BaseMarkdownRenderer {
  /** 思源文档 ID -> Vault 内相对路径；统一使用 /，不依赖宿主系统的分隔符。 */
  private paths = new Map<string, string>()
  private documents = new Map<string, any>()
  /** 块 ID -> 所属文档 ID，避免同一块引用反复查询内核。 */
  private blocks = new Map<string, string>()
  /** 以资源的实际源文件路径去重，避免同一个附件被多篇笔记重复复制。 */
  private assets = new Map<string, string>()
  private currentDoc: any
  private assetFolder = "assets"
  private report = {
    missingAssets: [] as any[],
    unresolvedLinks: [] as any[],
    blockLinks: [] as any[],
    renamed: [] as any[],
    exportedDocuments: 0,
  }

  private safeTitle(title: string): string {
    return sanitizeFileName(this.opts.fixTitle ? HtmlUtil.removeTitleNumber(title ?? "") : title, true)
  }

  protected async getAllFileList(path: string): Promise<any> {
    const result = await super.getAllFileList(path)
    if (this.opts.exportMode !== ExportMode.DOCUMENT) return result
    // 基类只枚举子文档；文档模式还需加入所选根文档（即使它没有子文档）。
    // sourcePath 保留原始位置供附件查找使用，path 则去除导出范围外的祖先目录。
    const response = await this.kernelApi.getDoc(this.opts.homePageId)
    if (response.code !== 0) throw new Error(response.msg)
    const root = response.data as any
    const info = await this.kernelApi.getDocInfo(this.opts.homePageId)
    if (info.code !== 0) throw new Error(info.msg)
    const prefix = root.path.slice(0, root.path.lastIndexOf("/") + 1)
    const rootDoc = {
      ...root,
      id: this.opts.homePageId,
      name: (info.data as any).name,
      subFileCount: result.ret.length > 0 ? 1 : 0,
    }
    result.ret.unshift(rootDoc)
    result.nameMap[rootDoc.id] = rootDoc.name.replace(/\.sy$/, "")
    result.ret = result.ret.map((doc: any) => ({
      ...doc,
      box: doc.box || root.box,
      sourcePath: doc.path,
      path: "/" + doc.path.slice(prefix.length),
    }))
    return result
  }

  /**
   * 为整个导出范围建立稳定路径映射。
   * 按层级和 ID 排序，先确定父目录名；同目录下按 Windows 大小写不敏感规则
   * 检查冲突，并为重名追加文档 ID，避免静默覆盖另一个文档。
   */
  private planPaths(files: any[], names: Record<string, string>) {
    const children = new Set<string>()
    for (const doc of files) {
      const ids = doc.path.replace(/\.sy$/, "").split("/").filter(Boolean)
      ids.slice(0, -1).forEach((id: string) => children.add(id))
      this.documents.set(doc.id, doc)
    }
    const segments = new Map<string, string>()
    const used = new Map<string, Set<string>>()
    // 预留附件目录和导出报告名，避免文档目录占用这些位置。
    used.set("", new Set([this.assetFolder.split("/")[0].toLowerCase(), ".siyuan-export-report.json"]))
    const ordered = [...files].sort(
      (a, b) => a.path.split("/").length - b.path.split("/").length || a.id.localeCompare(b.id)
    )
    for (const doc of ordered) {
      const ids = doc.path.replace(/\.sy$/, "").split("/").filter(Boolean)
      const id = ids[ids.length - 1]
      const parentIds = ids.slice(0, -1)
      const parent = parentIds.join("/")
      const taken = used.get(parent) ?? new Set<string>()
      const original = names[id] ?? doc.name?.replace(/\.sy$/, "") ?? id
      const base = this.safeTitle(original)
      const folderNote = children.has(id) || doc.subFileCount > 0
      let title = base
      let suffix = 0
      const conflicts = (value: string) =>
        taken.has(`${value}.md`.toLowerCase()) || (folderNote && taken.has(value.toLowerCase()))
      while (conflicts(title)) title = `${base}--${id}${suffix++ ? `-${suffix}` : ""}`
      taken.add(`${title}.md`.toLowerCase())
      if (folderNote) taken.add(title.toLowerCase())
      used.set(parent, taken)
      segments.set(id, title)
      const parts = parentIds.map((key: string) => segments.get(key) ?? this.safeTitle(names[key] ?? key))
      if (folderNote) {
        parts.push(title)
        // 父文档自己的同名笔记也占据一个文件名；同名子文档必须消歧。
        used.set(ids.join("/"), new Set([`${title}.md`.toLowerCase()]))
      }
      parts.push(`${title}.md`)
      this.paths.set(id, parts.join("/"))
      if (title !== original) this.report.renamed.push({ id, original, exported: title })
    }
  }

  protected async renderMd(): Promise<number> {
    const fs = SiyuanDevice.requireLib("fs").promises
    const path = SiyuanDevice.requireLib("path")
    this.paths.clear()
    this.documents.clear()
    this.blocks.clear()
    this.assets.clear()
    this.report = { missingAssets: [], unresolvedLinks: [], blockLinks: [], renamed: [], exportedDocuments: 0 }
    const folder = (this.opts.assetFolder || "assets").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
    if (
      folder
        .split("/")
        .some((part: string) => !part || part === "." || part === ".." || sanitizeFileName(part, true) !== part)
    ) {
      throw new Error("资源目录必须是 Vault 内的相对目录，例如 assets 或 attachments/images")
    }
    this.assetFolder = folder
    const result = await this.getAllFileList("")
    this.planPaths(result.ret, result.nameMap)
    await fs.mkdir(this.opts.outputFolder, { recursive: true })
    try {
      for (const doc of result.ret) {
        this.currentDoc = doc
        const content = await this.renderSingleDoc(doc.id)
        const target = path.join(this.opts.outputFolder, this.paths.get(doc.id))
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, content, "utf8")
        this.report.exportedDocuments++
      }
      // 笔记本首页只生成指向已有笔记的链接，避免复制正文产生重复笔记。
      if (
        this.opts.exportMode !== ExportMode.DOCUMENT &&
        this.opts.generateHomePage !== false &&
        this.opts.homePageId
      ) {
        const home = this.paths.get(this.opts.homePageId)
        if (home && ![...this.paths.values()].some((p) => p.toLowerCase() === "index.md")) {
          await fs.writeFile(
            path.join(this.opts.outputFolder, "index.md"),
            `[[${home.replace(/\.md$/, "")}]]\n`,
            "utf8"
          )
        }
      }
    } finally {
      // 正文写入中途失败时也保存已完成数量和资源/链接问题，便于排查。
      await fs.writeFile(
        path.join(this.opts.outputFolder, ".siyuan-export-report.json"),
        JSON.stringify(this.report, null, 2),
        "utf8"
      )
    }
    return this.report.exportedDocuments
  }

  /**
   * 解析本地 assets 链接，并依次查找文档、笔记本、全局资源作用域。
   * 不按扩展名筛选：复制附件与 Obsidian 是否原生预览该类型是两件事。
   * 无法找到的文件保留原链接并记录报告，不终止其他文档的导出。
   */
  private async copyAsset(url: string): Promise<string | undefined> {
    const path = SiyuanDevice.requireLib("path")
    const fs = SiyuanDevice.requireLib("fs").promises
    const raw = url.replace(/\\([() ])/g, "$1").replace(/^<|>$/g, "")
    if (!/^\/?assets\//.test(raw)) return undefined
    const match = raw.match(/^([^?#]*)([?#].*)?$/)
    try {
      const source = decodeURIComponent(match[1]).replace(/^\//, "")
      if (source.split("/").some((part) => part === ".." || part === "." || part.includes("\\")))
        throw new Error("资源路径越界")
      const data = path.resolve(SiyuanDevice.siyuanDataPath())
      const box = this.currentDoc?.box || this.opts.notebook
      const candidates: string[] = []
      if (box) {
        const docDir = path.dirname(this.currentDoc?.sourcePath || this.currentDoc?.path || "/").replace(/^[/\\]+/, "")
        candidates.push(path.resolve(data, box, docDir, source), path.resolve(data, box, source))
      }
      candidates.push(path.resolve(data, source))
      let absolute: string
      for (const candidate of candidates) {
        // 限制读取范围，防止附件链接中的路径片段逃逸出思源 data 目录。
        if (!candidate.startsWith(data + path.sep)) continue
        try {
          if ((await fs.stat(candidate)).isFile()) {
            absolute = candidate
            break
          }
        } catch {
          /* Try the next SiYuan asset scope. */
        }
      }
      if (!absolute) throw new Error(`本地资源不存在：${source}`)
      let exported = this.assets.get(absolute)
      if (!exported) {
        const parsed = path.parse(absolute)
        // 使用相对于 data 的源路径哈希，兼顾跨机器稳定命名和同名附件消歧。
        const hash = SiyuanDevice.requireLib("crypto")
          .createHash("sha256")
          .update(path.relative(data, absolute).replace(/\\/g, "/"))
          .digest("hex")
          .slice(0, 16)
        const extension = parsed.ext ? "." + sanitizeFileName(parsed.ext.slice(1), true) : ""
        const filename = `${sanitizeFileName(parsed.name, true)}--${hash}${extension}`
        exported = `${this.assetFolder}/${filename}`
        await fs.mkdir(path.join(this.opts.outputFolder, this.assetFolder), { recursive: true })
        await fs.copyFile(absolute, path.join(this.opts.outputFolder, exported))
        this.assets.set(absolute, exported)
      }
      return exported + (match[2]?.startsWith("#") ? match[2] : "")
    } catch (error) {
      this.report.missingAssets.push({ document: this.currentDoc?.id, source: url, error: String(error) })
      this.logger.warn(`资源未导出：${url}`, error)
      return undefined
    }
  }

  protected async processAssets(md: string): Promise<string> {
    return transformMarkdownText(md, async (text) => {
      text = await rewriteMarkdownLinks(text, async (url, label, embed) => {
        const target = await this.copyAsset(url)
        if (!target) return undefined
        return `${embed ? "!" : ""}[[${target}${label ? `|${label.replace(/[\[\]|\r\n]/g, " ")}` : ""}]]`
      })
      // 引用式附件保留 Markdown 语法；目标相对于当前笔记计算，支持嵌套目录。
      const refs = /^([ \t]{0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]+>|\S+)/gm
      let output = "",
        last = 0,
        match: RegExpExecArray | null
      while ((match = refs.exec(text))) {
        const target = await this.copyAsset(match[2])
        if (!target) continue
        const path = SiyuanDevice.requireLib("path").posix
        const relative = path
          .relative(path.dirname(this.paths.get(this.currentDoc.id)), target)
          .split("/")
          .map(encodeURIComponent)
          .join("/")
        output += text.slice(last, match.index) + match[1] + relative
        last = refs.lastIndex
      }
      return output + text.slice(last)
    })
  }

  protected async processLinks(md: string): Promise<string> {
    return transformMarkdownText(md, (text) =>
      rewriteMarkdownLinks(text, async (url, label, embed) => {
        const match = url.match(/^siyuan:\/\/blocks\/(\d{14}-[a-z0-9]+)(?:\?.*)?$/i)
        if (!match) return undefined
        if (this.opts.linkAsPlainText) return label
        const id = match[1]
        let root = id
        if (!this.paths.has(root)) {
          root = this.blocks.get(id)
          if (root === undefined) {
            try {
              const response = await this.kernelApi.sql(`SELECT root_id FROM blocks WHERE id = '${id}' LIMIT 1`)
              root = response.code === 0 ? (response.data as any[])?.[0]?.root_id || "" : ""
            } catch (error) {
              root = ""
              this.logger.warn(`无法解析块引用：${id}`, error)
            }
            this.blocks.set(id, root)
          }
        }
        const target = this.paths.get(root)
        if (!target) {
          this.report.unresolvedLinks.push({ document: this.currentDoc?.id, target: id })
          return undefined
        }
        // 内核导出的 Markdown 不保留思源块 ID；降级跳转到所属文档并记录报告，
        // 避免生成没有对应锚点的 Obsidian 块链接。
        if (root !== id) this.report.blockLinks.push({ document: this.currentDoc?.id, block: id, target })
        const title = this.opts.fixTitle ? HtmlUtil.removeTitleNumber(label) : label
        return `${embed ? "!" : ""}[[${target.replace(/\.md$/, "")}${
          title ? `|${title.replace(/[\[\]|\r\n]/g, " ")}` : ""
        }]]`
      })
    )
  }
}
