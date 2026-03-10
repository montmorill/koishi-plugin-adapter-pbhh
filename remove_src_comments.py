"""remove_src_comments.py

用途：移除 ./src 目录下的源码注释（默认处理 .ts/.js/.tsx/.jsx/.vue/.css/.scss/.sass/.less/.jsonc/.md）。

特点/限制：
- 基于轻量状态机：能正确避开字符串/模板字符串/正则字面量的大多数常见情况，但不是完整解析器。
- 会移除：
  - // 单行注释
  - /* ... */ 块注释（含 JSDoc）
  - JSONC 里的 // 与 /* */
- 会尽量保留换行，避免行号大幅漂移。

用法：
  python remove_src_comments.py            # 直接原地覆盖
  python remove_src_comments.py --dry-run  # 只输出将修改的文件列表
  python remove_src_comments.py --backup   # 写入 .bak 备份文件

注意：建议先提交 git 或开启 --backup。
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path


DEFAULT_EXTS = {
    ".ts",
    ".js",
    ".tsx",
    ".jsx",
    ".vue",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".jsonc",
    ".md",
}


def strip_comments(text: str) -> str:
    OUT = []
    i = 0
    n = len(text)

    # 状态
    in_squote = False
    in_dquote = False
    in_tmpl = False
    in_block = False
    in_line = False
    in_regex = False

    escape = False

    def peek(k: int = 0) -> str:
        j = i + k
        return text[j] if 0 <= j < n else ""

    def is_regex_start(prev_non_ws: str) -> bool:
        # 非严格：遇到这些前导符号，通常后面 /.../ 是正则而不是除法
        return prev_non_ws in "(=:[,!?&|^~<>+*-{\n"

    prev_non_ws = "\n"

    while i < n:
        ch = text[i]
        nxt = peek(1)

        if in_line:
            # 行注释：直到换行
            if ch == "\n":
                in_line = False
                OUT.append(ch)
            i += 1
            continue

        if in_block:
            # 块注释：保留换行
            if ch == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            if ch == "\n":
                OUT.append("\n")
            i += 1
            continue

        if in_squote or in_dquote or in_tmpl:
            OUT.append(ch)
            if escape:
                escape = False
            else:
                if ch == "\\":
                    escape = True
                elif in_squote and ch == "'":
                    in_squote = False
                elif in_dquote and ch == '"':
                    in_dquote = False
                elif in_tmpl and ch == "`":
                    in_tmpl = False
            i += 1
            continue

        if in_regex:
            OUT.append(ch)
            if escape:
                escape = False
            else:
                if ch == "\\":
                    escape = True
                elif ch == "/":
                    in_regex = False
            i += 1
            continue

        # 进入注释？
        if ch == "/" and nxt == "/":
            in_line = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            in_block = True
            i += 2
            continue

        # 进入字符串？
        if ch == "'":
            in_squote = True
            OUT.append(ch)
            i += 1
            continue
        if ch == '"':
            in_dquote = True
            OUT.append(ch)
            i += 1
            continue
        if ch == "`":
            in_tmpl = True
            OUT.append(ch)
            i += 1
            continue

        # 进入正则？（非常粗略）
        if ch == "/":
            if is_regex_start(prev_non_ws):
                in_regex = True
            OUT.append(ch)
            i += 1
            continue

        OUT.append(ch)

        if not ch.isspace():
            prev_non_ws = ch

        i += 1

    return "".join(OUT)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="src", help="目标目录（相对当前工作目录）")
    ap.add_argument("--dry-run", action="store_true", help="只列出会修改的文件，不写入")
    ap.add_argument("--backup", action="store_true", help="写入同名 .bak 备份")
    ap.add_argument(
        "--ext",
        action="append",
        default=None,
        help="额外处理的扩展名，例如：--ext .yaml （可多次指定）",
    )
    args = ap.parse_args()

    root = Path(args.root)
    if not root.exists() or not root.is_dir():
        print(f"目录不存在：{root}")
        return 2

    exts = set(DEFAULT_EXTS)
    if args.ext:
        exts.update(args.ext)

    changed = 0
    scanned = 0

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in exts:
            continue

        try:
            old = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # 跳过非 utf-8
            continue

        scanned += 1
        new = strip_comments(old)
        if new == old:
            continue

        changed += 1
        print(f"modify: {path.as_posix()}")

        if args.dry_run:
            continue

        if args.backup:
            bak = path.with_suffix(path.suffix + ".bak")
            bak.write_text(old, encoding="utf-8")

        path.write_text(new, encoding="utf-8")

    print(f"done. scanned={scanned} changed={changed} dry_run={args.dry_run} backup={args.backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
