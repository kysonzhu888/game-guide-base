import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

const TIMEOUT_EXIT_STATUS = 142;
const USAGE_EXIT_STATUS = 64;
const SPAWN_FAILURE_EXIT_STATUS = 127;
const FORCE_KILL_DELAY_MS = 3_000;

const [timeoutArgument, command, ...commandArguments] = process.argv.slice(2);
const timeoutSeconds = Number(timeoutArgument);

if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || command == null) {
  console.error("Usage: run-with-timeout.mjs <positive-seconds> <command> [arguments...]");
  process.exit(USAGE_EXIT_STATUS);
}

const child = spawn(command, commandArguments, {
  detached: true,
  env: process.env,
  stdio: "inherit",
});

let forceKillTimer;
let timedOut = false;

function signalChildProcessGroup(signal) {
  if (child.pid == null) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      child.kill(signal);
    }
  }
}

const timeoutTimer = setTimeout(() => {
  timedOut = true;
  console.error(`Command timed out after ${timeoutArgument} seconds.`);
  signalChildProcessGroup("SIGTERM");
  forceKillTimer = setTimeout(() => {
    signalChildProcessGroup("SIGKILL");
  }, FORCE_KILL_DELAY_MS);
}, timeoutSeconds * 1_000);

const result = await new Promise((resolve) => {
  let settled = false;

  child.once("error", (error) => {
    if (!settled) {
      settled = true;
      resolve({ error });
    }
  });
  child.once("exit", (code, signal) => {
    if (!settled) {
      settled = true;
      resolve({ code, signal });
    }
  });
});

clearTimeout(timeoutTimer);
clearTimeout(forceKillTimer);

if (result.error != null) {
  console.error(`Unable to start ${command}: ${result.error.message}`);
  process.exit(SPAWN_FAILURE_EXIT_STATUS);
}

if (timedOut) {
  process.exit(TIMEOUT_EXIT_STATUS);
}

if (result.code != null) {
  process.exit(result.code);
}

const signalNumber = osConstants.signals[result.signal] ?? 1;
process.exit(128 + signalNumber);
