import * as assert from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sinon from "sinon"
// @ts-expect-error - tinytar has no type definitions
import { untar } from "tinytar"
import * as vscode from "vscode"
import {
  type ArchiveEnvironment,
  createArchive,
} from "../../cloud/commands/deploy"

suite("cloud/archive", () => {
  let base: vscode.Uri
  let root: vscode.Uri

  setup(async () => {
    base = vscode.Uri.file(
      await mkdtemp(join(tmpdir(), "fastapi-vscode-archive-")),
    )
    root = vscode.Uri.joinPath(base, "parent/workspace")
    await vscode.workspace.fs.createDirectory(root)
    sinon.stub(vscode.workspace, "fs").value({ ...vscode.workspace.fs })
  })

  teardown(async () => {
    sinon.restore()
    await vscode.workspace.fs.delete(base, { recursive: true, useTrash: false })
  })

  async function prepare(entries: Record<string, string | null>) {
    for (const [path, content] of Object.entries(entries)) {
      const uri = vscode.Uri.joinPath(root, path)
      await vscode.workspace.fs.createDirectory(
        content === null ? uri : vscode.Uri.joinPath(uri, ".."),
      )
      if (content !== null) {
        await vscode.workspace.fs.writeFile(
          uri,
          new TextEncoder().encode(content),
        )
      }
    }
  }

  async function archiveEntries(
    uri = root,
    options: Partial<ArchiveEnvironment> = {},
  ) {
    const archive = await createArchive(uri, {
      home: base.with({ scheme: uri.scheme, authority: uri.authority }),
      cwd: uri,
      ...options,
    })
    return untar(archive) as Array<{ name: string; data: Uint8Array }>
  }

  async function archiveNames(
    uri = root,
    options: Partial<ArchiveEnvironment> = {},
  ): Promise<string[]> {
    return (await archiveEntries(uri, options)).map((file) => file.name).sort()
  }

  test("applies all three ignore files and preserves hardcoded exclusions", async () => {
    await prepare({
      ".git": null,
      ".gitignore": "git.txt\n",
      ".ignore": "ignore.txt\n",
      ".fastapicloudignore": "cloud.txt\n!.env\n!.venv/\n",
      "git.txt": "git",
      "ignore.txt": "ignore",
      "cloud.txt": "cloud",
      ".env": "secret",
      ".venv/ignored.py": "venv",
      ".config/settings.json": "{}",
      "main.py": "app",
    })
    assert.deepStrictEqual(await archiveNames(), [
      ".config/settings.json",
      ".ignore",
      "main.py",
    ])
  })

  test("does not apply gitignore outside a git repository", async () => {
    await prepare({
      ".gitignore": "*.txt\n",
      ".ignore": "ignore.txt\n",
      ".fastapicloudignore": "cloud.txt\n",
      "git.txt": "git",
      "ignore.txt": "ignore",
      "cloud.txt": "cloud",
    })
    assert.deepStrictEqual(await archiveNames(), [".ignore", "git.txt"])
  })

  test("inherits parent rules relative to their directory and honors git boundaries", async () => {
    await prepare({
      "../../.gitignore": "*.py\n",
      "../.git": "gitdir: /some/worktree\n",
      "../.gitignore": "/workspace/git.txt\n",
      "../.ignore": "/workspace/ignore.txt\n",
      "../.fastapicloudignore": "/workspace/cloud.txt\n",
      "git.txt": "git",
      "ignore.txt": "ignore",
      "cloud.txt": "cloud",
      "main.py": "app",
      "nested/git.txt": "keep",
    })
    assert.deepStrictEqual(await archiveNames(), ["main.py", "nested/git.txt"])
  })

  test("more nested rules override parent rules of the same type", async () => {
    await prepare({
      ".git": null,
      ".gitignore": "*.txt\n",
      "nested/.gitignore": "!keep.txt\n",
      "nested/keep.txt": "keep",
      "nested/drop.txt": "drop",
      "nested/main.py": "app",
    })
    assert.deepStrictEqual(await archiveNames(), [
      "nested/keep.txt",
      "nested/main.py",
    ])
  })

  test("ignore file type takes precedence over depth", async () => {
    await prepare({
      "../.fastapicloudignore": "!workspace/cloud.txt\n",
      ".git": null,
      ".gitignore": "*.txt\n",
      ".ignore": "!ignore.txt\ncloud.txt\n",
      "cloud.txt": "cloud",
      "ignore.txt": "ignore",
      "drop.txt": "drop",
    })
    assert.deepStrictEqual(await archiveNames(), [
      ".ignore",
      "cloud.txt",
      "ignore.txt",
    ])
  })

  test("cloud negation restores a gitignored directory and its contents", async () => {
    await prepare({
      ".git": null,
      ".gitignore": "ignore_me.txt\nbuild/\n",
      ".fastapicloudignore": "!static/build\n",
      "ignore_me.txt": "drop",
      "static/build/style.css": "body {}",
      "main.py": "app",
    })
    assert.deepStrictEqual(await archiveNames(), [
      "main.py",
      "static/build/style.css",
    ])
  })

  test("does not descend into an excluded directory for a file-only negation", async () => {
    await prepare({
      ".git": null,
      ".gitignore": "build/\n",
      ".fastapicloudignore": "!build/keep.txt\n",
      "build/keep.txt": "drop",
      "main.py": "app",
    })
    const readDirectory = sinon.spy(vscode.workspace.fs, "readDirectory")
    assert.deepStrictEqual(await archiveNames(), ["main.py"])
    assert.ok(
      readDirectory
        .getCalls()
        .every((call) => !call.args[0].path.endsWith("/build")),
    )
  })

  test("nested git repositories do not inherit outer gitignore rules", async () => {
    await prepare({
      ".git": null,
      ".gitignore": "*.txt\n",
      "nested/.git": null,
      "nested/keep.txt": "keep",
      "nested/.gitignore": "drop.txt\n",
      "nested/drop.txt": "drop",
    })
    assert.deepStrictEqual(await archiveNames(), ["nested/keep.txt"])
  })

  test("supports gitignore syntax and case-sensitive matching", async () => {
    await prepare({
      ".fastapicloudignore":
        "# comment\n/root.txt\n**/*.log\ncache/\n\\#literal\n*.tmp\n!keep.tmp\nUPPER.txt\n",
      "root.txt": "drop",
      "nested/root.txt": "keep",
      "nested/debug.log": "drop",
      "cache/data.txt": "drop",
      "#literal": "drop",
      "drop.tmp": "drop",
      "keep.tmp": "keep",
      "upper.txt": "keep",
    })
    assert.deepStrictEqual(await archiveNames(), [
      "keep.tmp",
      "nested/root.txt",
      "upper.txt",
    ])
  })

  test("supports remote URIs and decoded paths for ignore matching and archive names", async () => {
    await prepare({
      "space app/.fastapicloudignore": "drop file.txt\n",
      "space app/drop file.txt": "drop",
      "space app/keep file.txt": "keep",
    })
    const fs = { ...vscode.workspace.fs }
    const remoteRoot = root.with({ scheme: "archive-test", authority: "host" })
    const local = (uri: vscode.Uri) => {
      assert.strictEqual(uri.scheme, remoteRoot.scheme)
      assert.strictEqual(uri.authority, remoteRoot.authority)
      return uri.with({ scheme: "file", authority: "" })
    }
    Object.assign(vscode.workspace.fs, {
      stat: (uri: vscode.Uri) => fs.stat(local(uri)),
      readDirectory: (uri: vscode.Uri) => fs.readDirectory(local(uri)),
      readFile: (uri: vscode.Uri) => fs.readFile(local(uri)),
    })
    assert.deepStrictEqual(
      await archiveNames(vscode.Uri.joinPath(remoteRoot, "space app")),
      ["keep file.txt"],
    )
  })

  test("skips unreadable ignore files like the CLI walker", async () => {
    await prepare({ "main.py": "app" })
    const fs = vscode.workspace.fs
    const read = fs.readFile
    const readFile = sinon.stub(fs, "readFile").callsFake(read)
    readFile
      .withArgs(vscode.Uri.joinPath(root, ".fastapicloudignore"))
      .rejects(vscode.FileSystemError.NoPermissions())
    assert.deepStrictEqual(await archiveNames(), ["main.py"])
  })

  test("fails on unreadable source files like the CLI archive writer", async () => {
    await prepare({
      "main.py": "app",
      "unreadable.txt": "drop",
    })
    const fs = vscode.workspace.fs
    const read = fs.readFile
    const readFile = sinon.stub(fs, "readFile").callsFake(read)
    readFile
      .withArgs(
        sinon.match(
          (uri: vscode.Uri) =>
            uri.path === vscode.Uri.joinPath(root, "unreadable.txt").path,
        ),
      )
      .rejects(vscode.FileSystemError.NoPermissions())
    await assert.rejects(archiveNames(), /NoPermissions/)
  })
  test("restored directories still respect exclusions for individual files", async () => {
    await prepare({
      ".git": null,
      ".gitignore": "build/\n*.css\n",
      ".fastapicloudignore": "!static/build\n",
      "static/build/a.css": "drop",
      "static/build/a.js": "keep",
    })
    assert.deepStrictEqual(await archiveNames(), ["static/build/a.js"])
  })

  test("reads repository excludes below gitignore and cloud rules", async () => {
    await prepare({
      ".git/info/exclude": "*.txt\n",
      ".gitignore": "!git.txt\n",
      ".fastapicloudignore": "!cloud.txt\n",
      "drop.txt": "drop",
      "git.txt": "git",
      "cloud.txt": "cloud",
    })
    assert.deepStrictEqual(await archiveNames(), ["cloud.txt", "git.txt"])
  })

  test("reads excludes from a worktree common Git directory", async () => {
    await prepare({
      ".git": `gitdir: ${vscode.Uri.joinPath(base, "git/worktrees/app").fsPath}\n`,
      "../../git/worktrees/app/commondir": "../..\n",
      "../../git/info/exclude": "drop.txt\n",
      "drop.txt": "drop",
      "main.py": "keep",
    })
    assert.deepStrictEqual(await archiveNames(), ["main.py"])
  })

  test("uses the default global ignore only in Git repositories", async () => {
    await prepare({
      "../../.config/git/ignore": "*.txt\n",
      "drop.txt": "drop",
      "main.py": "keep",
    })
    assert.deepStrictEqual(await archiveNames(), ["drop.txt", "main.py"])
    await prepare({ ".git": null })
    assert.deepStrictEqual(await archiveNames(), ["main.py"])
  })

  test("honors home Git config, tilde paths, and global rule precedence", async () => {
    await prepare({
      ".git": null,
      "../../.gitconfig": '[core]\nexcludesFile = "~/custom-ignore"\n',
      "../../custom-ignore": "*.txt\n",
      "../../.config/git/config": "[core]\nexcludesFile = missing\n",
      ".git/info/exclude": "!local.txt\n",
      ".gitignore": "!git.txt\n",
      ".ignore": "!ignore.txt\n",
      ".fastapicloudignore": "!cloud.txt\n",
      "drop.txt": "drop",
      "local.txt": "local",
      "git.txt": "git",
      "ignore.txt": "ignore",
      "cloud.txt": "cloud",
    })
    assert.deepStrictEqual(await archiveNames(), [
      ".ignore",
      "cloud.txt",
      "git.txt",
      "ignore.txt",
      "local.txt",
    ])
  })

  test("honors XDG Git config and the XDG default ignore path", async () => {
    const configHome = vscode.Uri.joinPath(base, "xdg")
    await prepare({
      ".git": null,
      "../../xdg/git/ignore": "*.txt\n",
      "drop.txt": "drop",
      "keep.py": "keep",
    })
    assert.deepStrictEqual(await archiveNames(root, { configHome }), [
      "keep.py",
    ])
    await prepare({
      "../../xdg/git/config": `[core]\nexcludesFile = ${vscode.Uri.joinPath(base, "configured-ignore").fsPath}\n`,
      "../../configured-ignore": "*.py\n",
    })
    assert.deepStrictEqual(await archiveNames(root, { configHome }), [
      "drop.txt",
    ])
  })

  test("matches the CLI ignore-pattern reference corpus", async () => {
    // Expected exclusions captured from rignore 0.7.6 via the CLI walker.
    const names = [
      "!bang",
      "#hash",
      "1..3.txt",
      "1.txt",
      "UPPER.txt",
      "[abc",
      "a.txt",
      "a/b.txt",
      "a/c/b.txt",
      "b.txt",
      "bc.txt",
      "bd.txt",
      "cache/file.py",
      "d].txt",
      "debug.log",
      "drop.txt",
      "foo(bar)",
      "fooXXbar",
      "foobar",
      "keep.txt",
      "nested/debug.log",
      "nested/root.txt",
      "root.txt",
      "space",
      "space ",
      "xU0001f33cy",
      "xay",
      "xéy",
      "{1..3}.txt",
    ]
    const cases: [string, string[]][] = [
      [
        "*.txt\n!keep.txt",
        [
          "1..3.txt",
          "1.txt",
          "UPPER.txt",
          "a.txt",
          "a/b.txt",
          "a/c/b.txt",
          "b.txt",
          "bc.txt",
          "bd.txt",
          "d].txt",
          "drop.txt",
          "nested/root.txt",
          "root.txt",
          "{1..3}.txt",
        ],
      ],
      ["/root.txt", ["root.txt"]],
      ["cache/", ["cache/file.py"]],
      ["a/**", ["a/b.txt", "a/c/b.txt"]],
      ["**/*.log", ["debug.log", "nested/debug.log"]],
      ["foo(bar)", ["foo(bar)"]],
      ["{a,b}.txt", ["a.txt", "a/b.txt", "a/c/b.txt", "b.txt"]],
      ["[!a].txt", ["1.txt", "a/b.txt", "a/c/b.txt", "b.txt"]],
      ["x?y", ["xay"]],
      ["\\#hash", ["#hash"]],
      ["\\!bang", ["!bang"]],
      ["space\\ ", ["space "]],
      ["UPPER.txt", ["UPPER.txt"]],
      ["a/***/b.txt", ["a/c/b.txt"]],
      ["a**/b.txt", ["a/b.txt"]],
      ["[[:digit:]].txt", ["d].txt"]],
      ["{1..3}.txt", ["1..3.txt"]],
      ["{a,b{c,d}}.txt", ["a.txt", "bc.txt", "bd.txt"]],
      ["[abc", ["[abc"]],
      ["foo**bar", ["fooXXbar", "foobar"]],
      ["*/root.txt", ["nested/root.txt"]],
      ["**/root.txt", ["nested/root.txt", "root.txt"]],
    ]
    await prepare(Object.fromEntries(names.map((name) => [name, name])))
    for (const [pattern, excluded] of cases) {
      await prepare({ ".fastapicloudignore": `${pattern}\n` })
      assert.deepStrictEqual(
        await archiveNames(),
        names.filter((name) => !excluded.includes(name)),
        pattern,
      )
    }
  })
})
