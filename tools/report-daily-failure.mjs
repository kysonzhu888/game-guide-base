#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { reportDailyFailure, selectFailureReason } from "./lib/daily-failure-reporter.mjs";

const candidateFiles = [
  "codex-quota.md",
  "codex-preflight.md",
  "codex-final.md",
].map((name) => join(process.env.RUNNER_TEMP || "", name));

async function readFailureReason() {
  const contents = [];
  for (const path of candidateFiles) {
    try {
      contents.push(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return selectFailureReason(contents);
}

const token = (await readFile(join(homedir(), ".linear/api_token"), "utf8")).trim();
const runUrl = process.env.FAILURE_RUN_URL
  || `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const result = await reportDailyFailure({
  token,
  issueIdentifier: process.env.LINEAR_FAILURE_ISSUE,
  runUrl,
  reason: await readFailureReason(),
  runDate: process.env.DAILY_RUN_DATE || new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
});
console.log(JSON.stringify(result));
