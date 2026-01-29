import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ConfigService } from "../../cloud/config"

function stubFs() {
  const original = vscode.workspace.fs
  const fake = {
    readFile: sinon.stub(),
    writeFile: sinon.stub(),
    delete: sinon.stub(),
    createDirectory: sinon.stub(),
  } as unknown as typeof vscode.workspace.fs & {
    readFile: sinon.SinonStub
    writeFile: sinon.SinonStub
    delete: sinon.SinonStub
    createDirectory: sinon.SinonStub
  }
  Object.defineProperty(vscode.workspace, "fs", {
    value: fake,
    configurable: true,
  })
  return {
    fake,
    restore: () =>
      Object.defineProperty(vscode.workspace, "fs", {
        value: original,
        configurable: true,
      }),
  }
}

suite("cloud/config", () => {
  let fsStub: ReturnType<typeof stubFs>

  setup(() => {
    fsStub = stubFs()
  })

  teardown(() => {
    fsStub.restore()
    sinon.restore()
  })

  suite("getConfig", () => {
    test("returns parsed config when file exists", async () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")
      const configData = { app_id: "app-123", team_id: "team-456" }

      fsStub.fake.readFile.resolves(Buffer.from(JSON.stringify(configData)))

      const result = await config.getConfig(workspaceRoot)

      assert.deepStrictEqual(result, configData)

      config.dispose()
    })

    test("returns null when file does not exist", async () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")

      fsStub.fake.readFile.rejects(new Error("File not found"))

      const result = await config.getConfig(workspaceRoot)

      assert.strictEqual(result, null)

      config.dispose()
    })
  })

  suite("writeConfig", () => {
    test("writes config, readme, and gitignore", async () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")
      const configData = { app_id: "app-123", team_id: "team-456" }

      fsStub.fake.createDirectory.resolves()
      fsStub.fake.writeFile.resolves()

      await config.writeConfig(workspaceRoot, configData)

      assert.ok(fsStub.fake.createDirectory.calledOnce)
      assert.strictEqual(fsStub.fake.writeFile.callCount, 3)

      const configCall = fsStub.fake.writeFile
        .getCalls()
        .find((c: sinon.SinonSpyCall) => {
          const uri = c.args[0] as vscode.Uri
          return uri.path.endsWith("cloud.json")
        })
      assert.ok(configCall)
      const written = Buffer.from(configCall.args[1] as Uint8Array).toString()
      assert.deepStrictEqual(JSON.parse(written), configData)

      const readmeCall = fsStub.fake.writeFile
        .getCalls()
        .find((c: sinon.SinonSpyCall) => {
          const uri = c.args[0] as vscode.Uri
          return uri.path.endsWith("README.md")
        })
      assert.ok(readmeCall)

      const gitignoreCall = fsStub.fake.writeFile
        .getCalls()
        .find((c: sinon.SinonSpyCall) => {
          const uri = c.args[0] as vscode.Uri
          return uri.path.endsWith(".gitignore")
        })
      assert.ok(gitignoreCall)
      const gitignoreContent = Buffer.from(
        gitignoreCall.args[1] as Uint8Array,
      ).toString()
      assert.strictEqual(gitignoreContent, "*")

      config.dispose()
    })

    test("does not throw on write failure", async () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")

      fsStub.fake.createDirectory.rejects(new Error("Permission denied"))

      await config.writeConfig(workspaceRoot, {
        app_id: "a",
        team_id: "t",
      })

      config.dispose()
    })
  })

  suite("deleteConfig", () => {
    test("deletes config directory recursively", async () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")

      fsStub.fake.delete.resolves()

      await config.deleteConfig(workspaceRoot)

      assert.ok(fsStub.fake.delete.calledOnce)
      const [uri, options] = fsStub.fake.delete.firstCall.args
      assert.ok((uri as vscode.Uri).path.endsWith(".fastapicloud"))
      assert.deepStrictEqual(options, { recursive: true })

      config.dispose()
    })

    test("does not throw when directory does not exist", async () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")

      fsStub.fake.delete.rejects(new Error("Not found"))

      await config.deleteConfig(workspaceRoot)

      config.dispose()
    })
  })

  suite("startWatching", () => {
    test("creates file system watcher", () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")

      const mockWatcher = {
        onDidChange: sinon.stub(),
        onDidCreate: sinon.stub(),
        onDidDelete: sinon.stub(),
        dispose: sinon.stub(),
      }

      sinon
        .stub(vscode.workspace, "createFileSystemWatcher")
        .returns(mockWatcher as unknown as vscode.FileSystemWatcher)

      config.startWatching(workspaceRoot)

      assert.ok(mockWatcher.onDidChange.calledOnce)
      assert.ok(mockWatcher.onDidCreate.calledOnce)
      assert.ok(mockWatcher.onDidDelete.calledOnce)

      config.dispose()
    })
  })

  suite("dispose", () => {
    test("disposes file watcher", () => {
      const config = new ConfigService()
      const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")

      const mockWatcher = {
        onDidChange: sinon.stub(),
        onDidCreate: sinon.stub(),
        onDidDelete: sinon.stub(),
        dispose: sinon.stub(),
      }

      sinon
        .stub(vscode.workspace, "createFileSystemWatcher")
        .returns(mockWatcher as unknown as vscode.FileSystemWatcher)

      config.startWatching(workspaceRoot)
      config.dispose()

      assert.ok(mockWatcher.dispose.calledOnce)
    })

    test("dispose without watching does not throw", () => {
      const config = new ConfigService()
      config.dispose()
    })
  })
})
