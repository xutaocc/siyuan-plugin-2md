/** 清洗单个文件/目录名；不能用于绝对输出路径，否则盘符和分隔符会被破坏。 */
export function sanitizeFileName(value: string, obsidian = false): string {
  let name = String(value ?? "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
  if (obsidian) name = name.replace(/[\[\]#^|]/g, "_")
  name = name.replace(/[. ]+$/g, "") || "untitled"
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i.test(name)) name = `_${name}`
  return name
}

/** 跳过代码围栏和行内代码，避免把示例链接误识别为需要复制的附件。 */
export async function transformMarkdownText(
  text: string,
  transform: (text: string) => Promise<string>
): Promise<string> {
  const parts = text.split(/(^ {0,3}(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}(?:`{3,}|~{3,})[^\n]*(?:\n|$)|`+[^`\n]*`+)/gm)
  for (let i = 0; i < parts.length; i += 2) parts[i] = await transform(parts[i])
  return parts.join("")
}

/** 识别行内链接中的配对括号、尖括号和可选标题；回调返回 undefined 时保留原文。 */
export async function rewriteMarkdownLinks(
  text: string,
  rewrite: (url: string, label: string, embed: boolean) => Promise<string | undefined>
): Promise<string> {
  let output = ""
  let last = 0
  const start = /(!?)\[((?:\\.|[^\]\\])*)\]\(/g
  let match: RegExpExecArray | null
  while ((match = start.exec(text))) {
    let cursor = start.lastIndex
    while (/\s/.test(text[cursor] ?? "") && cursor < text.length) cursor++
    const angle = text[cursor] === "<"
    if (angle) cursor++
    const begin = cursor
    let depth = 0
    for (; cursor < text.length; cursor++) {
      const ch = text[cursor]
      if (ch === "\\") {
        cursor++
        continue
      }
      if (angle ? ch === ">" : (ch === ")" && depth === 0) || (/\s/.test(ch) && depth === 0)) break
      if (!angle && ch === "(") depth++
      if (!angle && ch === ")") depth--
    }
    const url = text.slice(begin, cursor)
    if (angle && text[cursor++] !== ">") continue
    const tail = text.slice(cursor).match(/^\s*(?:"[^"\n]*"|'[^'\n]*'|\([^\n]*?\))?\s*\)/)
    if (!tail) continue
    const end = cursor + tail[0].length
    const replacement = await rewrite(url, match[2], match[1] === "!")
    if (replacement !== undefined) {
      output += text.slice(last, match.index) + replacement
      last = end
    }
    start.lastIndex = end
  }
  return output + text.slice(last)
}
