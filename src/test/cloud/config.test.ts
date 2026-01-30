import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ConfigService } from "../../cloud/config"
import { stubFs } from "../testUtils"

suite("cloud/config", () => {
  let fsStub: ReturnType<typeof stubFs>
  let config: ConfigService
  const workspaceRoot = vscode.Uri.file("/tmp/test-workspace")

  setup(() => {
    fsStub = stubFs()
    config = new ConfigService()
  })

  teardown(() => {
    config.dispose()
    fsStub.restore()
    sinon.restore()
  })

  suite("getConfig", () => {
    test("returns parsed config when file exists", async () => {
      const configData = { app_id: "app-123", team_id: "team-456" }

      fsStub.fake.readFile.resolves(Buffer.from(JSON.stringify(configData)))

      const result = await config.getConfig(workspaceRoot)

      assert.deepStrictEqual(result, configData)
    })

    test("returns null when file does not exist", async () => {
      fsStub.fake.readFile.rejects(new Error("File not found"))

      const result = await config.getConfig(workspaceRoot)

      assert.strictEqual(result, null)
    })
  })

  suite("writeConfig", () => {
    test("writes config, readme, and gitignore", async () => {
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
    })
  })

  suite("deleteConfig", () => {
    test("deletes config directory recursively", async () => {
      fsStub.fake.delete.resolves()

      await config.deleteConfig(workspaceRoot)

      assert.ok(fsStub.fake.delete.calledOnce)
      const [uri, options] = fsStub.fake.delete.firstCall.args
      assert.ok((uri as vscode.Uri).path.endsWith(".fastapicloud"))
      assert.deepStrictEqual(options, { recursive: true })
    })
  })

  suite("startWatching", () => {
    test("creates file system watcher", () => {
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
    })
  })

  suite("dispose", () => {
    test("disposes file watcher", () => {
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
  })
})
