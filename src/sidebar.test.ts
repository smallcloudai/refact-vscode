import * as assert from "assert";
import * as path from "path";
import {
    createCurrentProjectInfo,
    resolveFilePathWithinWorkspace,
} from "./sidebar";

export function runSidebarPathBoundaryTests() {
    const workspaceRoot = path.resolve("/workspace/repo");

    assert.strictEqual(
        resolveFilePathWithinWorkspace("src/index.ts", [workspaceRoot]),
        path.resolve(workspaceRoot, "src/index.ts"),
    );

    assert.strictEqual(
        resolveFilePathWithinWorkspace(path.resolve("/workspace/other/file.ts"), [workspaceRoot]),
        undefined,
    );

    assert.strictEqual(
        resolveFilePathWithinWorkspace("../other/file.ts", [workspaceRoot]),
        undefined,
    );

    assert.strictEqual(
        resolveFilePathWithinWorkspace(path.resolve("/workspace/repo2/file.ts"), [workspaceRoot]),
        undefined,
    );

    assert.strictEqual(
        resolveFilePathWithinWorkspace(path.resolve(workspaceRoot, "file.ts"), []),
        undefined,
    );

    assert.deepStrictEqual(createCurrentProjectInfo("repo", []), { name: "repo" });
}

runSidebarPathBoundaryTests();
