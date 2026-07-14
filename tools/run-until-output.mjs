import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

const TIMEOUT_EXIT_STATUS = 142;
const USAGE_EXIT_STATUS = 64;
const SPAWN_FAILURE_EXIT_STATUS = 127;
const SUCCESS_GRACE_MS = 250;
const FORCE_KILL_DELAY_MS = 750;
const OUTPUT_WINDOW_SIZE = 16_384;

const [timeoutArgument, successMarker, command, ...commandArguments] = process.argv.slice(2);
const timeoutSeconds = Number(timeoutArgument);

if (
  !Number.isFinite(timeoutSeconds)
  || timeoutSeconds <= 0
  || !successMarker
  || !command
) {
  console.error(
    "Usage: run-until-output.mjs <positive-seconds> <success-marker> <command> [arguments...]",
  );
  process.exit(USAGE_EXIT_STATUS);
}

const child = spawn(command, commandArguments, {
  detached: true,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

let markerObserved = false;
let outputWindow = "";
let stopPromise;
let timedOut = false;

function signalChildProcessGroup(signal) {
  if (child.pid == null) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") child.kill(signal);
  }
}

function processGroupExists() {
  if (child.pid == null) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function stopProcessGroupAfter(delayMs) {
  await delay(delayMs);
  if (!processGroupExists()) return;
  signalChildProcessGroup("SIGTERM");
  await delay(FORCE_KILL_DELAY_MS);
  if (processGroupExists()) signalChildProcessGroup("SIGKILL");
  await delay(50);
}

function captureOutput(chunk, destination) {
  destination.write(chunk);
  outputWindow = `${outputWindow}${chunk.toString()}`.slice(-OUTPUT_WINDOW_SIZE);
  if (!markerObserved && outputWindow.includes(successMarker)) {
    markerObserved = true;
    clearTimeout(timeoutTimer);
    stopPromise = stopProcessGroupAfter(SUCCESS_GRACE_MS);
  }
}

child.stdout.on("data", (chunk) => captureOutput(chunk, process.stdout));
child.stderr.on("data", (chunk) => captureOutput(chunk, process.stderr));

const timeoutTimer = setTimeout(() => {
  timedOut = true;
  console.error(`Command timed out after ${timeoutArgument} seconds.`);
  stopPromise ??= stopProcessGroupAfter(0);
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
if (stopPromise) await stopPromise;

if (result.error != null) {
  console.error(`Unable to start ${command}: ${result.error.message}`);
  process.exit(SPAWN_FAILURE_EXIT_STATUS);
}

if (markerObserved) process.exit(0);
if (timedOut) process.exit(TIMEOUT_EXIT_STATUS);
if (result.code != null) process.exit(result.code);

const signalNumber = osConstants.signals[result.signal] ?? 1;
process.exit(128 + signalNumber);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
