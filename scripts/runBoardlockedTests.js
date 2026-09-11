'use strict';
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const requestedWorkers = Number.parseInt(process.env.BOARDLOCKED_TEST_WORKERS || '4', 10);
const workerCount = Math.max(1, Math.min(Number.isFinite(requestedWorkers) ? requestedWorkers : 4,
    typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length));
const startedAt = Date.now();

function runShard(index) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, ['--test', path.join('scripts', 'testBoardlocked.js')], {
            cwd: root,
            env: {
                ...process.env,
                BOARDLOCKED_TEST_SHARD_COUNT: String(workerCount),
                BOARDLOCKED_TEST_SHARD_INDEX: String(index)
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', error => resolve({ index, code: 1, stdout, stderr: stderr + error.stack + '\n' }));
        child.on('close', code => resolve({ index, code, stdout, stderr }));
    });
}

Promise.all(Array.from({ length: workerCount }, (_, index) => runShard(index))).then(results => {
    let tests = 0;
    let passed = 0;
    let failed = 0;
    for (const result of results) {
        const testMatch = result.stdout.match(/(?:#|ℹ) tests\s+(\d+)/);
        const passMatch = result.stdout.match(/(?:#|ℹ) pass\s+(\d+)/);
        const failMatch = result.stdout.match(/(?:#|ℹ) fail\s+(\d+)/);
        tests += Number(testMatch?.[1] || 0);
        passed += Number(passMatch?.[1] || 0);
        failed += Number(failMatch?.[1] || 0);
        if (result.code !== 0) {
            process.stderr.write(`\nBoardlocked test shard ${result.index + 1}/${workerCount} failed:\n`);
            process.stderr.write(result.stdout);
            process.stderr.write(result.stderr);
        }
    }
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`Boardlocked tests: ${passed}/${tests} passed across ${workerCount} workers in ${seconds}s.`);
    if (results.some(result => result.code !== 0) || failed) process.exitCode = 1;
});
