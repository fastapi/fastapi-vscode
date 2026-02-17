import * as assert from "node:assert"
import {
  countSegments,
  findProjectRoot,
  getPathSegments,
  isWithinDirectory,
  pathMatchesPathOperation,
  stripLeadingDynamicSegments,
} from "../../core/pathUtils"
import { fixtures, nodeFileSystem } from "../testUtils"

const standardRoot = fixtures.standard.root

suite("pathUtils", () => {
  suite("stripLeadingDynamicSegments", () => {
    test("strips single dynamic segment", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("{settings.API_V1_STR}/users/{id}"),
        "/users/{id}",
      )
    })

    test("strips multiple dynamic segments", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("{BASE}{VERSION}/api/items"),
        "/api/items",
      )
    })

    test("leaves path parameters unchanged", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("/users/{id}/posts"),
        "/users/{id}/posts",
      )
    })

    test("returns / for only dynamic segment", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("{settings.API_V1_STR}"),
        "/",
      )
    })

    test("leaves static paths unchanged", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("/api/users"),
        "/api/users",
      )
    })

    test("handles empty string", () => {
      assert.strictEqual(stripLeadingDynamicSegments(""), "/")
    })

    test("handles root path", () => {
      assert.strictEqual(stripLeadingDynamicSegments("/"), "/")
    })
  })

  suite("getPathSegments", () => {
    test("gets first N segments", () => {
      assert.strictEqual(
        getPathSegments("/integrations/neon/foo", 2),
        "/integrations/neon",
      )
    })

    test("gets single segment", () => {
      assert.strictEqual(getPathSegments("/users/123/posts", 1), "/users")
    })

    test("returns full path if count exceeds segments", () => {
      assert.strictEqual(getPathSegments("/a/b/c", 5), "/a/b/c")
    })

    test("returns full path if count equals segments", () => {
      assert.strictEqual(getPathSegments("/a/b/c", 3), "/a/b/c")
    })

    test("handles root path", () => {
      assert.strictEqual(getPathSegments("/", 1), "/")
    })

    test("handles zero count", () => {
      assert.strictEqual(getPathSegments("/users/posts", 0), "/")
    })
  })

  suite("countSegments", () => {
    test("counts multiple segments", () => {
      assert.strictEqual(countSegments("/integrations/neon"), 2)
    })

    test("counts single segment", () => {
      assert.strictEqual(countSegments("/users"), 1)
    })

    test("returns 0 for root path", () => {
      assert.strictEqual(countSegments("/"), 0)
    })

    test("handles path without leading slash", () => {
      assert.strictEqual(countSegments("users/posts"), 2)
    })

    test("handles empty string", () => {
      assert.strictEqual(countSegments(""), 0)
    })

    test("ignores trailing slashes", () => {
      assert.strictEqual(countSegments("/users/posts/"), 2)
    })
  })

  suite("isWithinDirectory", () => {
    test("returns true for path inside directory", () => {
      assert.strictEqual(
        isWithinDirectory("file:///foo/bar/baz", "file:///foo/bar"),
        true,
      )
    })

    test("returns true for path equal to directory", () => {
      assert.strictEqual(
        isWithinDirectory("file:///foo/bar", "file:///foo/bar"),
        true,
      )
    })

    test("returns false for path outside directory", () => {
      assert.strictEqual(
        isWithinDirectory("file:///foo/baz", "file:///foo/bar"),
        false,
      )
    })

    test("returns false for sibling with similar prefix", () => {
      // This is the key test - /foo/ba is NOT a parent of /foo/bar
      assert.strictEqual(
        isWithinDirectory("file:///foo/bar", "file:///foo/ba"),
        false,
      )
    })

    test("returns false for parent directory", () => {
      assert.strictEqual(
        isWithinDirectory("file:///foo", "file:///foo/bar"),
        false,
      )
    })
  })

  suite("findProjectRoot", () => {
    test("returns entry dir when no __init__.py present", async () => {
      // main.py is at fixtures/standard/main.py, and fixtures/standard has no __init__.py
      const mainPyUri = nodeFileSystem.joinPath(standardRoot, "main.py")
      const result = await findProjectRoot(
        mainPyUri,
        standardRoot,
        nodeFileSystem,
      )

      assert.strictEqual(result, standardRoot)
    })

    test("walks up to find project root from nested package", async () => {
      // users.py is in app/routes/users.py
      // app has __init__.py, routes has __init__.py
      // but fixtures/standard does not, so project root should be fixtures/standard
      const usersUri = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "routes",
        "users.py",
      )
      const result = await findProjectRoot(
        usersUri,
        standardRoot,
        nodeFileSystem,
      )

      assert.strictEqual(result, standardRoot)
    })

    test("returns workspace root when all dirs have __init__.py", async () => {
      // If we pretend the workspace root is app, it should return that
      const appRootUri = nodeFileSystem.joinPath(standardRoot, "app")
      const usersUri = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "routes",
        "users.py",
      )
      const result = await findProjectRoot(usersUri, appRootUri, nodeFileSystem)

      assert.strictEqual(result, appRootUri)
    })
  })

  suite("pathMatchesPathOperation", () => {
    test("matches exact static paths", () => {
      assert.strictEqual(pathMatchesPathOperation("/items", "/items"), true)
      assert.strictEqual(
        pathMatchesPathOperation("/api/users", "/api/users"),
        true,
      )
    })

    test("matches path with single parameter", () => {
      assert.strictEqual(
        pathMatchesPathOperation("/items/123", "/items/{item_id}"),
        true,
      )
      assert.strictEqual(
        pathMatchesPathOperation("/items/abc", "/items/{item_id}"),
        true,
      )
    })

    test("matches path with multiple parameters", () => {
      assert.strictEqual(
        pathMatchesPathOperation(
          "/users/abc/posts/456",
          "/users/{user_id}/posts/{post_id}",
        ),
        true,
      )
    })

    test("rejects when segment count differs", () => {
      assert.strictEqual(
        pathMatchesPathOperation("/items/123/details", "/items/{item_id}"),
        false,
      )
      assert.strictEqual(
        pathMatchesPathOperation("/items", "/items/{item_id}"),
        false,
      )
    })

    test("rejects when static segments differ", () => {
      assert.strictEqual(
        pathMatchesPathOperation("/users/123", "/items/{item_id}"),
        false,
      )
      assert.strictEqual(
        pathMatchesPathOperation("/api/v1/items", "/api/v2/items"),
        false,
      )
    })

    test("handles trailing slashes", () => {
      assert.strictEqual(pathMatchesPathOperation("/items/", "/items"), true)
      assert.strictEqual(pathMatchesPathOperation("/items", "/items/"), true)
      assert.strictEqual(
        pathMatchesPathOperation("/items/123/", "/items/{id}"),
        true,
      )
    })

    test("handles root path", () => {
      assert.strictEqual(pathMatchesPathOperation("/", "/"), true)
      assert.strictEqual(pathMatchesPathOperation("", ""), true)
    })

    test("rejects empty path against non-empty", () => {
      assert.strictEqual(
        pathMatchesPathOperation("/items/123", "/items/{item_id}"),
        true,
      )
      assert.strictEqual(
        pathMatchesPathOperation("/items/", "/items/{item_id}"),
        false,
      )
    })

    test("matches paths with dynamic prefix in path operation", () => {
      assert.strictEqual(
        pathMatchesPathOperation(
          "/items/123",
          "{settings.API_V1_STR}/items/{item_id}",
        ),
        true,
      )
      assert.strictEqual(
        pathMatchesPathOperation("/api/v2/users", "{BASE}/users"),
        false,
      )
      assert.strictEqual(
        pathMatchesPathOperation("/users", "{BASE}/users"),
        true,
      )
      assert.strictEqual(
        pathMatchesPathOperation("/items", "{BASE}/users"),
        false,
      )
    })

    test("matches paths with dynamic prefix in test path (f-strings)", () => {
      assert.strictEqual(
        pathMatchesPathOperation(
          "{settings.API_V1_STR}/apps/{app.id}/environment-variables",
          "/apps/{app_id}/environment-variables",
        ),
        true,
      )
      assert.strictEqual(
        pathMatchesPathOperation(
          "{settings.API}/items/{item_id}",
          "{BASE}/items/{id}",
        ),
        true,
      )
      assert.strictEqual(
        pathMatchesPathOperation("{BASE}/users/{id}", "/items/{item_id}"),
        false,
      )
    })

    test("strips query strings from test path", () => {
      assert.strictEqual(
        pathMatchesPathOperation(
          "/teams/?owner=true&order_by=created_at",
          "/teams",
        ),
        true,
      )
      assert.strictEqual(pathMatchesPathOperation("/?page=1", "/"), true)
    })
  })
})
