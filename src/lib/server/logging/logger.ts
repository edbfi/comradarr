import { AsyncLocalStorage } from "node:async_hooks";
import { redact } from "./redact.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMetadata = Record<string, unknown>;
export type Logger = Record<LogLevel, (message: string, metadata?: LogMetadata) => void>;

let debug = false;

/** Sets what startup read from the configuration; debug entries are dropped until it is on. */
export function configureLogging(options: { debug: boolean }): void {
	debug = options.debug;
}

/** Entries handed to standard output whose write hasn't finished yet. */
let writing = 0;
const whenWritten: (() => void)[] = [];

function write(line: string): void {
	writing++;
	// The callback runs once the entry has left the process, or with an error; either way it no
	// longer waits.
	process.stdout.write(line, () => {
		writing--;
		if (writing === 0) for (const resolve of whenWritten.splice(0)) resolve();
	});
}

/**
 * Resolves once every entry written so far has left the process, so an entry written just before
 * the process exits isn't lost. An empty write's callback isn't enough: on Bun it can run while
 * earlier entries still wait for a slow reader.
 */
export function flushLogs(): Promise<void> {
	if (writing === 0) return Promise.resolve();
	return new Promise((resolve) => whenWritten.push(resolve));
}

/** The id of the request being handled, kept like the language, so concurrent requests can't mix. */
const requestContext = new AsyncLocalStorage<string>();

/**
 * Runs `work` as part of the request `requestId` names: every entry written meanwhile, however
 * deep, carries it, so the request's log lines and its audit entries link up (SPEC-setup.md,
 * "Logging").
 */
export function withRequestId<T>(requestId: string, work: () => T): T {
	return requestContext.run(requestId, work);
}

/**
 * A logger for `source`. Each entry is one JSON line on standard output (D12), redacted before
 * it is written, with the request's id when one is being handled (SPEC-setup.md, "Logging").
 */
export function createLogger(source: string): Logger {
	const entry =
		(level: LogLevel) =>
		(message: string, metadata: LogMetadata = {}): void => {
			if (level === "debug" && !debug) return;
			const line = JSON.stringify({
				time: new Date().toISOString(),
				level,
				source,
				message: redact(message),
				metadata: redact(metadata),
				requestId: requestContext.getStore(),
			});
			write(`${line}\n`);
		};
	return { debug: entry("debug"), info: entry("info"), warn: entry("warn"), error: entry("error") };
}
