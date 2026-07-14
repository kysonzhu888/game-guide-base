const PROCESS_ASSIGNMENT = "globalThis.process = processShim;";
const GLOBAL_PROCESS_ASSIGNMENT = "globalThis.global.process = processShim;";

function occurrenceCount(source, marker) {
  return source.split(marker).length - 1;
}

export function patchBrowserClientRuntime(source) {
  const processAssignmentCount = occurrenceCount(source, PROCESS_ASSIGNMENT);
  const globalProcessAssignmentCount = occurrenceCount(source, GLOBAL_PROCESS_ASSIGNMENT);
  if (
    processAssignmentCount === 0
    && globalProcessAssignmentCount === 0
    && source.includes("const processShim =")
    && source.includes("setupBrowserRuntime")
  ) {
    return source;
  }
  if (processAssignmentCount !== 1 || globalProcessAssignmentCount !== 1) {
    throw new Error("browser-client process shim markers changed; refusing an unsafe runtime patch");
  }

  return source
    .replace(PROCESS_ASSIGNMENT, `try { ${PROCESS_ASSIGNMENT} } catch {}`)
    .replace(GLOBAL_PROCESS_ASSIGNMENT, `try { ${GLOBAL_PROCESS_ASSIGNMENT} } catch {}`);
}
