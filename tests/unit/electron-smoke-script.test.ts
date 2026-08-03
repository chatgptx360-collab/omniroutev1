import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmokeEnv,
  FATAL_LOG_PATTERNS,
  LINUX_EXECUTABLE_NAMES,
  WINDOWS_MACHINE_ENV_NAMES,
  WINDOWS_USER_DIR_ENV_NAMES,
} from "../../scripts/dev/smoke-electron-packaged.mjs";

test("electron smoke discovers the default Linux executable name", () => {
  assert.ok(LINUX_EXECUTABLE_NAMES.includes("omniroute-desktop"));
});

test("electron smoke env allowlists runtime variables and drops secrets", () => {
  const env = buildSmokeEnv({
    currentPlatform: "linux",
    dataDir: "/tmp/omniroute-electron-smoke-test",
    parentEnv: {
      DISPLAY: ":99",
      GITHUB_TOKEN: "should-not-leak",
      PATH: "/usr/bin",
      SNYK_TOKEN: "should-not-leak",
    },
  });

  assert.equal(env.DATA_DIR, "/tmp/omniroute-electron-smoke-test");
  assert.equal(env.DISPLAY, ":99");
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.HOME, "/tmp/omniroute-electron-smoke-test/home");
  assert.equal(env.XDG_CONFIG_HOME, "/tmp/omniroute-electron-smoke-test/config");
  assert.equal(env.ELECTRON_ENABLE_LOGGING, "1");
  assert.equal(env.ELECTRON_ENABLE_STACK_DUMPING, "1");
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.SNYK_TOKEN, undefined);
});

test("electron smoke env gives Windows a complete machine environment", () => {
  const env = buildSmokeEnv({
    currentPlatform: "win32",
    dataDir: "D:\\smoke",
    parentEnv: {
      APPDATA: "C:\\Users\\real\\AppData\\Roaming",
      GITHUB_TOKEN: "should-not-leak",
      NUMBER_OF_PROCESSORS: "4",
      PATH: "C:\\Windows",
      ProgramData: "C:\\ProgramData",
      SystemDrive: "C:",
      USERPROFILE: "C:\\Users\\real",
    },
  });

  // Chromium aborts on Windows without these; the packaged app then exits 0
  // before Electron logs anything.
  assert.equal(env.ProgramData, "C:\\ProgramData");
  assert.equal(env.SystemDrive, "C:");
  assert.equal(env.NUMBER_OF_PROCESSORS, "4");

  // Windows user directories are inherited, NOT redirected. Redirecting them
  // stops the packaged app booting at all — it exits 0 before Electron can log
  // anything. Measured by bisect in CI; see buildSmokeEnv's win32 branch.
  assert.equal(env.USERPROFILE, "C:\\Users\\real");
  assert.equal(env.APPDATA, "C:\\Users\\real\\AppData\\Roaming");

  // Isolation still holds where it matters: DATA_DIR is what OmniRoute uses for
  // the SQLite database, .env, logs and backups.
  assert.equal(env.DATA_DIR, "D:\\smoke");

  // Secrets still never reach the child.
  assert.equal(env.GITHUB_TOKEN, undefined);
});

test("electron smoke inherits no credential-shaped Windows variables", () => {
  for (const name of [...WINDOWS_MACHINE_ENV_NAMES, ...WINDOWS_USER_DIR_ENV_NAMES]) {
    assert.ok(
      !/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(name),
      `${name} must not be inherited into the smoke environment`
    );
  }
});

test("electron smoke treats Electron process errors as fatal startup logs", () => {
  const logs = [
    "[Electron] Unhandled Rejection: Error: startup failed",
    "[Electron] Uncaught Exception: Error: startup failed",
  ];

  for (const log of logs) {
    assert.ok(
      FATAL_LOG_PATTERNS.some((pattern) => pattern.test(log)),
      `${log} should match a fatal log pattern`
    );
  }
});
