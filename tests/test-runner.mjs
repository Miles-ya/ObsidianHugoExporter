import esbuild from 'esbuild';
import { spawnSync } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hugo-exporter-tests-'));
const outputFile = path.join(temporaryDirectory, 'tests.cjs');

try {
	await esbuild.build({
		entryPoints: ['tests/run-tests.ts'],
		bundle: true,
		platform: 'node',
		format: 'cjs',
		alias: {
			obsidian: './tests/obsidian-stub.ts'
		},
		banner: { js: 'var window = global;' },
		outfile: outputFile,
		logLevel: 'silent'
	});
	const result = spawnSync(process.execPath, [outputFile], { stdio: 'inherit' });
	if (result.error) {
		throw result.error;
	}
	process.exitCode = result.status ?? 1;
} finally {
	await rm(temporaryDirectory, { recursive: true, force: true });
}
