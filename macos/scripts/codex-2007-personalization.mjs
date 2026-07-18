#!/usr/bin/env node

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { readImageMetadata } from "./image-metadata.mjs";

const ids = ["preset-codex-1907-deep"];
const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument: ${key || ""}`);
  options.set(key.slice(2), value);
}

const themesRoot = options.get("themes-root");
if (!themesRoot) throw new Error("Missing --themes-root.");
const canonicalRoot = await fs.realpath(themesRoot);

function sameStat(left, right) {
  return left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function readStableFile(file, label, maximum) {
  let handle;
  try {
    handle = await fs.open(file, OPEN_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") throw new Error(`${label} must not be a symbolic link.`);
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`${label} must be a regular file.`);
    if (before.size > maximum) throw new Error(`${label} is larger than ${maximum} bytes.`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameStat(before, after)) throw new Error(`${label} changed while it was being read.`);
    return { bytes, stat: after };
  } finally {
    await handle.close();
  }
}

async function assertDirectoryStable(record) {
  const current = await fs.lstat(record.directory);
  const canonical = await fs.realpath(record.directory);
  if (!current.isDirectory() || current.isSymbolicLink() || canonical !== record.canonicalDirectory ||
      current.dev !== record.directoryStat.dev || current.ino !== record.directoryStat.ino) {
    throw new Error(`${record.directory} changed during personalization.`);
  }
}

async function assertDestinationStable(item) {
  if (item.originalStat === null) {
    try {
      await fs.lstat(item.destination);
      throw new Error(`${item.destination} appeared during personalization.`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return;
  }
  const current = await fs.lstat(item.destination);
  if (current.isSymbolicLink() || !sameStat(item.originalStat, current)) {
    throw new Error(`${item.destination} changed during personalization.`);
  }
}

async function acquireLock() {
  const lockPath = path.join(canonicalRoot, ".codex-2007-personalization.lock");
  const deadline = Date.now() + 5000;
  while (true) {
    let created = false;
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      created = true;
      await fs.writeFile(
        path.join(lockPath, "owner.json"),
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        { mode: 0o600, flag: "wx" },
      );
      return async () => fs.rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (created) {
        await fs.rm(lockPath, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
      if (error.code !== "EEXIST") throw error;
      const lockStat = await fs.lstat(lockPath).catch(() => null);
      if (lockStat?.isSymbolicLink() || (lockStat && !lockStat.isDirectory())) {
        throw new Error(`Unsafe personalization lock path: ${lockPath}`);
      }
      if (lockStat && Date.now() - lockStat.mtimeMs > 30000) {
        let ownerAlive = false;
        try {
          const owner = JSON.parse(await fs.readFile(path.join(lockPath, "owner.json"), "utf8"));
          if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
            try {
              process.kill(owner.pid, 0);
              ownerAlive = true;
            } catch (probeError) {
              ownerAlive = probeError.code === "EPERM";
            }
          }
        } catch {}
        if (!ownerAlive) {
          await fs.rm(lockPath, { recursive: true, force: true });
          continue;
        }
      }
      if (Date.now() >= deadline) {
        throw new Error("Another Codex 2007 personalization operation is still running; try again shortly.");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function textOption(name, fallback, maximum) {
  if (!options.has(name)) return fallback;
  const value = options.get(name).trim();
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
    throw new Error(`${name} must be 1-${maximum} printable characters.`);
  }
  return value;
}

const releaseLock = await acquireLock();
try {
  const records = [];
  for (const id of ids) {
    const directory = path.join(themesRoot, id);
    const directoryStat = await fs.lstat(directory);
    const canonicalDirectory = await fs.realpath(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() ||
        !canonicalDirectory.startsWith(`${canonicalRoot}${path.sep}`)) {
      throw new Error(`${directory} must be a real theme directory inside the theme library.`);
    }
    const configPath = path.join(directory, "theme.json");
    const config = await readStableFile(configPath, "Theme config", MAX_CONFIG_BYTES);
    const configText = new TextDecoder("utf-8", { fatal: true }).decode(config.bytes);
    const raw = JSON.parse(configText);
    if (raw.id !== id) throw new Error(`${configPath} has an unexpected theme id.`);
    records.push({
      id, directory, canonicalDirectory, directoryStat, configPath, configText,
      configStat: config.stat, raw, temporary: [],
    });
  }

  const baseProfile = records[0].raw.profile || {};
  const profile = {
    nickname: textOption("nickname", baseProfile.nickname || "张奈斯", 40),
    signature: textOption("signature", baseProfile.signature || "别迷恋姐，姐只是个传说。", 120),
    level: textOption("level", baseProfile.level || "LV07", 16),
    status: options.get("status") || baseProfile.status || "online",
    statuses: ["online", "busy", "offline"],
  };
  if (!profile.statuses.includes(profile.status)) throw new Error("status must be online, busy, or offline.");
  const statusLabel = profile.status === "busy" ? "忙碌" : profile.status === "offline" ? "离线" : "在线";

  async function validatedPng(optionName) {
    const file = options.get(optionName);
    if (!file) return null;
    const { bytes } = await readStableFile(file, optionName, MAX_IMAGE_BYTES);
    if (bytes.length < 1 || !readImageMetadata(bytes, ".png")) {
      throw new Error(`${optionName} must be a valid PNG no larger than 16 MB.`);
    }
    return bytes;
  }

  const assistant = await validatedPng("assistant");
  const qqShow = await validatedPng("qq-show");
  const committed = [];

  try {
    for (const record of records) {
      const theme = record.raw;
      theme.profile = { ...profile };
      theme.tagline = profile.signature;
      theme.brandSubtitle = `${profile.nickname} · ${statusLabel}`;
      theme.statusText = `${profile.nickname} · ${statusLabel} · ${profile.level}`;
      theme.decorations ||= {};

      for (const [bytes, fileName, key] of [
        [assistant, "assistant.png", "assistant"],
        [qqShow, "qq-show.png", "qqShow"],
      ]) {
        if (!bytes) continue;
        const destination = path.join(record.directory, fileName);
        let backup = null;
        let originalStat = null;
        try {
          const original = await readStableFile(destination, fileName, MAX_IMAGE_BYTES);
          backup = original.bytes;
          originalStat = original.stat;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        await assertDirectoryStable(record);
        const temporary = path.join(record.directory, `.${fileName}.${process.pid}.tmp`);
        await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
        record.temporary.push({ temporary, destination, backup, originalStat, record });
        theme.decorations[key] = fileName;
      }

      await assertDirectoryStable(record);
      const configTemporary = path.join(record.directory, `.theme.json.${process.pid}.tmp`);
      await fs.writeFile(configTemporary, `${JSON.stringify(theme, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      record.configTemporary = configTemporary;
      record.configCommit = {
        temporary: configTemporary,
        destination: record.configPath,
        backup: Buffer.from(record.configText),
        originalStat: record.configStat,
        record,
      };
    }

    for (const record of records) {
      for (const asset of record.temporary) {
        await assertDirectoryStable(record);
        await assertDestinationStable(asset);
        await fs.rename(asset.temporary, asset.destination);
        committed.push(asset);
      }
    }
    for (const record of records) {
      await assertDirectoryStable(record);
      await assertDestinationStable(record.configCommit);
      await fs.rename(record.configTemporary, record.configPath);
      committed.push(record.configCommit);
    }
  } catch (error) {
    const rollbackErrors = [];
    let rollbackIndex = 0;
    for (const item of committed.reverse()) {
      try {
        await assertDirectoryStable(item.record);
        if (item.backup === null) {
          await fs.rm(item.destination, { force: true });
        } else {
          const rollback = `${item.destination}.${process.pid}.rollback-${rollbackIndex++}`;
          await fs.writeFile(rollback, item.backup, { flag: "wx", mode: 0o600 });
          await fs.rename(rollback, item.destination);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    for (const record of records) {
      for (const asset of record.temporary) await fs.rm(asset.temporary, { force: true });
      if (record.configTemporary) await fs.rm(record.configTemporary, { force: true });
    }
    if (rollbackErrors.length) {
      throw new Error(`${error.message}; rollback failed: ${rollbackErrors.join("; ")}`);
    }
    throw error;
  }

  process.stdout.write(`${JSON.stringify({ pass: true, profile })}\n`);
} finally {
  await releaseLock();
}
