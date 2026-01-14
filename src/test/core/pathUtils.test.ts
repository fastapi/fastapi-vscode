import * as assert from "node:assert"
import { join } from "node:path"
import {
  countSegments,
  findProjectRoot,
  getPathSegments,
  isWithinDirectory,
  pathMatchesEndpoint,
  stripLeadingDynamicSegments,
} from "../../core/pathUtils"
import { fixtures } from "../testUtils"

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
      assert.strictEqual(isWithinDirectory("/foo/bar/baz", "/foo/bar"), true)
    })

    test("returns true for path equal to directory", () => {
      assert.strictEqual(isWithinDirectory("/foo/bar", "/foo/bar"), true)
    })

    test("returns false for path outside directory", () => {
      assert.strictEqual(isWithinDirectory("/foo/baz", "/foo/bar"), false)
    })

    test("returns false for sibling with similar prefix", () => {
      // This is the key test - /foo/ba is NOT a parent of /foo/bar
      assert.strictEqual(isWithinDirectory("/foo/bar", "/foo/ba"), false)
    })

    test("returns false for parent directory", () => {
      assert.strictEqual(isWithinDirectory("/foo", "/foo/bar"), false)
    })
  })

  suite("findProjectRoot", () => {
    test("returns entry dir when no __init__.py present", () => {
      // main.py is at fixtures/standard/main.py, and fixtures/standard has no __init__.py
      const mainPyPath = join(standardRoot, "main.py")
      const result = findProjectRoot(mainPyPath, standardRoot)

      assert.strictEqual(result, standardRoot)
    })

    test("walks up to find project root from nested package", () => {
      // users.py is in app/routes/users.py
      // app has __init__.py, routes has __init__.py
      // but fixtures/standard does not, so project root should be fixtures/standard
      const usersPath = join(standardRoot, "app", "routes", "users.py")
      const result = findProjectRoot(usersPath, standardRoot)

      assert.strictEqual(result, standardRoot)
    })

    test("returns workspace root when all dirs have __init__.py", () => {
      // If we pretend the workspace root is app, it should return that
      const usersPath = join(standardRoot, "app", "routes", "users.py")
      const appRoot = join(standardRoot, "app")
      const result = findProjectRoot(usersPath, appRoot)

      assert.strictEqual(result, appRoot)
    })
  })

  suite("pathMatchesEndpoint", () => {
    test("matches exact static paths", () => {
      assert.strictEqual(pathMatchesEndpoint("/items", "/items"), true)
      assert.strictEqual(pathMatchesEndpoint("/api/users", "/api/users"), true)
    })

    test("matches path with single parameter", () => {
      assert.strictEqual(
        pathMatchesEndpoint("/items/123", "/items/{item_id}"),
        true,
      )
      assert.strictEqual(
        pathMatchesEndpoint("/items/abc", "/items/{item_id}"),
        true,
      )
    })

    test("matches path with multiple parameters", () => {
      assert.strictEqual(
        pathMatchesEndpoint(
          "/users/abc/posts/456",
          "/users/{user_id}/posts/{post_id}",
        ),
        true,
      )
    })

    test("rejects when segment count differs", () => {
      assert.strictEqual(
        pathMatchesEndpoint("/items/123/details", "/items/{item_id}"),
        false,
      )
      assert.strictEqual(
        pathMatchesEndpoint("/items", "/items/{item_id}"),
        false,
      )
    })

    test("rejects when static segments differ", () => {
      assert.strictEqual(
        pathMatchesEndpoint("/users/123", "/items/{item_id}"),
        false,
      )
      assert.strictEqual(
        pathMatchesEndpoint("/api/v1/items", "/api/v2/items"),
        false,
      )
    })

    test("handles trailing slashes", () => {
      assert.strictEqual(pathMatchesEndpoint("/items/", "/items"), true)
      assert.strictEqual(pathMatchesEndpoint("/items", "/items/"), true)
      assert.strictEqual(
        pathMatchesEndpoint("/items/123/", "/items/{id}"),
        true,
      )
    })

    test("handles root path", () => {
      assert.strictEqual(pathMatchesEndpoint("/", "/"), true)
      assert.strictEqual(pathMatchesEndpoint("", ""), true)
    })

    test("rejects empty path against non-empty", () => {
      assert.strictEqual(
        pathMatchesEndpoint("/items/123", "/items/{item_id}"),
        true,
      )
      assert.strictEqual(
        pathMatchesEndpoint("/items/", "/items/{item_id}"),
        false,
      )
    })

    test("matches paths with dynamic prefix", () => {
      // Dynamic prefixes like {settings.API_V1_STR} match any segment (same as path params)
      assert.strictEqual(
        pathMatchesEndpoint(
          "/v1/items/123",
          "{settings.API_V1_STR}/items/{item_id}",
        ),
        true,
      )
      assert.strictEqual(
        pathMatchesEndpoint("/api/v2/users", "{BASE}/users"),
        false, // segment count differs
      )
    })
  })
})
