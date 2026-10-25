// Exercise the actual TypeScript renderers against a fake SiYuan API and real
// temporary files. No running SiYuan/Obsidian instance or workspace writes needed.
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const repo = path.resolve(__dirname, "..")
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "siyuan-export-test-"))
const data = path.join(temp, "data")
const output = path.join(temp, "vault")
const rootId = "20260101000000-root001"
const childId = "20260101000000-child01"
const blockId = "20260101000000-block01"
const docs = [
  { id: rootId, name: "项目.sy", path: `/${rootId}.sy`, subFileCount: 1 },
  { id: childId, name: "项目.sy", path: `/${rootId}/${childId}.sy`, subFileCount: 0 },
  { id: "20260101000000-dup0001", name: "时间:12.sy", path: "/20260101000000-dup0001.sy", subFileCount: 0 },
  { id: "20260101000000-dup0002", name: "时间?12.sy", path: "/20260101000000-dup0002.sy", subFileCount: 0 },
  { id: "20260101000000-case001", name: "CASE.sy", path: "/20260101000000-case001.sy", subFileCount: 0 },
  { id: "20260101000000-case002", name: "case.sy", path: "/20260101000000-case002.sy", subFileCount: 0 },
]
const api = {
  async exportMdContent(id) {
    return {
      code: 0,
      data: {
        content:
          id === rootId
            ? [
                `[子文档](siyuan://blocks/${childId})`,
                `[块引用](siyuan://blocks/${blockId})`,
                "![图](assets/image.svg)",
                "[JSON](assets/config.json)",
                "[数据](<assets/file (1).bin>)",
                "[笔记本资源](assets/local.txt)",
                "[引用][attachment]\n\n[attachment]: assets/config.json",
                "![缺失](assets/missing.png)",
                "`[代码](assets/config.json)`",
                "```md\n[代码块](assets/config.json)\n```",
                "[外部](https://example.com/test.pdf)",
              ].join("\n\n")
            : "正文",
      },
    }
  },
  async sql() {
    return { code: 0, data: [{ root_id: childId }] }
  },
  async getDoc(id) {
    return { code: 0, data: { ...docs.find((doc) => doc.id === id), box: "notebook" } }
  },
  async getDocInfo(id) {
    return { code: 0, data: docs.find((doc) => doc.id === id) }
  },
  async siyuanRequest(url, request) {
    return {
      code: 0,
      data: {
        files: docs.filter(
          (doc) => path.posix.dirname(doc.path) === request.path.replace(/\.sy$/, "").replace(/^$/, "/")
        ),
      },
    }
  },
}
const logger = { debug() {}, info() {}, warn() {}, error() {} }
const cache = new Map()
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports
  const mod = { exports: {} }
  cache.set(filename, mod)
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const localRequire = (id) => {
    if (id === "zhi-device")
      return {
        SiyuanDevice: {
          requireLib: require,
          siyuanDataPath: () => data,
          siyuanWorkspacePath: () => temp,
          joinPath: path.join,
        },
      }
    if (id === "zhi-common")
      return {
        HtmlUtil: { removeTitleNumber: (s) => s?.replace(/^\d+\.\s*/, "") || "" },
        StrUtil: { isEmptyString: (s) => typeof s !== "string" || !s.trim() },
      }
    if (id === "zhi-lib-base") return { simpleLogger: () => logger }
    if (id.endsWith("Constants")) return { isDev: false, defaultNotebook: "guide" }
    if (id.endsWith("kernel-api"))
      return {
        default: class {
          constructor() {
            return api
          }
        },
      }
    if (id.startsWith(".")) return load(path.resolve(path.dirname(filename), id + ".ts"))
    return require(id)
  }
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(localRequire, mod, mod.exports)
  return mod.exports
}
async function run() {
  const { sanitizeFileName } = load(path.join(repo, "src/utils/exportPath.ts"))
  assert.equal(sanitizeFileName("CON"), "_CON")
  assert.equal(sanitizeFileName("time:12/20. "), "time_12_20")
  for (const [filename, content] of [
    ["image.svg", "svg"],
    ["config.json", "{}"],
    ["file (1).bin", "binary"],
  ]) {
    fs.mkdirSync(path.join(data, "assets"), { recursive: true })
    fs.writeFileSync(path.join(data, "assets", filename), content)
  }
  fs.mkdirSync(path.join(data, "notebook/assets"), { recursive: true })
  fs.writeFileSync(path.join(data, "notebook/assets/local.txt"), "scoped")
  const Renderer = load(path.join(repo, "src/service/obsidianRenderer.ts")).default
  const renderer = new Renderer({})
  renderer.setOpts({
    outputFolder: output,
    notebook: "notebook",
    exportMode: "notebook",
    assetFolder: "/assets",
    fixTitle: false,
  })
  assert.equal(await renderer.doRender(), docs.length)
  assert(fs.existsSync(path.join(output, "项目/项目.md")))
  assert(!fs.existsSync(path.join(output, "项目/README.md")))
  const md = fs.readFileSync(path.join(output, "项目/项目.md"), "utf8")
  assert.match(md, /\[\[项目\/项目--20260101000000-child01\|子文档\]\]/)
  assert.match(md, /\[\[项目\/项目--20260101000000-child01\|块引用\]\]/)
  assert.match(md, /!\[\[assets\/image--[a-f0-9]+\.svg\|图\]\]/)
  assert.match(md, /\[\[assets\/file \(1\)--[a-f0-9]+\.bin\|数据\]\]/)
  assert.match(md, /\[attachment\]: \.\.\/assets\/config--[a-f0-9]+\.json/)
  assert(md.includes("`[代码](assets/config.json)`"))
  assert(md.includes("```md\n[代码块](assets/config.json)\n```"))
  assert(md.includes("[外部](https://example.com/test.pdf)"))
  assert.equal(fs.readdirSync(path.join(output, "assets")).length, 4)
  const report = JSON.parse(fs.readFileSync(path.join(output, ".siyuan-export-report.json")))
  assert.equal(report.missingAssets.length, 1)
  assert.equal(report.blockLinks.length, 1)
  const top = fs.readdirSync(output).filter((s) => s.endsWith(".md"))
  assert.equal(new Set(top.map((s) => s.toLowerCase())).size, 4)
  // Selected root documents must be exported even when they have no children.
  const single = new Renderer({})
  const singleOutput = path.join(temp, "single")
  single.setOpts({
    outputFolder: singleOutput,
    notebook: "notebook",
    exportMode: "document",
    homePageId: childId,
    assetFolder: "assets",
  })
  assert.equal(await single.doRender(), 1)
  assert.equal(fs.readFileSync(path.join(singleOutput, "项目.md"), "utf8"), "正文")
  assert(!fs.existsSync(path.join(singleOutput, "index.md")))
  const subtree = new Renderer({})
  const subtreeOutput = path.join(temp, "subtree")
  subtree.setOpts({
    outputFolder: subtreeOutput,
    notebook: "notebook",
    exportMode: "document",
    homePageId: rootId,
    assetFolder: "assets",
  })
  assert.equal(await subtree.doRender(), 2)
  assert(fs.existsSync(path.join(subtreeOutput, "项目/项目.md")))
  const invalid = new Renderer({})
  invalid.setOpts({ outputFolder: path.join(temp, "invalid"), exportMode: "notebook", assetFolder: "../outside" })
  await assert.rejects(() => invalid.doRender(), /资源目录必须是 Vault 内的相对目录/)
  const Service = load(path.join(repo, "src/service/exportService.ts")).default
  const serviceOutput = path.join(temp, "service")
  assert.equal(
    await new Service({ logger }).doExport({
      platform: "obsidian",
      outputFolder: serviceOutput,
      notebook: "notebook",
      exportMode: "notebook",
      assetFolder: "assets",
    }),
    docs.length
  )
  assert(fs.existsSync(path.join(serviceOutput, "项目/项目.md")))
  console.log(
    "PASS: folder notes, collisions, Windows names, all attachment types, scoped assets, links, code preservation, document roots and platform dispatch"
  )
}
run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    // Exact test-owned temporary directory, never a repository or user Vault.
    fs.rmSync(temp, { recursive: true, force: true })
  })
