/* global console, process, Buffer, URL, window, document, getComputedStyle, requestAnimationFrame, HTMLButtonElement */
/**
 * Deterministic, renderer-facing VFX capture harness.
 *
 * The default route is a normal-speed fixed-seed run. It keeps selecting the
 * first visible upgrade with the real DOM button so a visual test cannot stall
 * at the same menu a human player sees. `--stress` exists for a fast smoke
 * capture only; use normal speed for phase scoring because it preserves the
 * player-visible lifetime of short VFX.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { chromium } from 'playwright';
import { createCanvas, loadImage } from 'canvas';
import { auditFrames, findFfmpeg } from './flash-audit.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webToyRoot = resolve(scriptDirectory, '..');
const workspaceRoot = resolve(webToyRoot, '../..');
const capturesRoot = join(workspaceRoot, 'docs', 'vfx', 'captures');
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const NORMAL_CAPTURE_SECONDS = Object.freeze([5, 30, 90, 180]);
const NORMAL_CLIP_SECONDS = Object.freeze([30, 180]);
const TICKS_PER_SECOND = 60;

class BootError extends Error {}

function fail(message) {
  throw new Error(`[vfx-capture] ${message}`);
}

function normalizeIteration(value) {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value)) {
    fail(`iteration must contain only letters, digits, dots, underscores, or hyphens: ${value}`);
  }
  return value;
}

function isoIteration() {
  return `capture-${new Date().toISOString().replace(/[:.]/gu, '-').replace(/Z$/u, 'Z')}`;
}

function parseNumberList(value, name) {
  const values = value.split(',').map((entry) => Number(entry.trim()));
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry) || entry <= 0)) {
    fail(`${name} must be a comma-separated list of positive seconds`);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function parseArgs(argv) {
  const args = {
    baseUrl: null,
    browserMode: 'auto',
    clipDuration: 10,
    clipTimes: [...NORMAL_CLIP_SECONDS],
    captureTimes: [...NORMAL_CAPTURE_SECONDS],
    failOnFlash: false,
    flashOnly: false,
    hero: 'greg',
    iteration: isoIteration(),
    keepFrames: false,
    port: 5199,
    preview: false,
    quick: false,
    seed: '3',
    stress: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--base-url' && value) {
      args.baseUrl = value;
      index++;
    } else if (argument === '--headed') {
      args.browserMode = 'headed';
    } else if (argument === '--headless') {
      args.browserMode = 'headless';
    } else if (argument === '--clip-duration' && value) {
      args.clipDuration = Number(value);
      index++;
    } else if (argument === '--clip-times' && value) {
      args.clipTimes = parseNumberList(value, '--clip-times');
      index++;
    } else if (argument === '--capture-times' && value) {
      args.captureTimes = parseNumberList(value, '--capture-times');
      index++;
    } else if (argument === '--fail-on-flash') {
      args.failOnFlash = true;
    } else if (argument === '--flash-only') {
      args.flashOnly = true;
      args.captureTimes = [180];
      args.clipTimes = [180];
      args.failOnFlash = true;
    } else if (argument === '--hero' && value) {
      args.hero = value;
      index++;
    } else if (argument === '--iteration' && value) {
      args.iteration = normalizeIteration(value);
      index++;
    } else if (argument === '--keep-frames') {
      args.keepFrames = true;
    } else if (argument === '--port' && value) {
      args.port = Number(value);
      index++;
    } else if (argument === '--preview') {
      args.preview = true;
    } else if (argument === '--quick') {
      args.quick = true;
      args.captureTimes = [2, 5];
      args.clipTimes = [5];
      args.clipDuration = 2;
    } else if (argument === '--seed' && value) {
      args.seed = value;
      index++;
    } else if (argument === '--stress') {
      args.stress = true;
    } else if (argument === '--help') {
      console.log(`Usage: node scripts/vfx-capture.mjs [options]

Runs normal-speed deterministic capture by default (fixed seed + DOM upgrade selection).

  --iteration <name>       Output folder under docs/vfx/captures/.
  --hero <id>              Hero query value (default: greg).
  --seed <seed>            Fixed run seed (default: 3).
  --capture-times 5,30,... Simulation seconds for stills.
  --clip-times 30,180      Simulation seconds where 10 s video clips begin.
  --clip-duration <sec>    Real video duration (default: 10).
  --quick                  2 s / 5 s smoke capture with one 2 s clip.
  --stress                 Fast smoke route; not valid for visual phase scoring.
  --headless               Force SwiftShader headless fallback.
  --headed                 Require headed Chromium rather than falling back.
  --preview                Build then serve dist instead of Vite dev source.
  --base-url <url>         Reuse an already-running server.
  --keep-frames            Keep extracted frames (otherwise clips are retained).
  --flash-only             Capture/audit the 180 s clip and fail on flash.
  --fail-on-flash          Exit nonzero when the flash audit fails.
`);
      process.exit(0);
    } else {
      fail(`unknown or incomplete argument: ${argument}`);
    }
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) fail(`invalid port: ${args.port}`);
  if (!Number.isFinite(args.clipDuration) || args.clipDuration <= 0) fail(`invalid --clip-duration: ${args.clipDuration}`);
  args.iteration = normalizeIteration(args.iteration);
  return args;
}

function runningUrl(baseUrl, args) {
  const url = new URL(baseUrl);
  url.searchParams.set('autopilot', '1');
  url.searchParams.set('hero', args.hero);
  url.searchParams.set('seed', args.seed);
  if (args.stress) url.searchParams.set('stress', '1');
  return url.toString();
}

async function startViteServer({ port, usePreview }) {
  if (usePreview) {
    await build({ root: webToyRoot, logLevel: 'error' });
    const server = await preview({
      root: webToyRoot,
      logLevel: 'error',
      preview: { host: '127.0.0.1', port, strictPort: false },
    });
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') fail('Vite preview did not expose a TCP port');
    return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => server.close(), mode: 'preview' };
  }
  const server = await createServer({
    root: webToyRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    fail('Vite dev server did not expose a TCP port');
  }
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => server.close(), mode: 'dev' };
}

async function launchBrowser(mode) {
  const swiftShaderArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  if (mode === 'headless') {
    return {
      browser: await chromium.launch({ headless: true, args: swiftShaderArgs }),
      mode: 'headless-swiftshader',
      fallbackReason: null,
    };
  }
  try {
    return {
      browser: await chromium.launch({ headless: false }),
      mode: 'headed',
      fallbackReason: null,
    };
  } catch (error) {
    if (mode === 'headed') throw error;
    return {
      browser: await chromium.launch({ headless: true, args: swiftShaderArgs }),
      mode: 'headless-swiftshader',
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pageRunState(page) {
  return page.evaluate(() => {
    const handle = window.__webToy;
    const banner = document.getElementById('ctx-banner');
    const intro = document.getElementById('run-intro');
    const canvas = document.getElementById('game-canvas');
    return {
      hasApp: handle !== undefined,
      introHidden: intro?.hidden === true,
      rendererBanner: banner ? getComputedStyle(banner).display : 'missing',
      simTick: handle?.driver.tick ?? -1,
      playerLevel: handle?.driver.curr.playerLevel ?? -1,
      enemiesLive: handle?.driver.enemiesLive ?? -1,
      webgl2: canvas?.getContext('webgl2') !== null,
    };
  });
}

async function ensureRunStarted(page) {
  const running = () => page.waitForFunction(() => {
    const app = window.__webToy;
    return app !== undefined && app.driver.tick > 3 && document.getElementById('run-intro')?.hidden === true;
  }, undefined, { timeout: 15_000 });
  try {
    await running();
    return { scriptedStartFallback: false, state: await pageRunState(page) };
  } catch {
    const start = page.locator('#run-intro:not([hidden]) #run-intro-start');
    if (await start.count() > 0) await start.click({ timeout: 1_000 });
    try {
      await running();
      return { scriptedStartFallback: true, state: await pageRunState(page) };
    } catch (error) {
      const state = await pageRunState(page);
      throw new BootError(`the game did not reach a running WebGL combat state: ${JSON.stringify(state)}; ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Keep real upgrade buttons moving at browser-frame cadence. Polling through
 * Playwright every 100ms let the bright modal survive one or more rendered
 * frames, which contaminated the photosensitivity capture despite combat
 * itself being stable. This remains an actual DOM button click, just timed
 * before the next frame paints.
 */
async function startUpgradeChooser(page) {
  await page.evaluate(() => {
    let active = true;
    let clicks = 0;
    const choose = () => {
      if (!active) return;
      const button = document.querySelector('#upgrade-choices:not([hidden]) button');
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
        clicks++;
      }
      requestAnimationFrame(choose);
    };
    requestAnimationFrame(choose);
    window.__vfxCaptureUpgradeChooser = {
      stop() {
        active = false;
        return clicks;
      },
    };
  });
  return {
    async stop() {
      return page.evaluate(() => window.__vfxCaptureUpgradeChooser?.stop() ?? 0);
    },
  };
}

/** The modal is not gameplay VFX and must not be sampled as part of the gate. */
async function waitForUpgradeChoicesHidden(page) {
  await page.waitForFunction(() => document.getElementById('upgrade-choices')?.hidden !== false, undefined, {
    timeout: 2_000,
  });
}

function timeoutForTick(seconds, stress) {
  const realTimeSeconds = stress ? seconds / 3 : seconds;
  return Math.ceil((realTimeSeconds * 1.5 + 30) * 1_000);
}

async function waitForTick(page, seconds, stress) {
  await page.waitForFunction((targetTick) => window.__webToy?.driver.tick >= targetTick, Math.round(seconds * TICKS_PER_SECOND), {
    timeout: timeoutForTick(seconds, stress),
  });
}

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code === 0) {
        resolveRun(Buffer.concat(stdout));
      } else {
        rejectRun(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
      }
    });
  });
}

function extractedFrameFiles(framesDir) {
  return readdirSync(framesDir)
    .filter((file) => /^f\d{4,}\.png$/u.test(file))
    .sort();
}

async function extractFrames(ffmpeg, videoPath, framesDir, startSeconds, durationSeconds) {
  mkdirSync(framesDir, { recursive: true });
  const target = join(framesDir, 'f%04d.png');
  try {
    await runFfmpeg(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', videoPath,
      '-ss', startSeconds.toFixed(3),
      '-t', durationSeconds.toFixed(3),
      '-vf', 'fps=20', target,
    ]);
    const frames = extractedFrameFiles(framesDir).length;
    if (frames === 0) fail(`ffmpeg extracted no frames from ${videoPath}`);
    return { frames, fps: 20, mode: 'ffmpeg-fps-filter' };
  } catch {
    // Playwright's compact macOS ffmpeg omits the fps filter. Preserve every
    // decoded source frame instead and record its effective sampling rate so
    // the flash gate remains truthful rather than inventing duplicate frames.
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    await runFfmpeg(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', videoPath,
      '-ss', startSeconds.toFixed(3),
      '-t', durationSeconds.toFixed(3),
      '-vsync', '0', target,
    ]);
    const frames = extractedFrameFiles(framesDir).length;
    if (frames === 0) fail(`ffmpeg fallback extracted no frames from ${videoPath}`);
    return { frames, fps: frames / durationSeconds, mode: 'source-frame-fallback' };
  }
}

async function createContactSheet(framesDir, outputPath, grayscale) {
  const files = extractedFrameFiles(framesDir);
  if (files.length === 0) fail(`cannot create contact sheet without frames: ${framesDir}`);
  const width = 8 * 256;
  const height = 5 * 144;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  let slots = 0;
  for (let index = 0; index < files.length && slots < 40; index += 5) {
    const image = await loadImage(join(framesDir, files[index]));
    context.drawImage(image, (slots % 8) * 256, Math.floor(slots / 8) * 144, 256, 144);
    slots++;
  }
  if (grayscale) {
    const pixels = context.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const value = Math.round(0.2126 * pixels.data[index] + 0.7152 * pixels.data[index + 1] + 0.0722 * pixels.data[index + 2]);
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
  }
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
  return slots;
}

async function trimClip(ffmpeg, inputPath, outputPath, startSeconds, durationSeconds) {
  const base = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-ss', startSeconds.toFixed(3),
    '-t', durationSeconds.toFixed(3),
  ];
  try {
    await runFfmpeg(ffmpeg, [...base, '-an', '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', outputPath]);
    return 'libvpx-vp9';
  } catch {
    // Playwright's compact bundled ffmpeg omits libvpx on some macOS builds.
    // Re-muxing preserves the real recorded frames and keeps the harness
    // runnable without asking contributors to install another binary.
    await runFfmpeg(ffmpeg, [...base, '-c', 'copy', outputPath]);
    return 'stream-copy';
  }
}

function artifactPath(outputDir, absolutePath) {
  return relative(outputDir, absolutePath).split('\\').join('/');
}

function fileBytes(path) {
  return statSync(path).size;
}

async function captureRun({ args, baseUrl, outputDir, serverMode }) {
  const ffmpeg = findFfmpeg();
  const browserLaunch = await launchBrowser(args.browserMode);
  const browser = browserLaunch.browser;
  const videoRawDir = join(outputDir, 'raw-video');
  const videosDir = join(outputDir, 'videos');
  mkdirSync(videoRawDir, { recursive: true });
  mkdirSync(videosDir, { recursive: true });

  const browserMessages = [];
  let context;
  let page;
  let video;
  let chooser;
  try {
    context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: 'dark',
      recordVideo: { dir: videoRawDir, size: VIEWPORT },
    });
    const recordingStartedAt = performance.now();
    page = await context.newPage();
    video = page.video();
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        browserMessages.push({ type: message.type(), text: message.text() });
      }
    });
    page.on('pageerror', (error) => browserMessages.push({ type: 'pageerror', text: error.message }));
    await page.goto(runningUrl(baseUrl, args), { waitUntil: 'domcontentloaded' });
    const boot = await ensureRunStarted(page);
    chooser = await startUpgradeChooser(page);
    const runStartedAt = performance.now();
    const milestones = [...new Set([...args.captureTimes, ...args.clipTimes])].sort((a, b) => a - b);
    const stills = [];
    const clipAnchors = [];

    for (const seconds of milestones) {
      await waitForTick(page, seconds, args.stress);
      await waitForUpgradeChoicesHidden(page);
      const state = await pageRunState(page);
      const recordedAt = performance.now();
      if (args.captureTimes.includes(seconds)) {
        const path = join(outputDir, `still-${seconds}s.png`);
        await page.screenshot({ path });
        stills.push({
          seconds,
          file: artifactPath(outputDir, path),
          bytes: fileBytes(path),
          simTick: state.simTick,
          playerLevel: state.playerLevel,
          enemiesLive: state.enemiesLive,
          realSecondsAfterRunStart: Number(((recordedAt - runStartedAt) / 1_000).toFixed(3)),
        });
      }
      if (args.clipTimes.includes(seconds)) {
        clipAnchors.push({
          seconds,
          recordingSeconds: (recordedAt - recordingStartedAt) / 1_000,
          simTick: state.simTick,
        });
      }
    }

    if (clipAnchors.length > 0) await page.waitForTimeout(args.clipDuration * 1_000 + 250);
    const finalState = await pageRunState(page);
    const upgradeChoiceClicks = chooser === undefined ? 0 : await chooser.stop();
    chooser = undefined;
    await context.close();
    context = undefined;
    const rawVideoPath = video === null ? null : await video?.path();
    if (rawVideoPath === null || rawVideoPath === undefined || !existsSync(rawVideoPath)) {
      fail('Playwright did not expose a recorded video file');
    }

    const clips = [];
    const flashAudits = [];
    for (const anchor of clipAnchors) {
      const clipPath = join(videosDir, `clip-${anchor.seconds}s.webm`);
      const encoding = await trimClip(ffmpeg, rawVideoPath, clipPath, anchor.recordingSeconds, args.clipDuration);
      const framesDir = join(outputDir, 'frames', `clip-${anchor.seconds}s`);
      const frameCapture = await extractFrames(ffmpeg, rawVideoPath, framesDir, anchor.recordingSeconds, args.clipDuration);
      const colorSheet = join(outputDir, `contact-sheet-${anchor.seconds}s.png`);
      const graySheet = join(outputDir, `contact-sheet-${anchor.seconds}s-gray.png`);
      await createContactSheet(framesDir, colorSheet, false);
      await createContactSheet(framesDir, graySheet, true);
      const audit = await auditFrames({ framesDir, fps: frameCapture.fps });
      // Default captures retain the compact clip + contact sheets, not hundreds
      // of redundant PNGs. The audit remains reproducible by rerunning capture
      // with --keep-frames; this provenance avoids a dangling absolute path.
      audit.source = `decoded from ${artifactPath(outputDir, clipPath)}`;
      audit.framesDirectory = artifactPath(outputDir, framesDir);
      audit.framesRetained = args.keepFrames;
      const auditPath = join(outputDir, `flash-audit-${anchor.seconds}s.json`);
      writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
      clips.push({
        seconds: anchor.seconds,
        simTick: anchor.simTick,
        video: artifactPath(outputDir, clipPath),
        videoBytes: fileBytes(clipPath),
        videoEncoding: encoding,
        contactSheet: artifactPath(outputDir, colorSheet),
        grayscaleContactSheet: artifactPath(outputDir, graySheet),
        frameCount: audit.frames,
        frameSamplingFps: Number(frameCapture.fps.toFixed(3)),
        frameSamplingMode: frameCapture.mode,
      });
      flashAudits.push({ seconds: anchor.seconds, file: artifactPath(outputDir, auditPath), ...audit });
      if (!args.keepFrames) rmSync(framesDir, { recursive: true, force: true });
    }
    rmSync(videoRawDir, { recursive: true, force: true });

    const flashPass = flashAudits.every((audit) => audit.pass);
    return {
      browser: { mode: browserLaunch.mode, fallbackReason: browserLaunch.fallbackReason },
      browserMessages,
      captureRoute: runningUrl(baseUrl, args),
      captureTimesAreSimulationSeconds: true,
      clipDurationRealSeconds: args.clipDuration,
      finalState,
      flashAudits,
      flashPass,
      mode: args.stress ? 'stress-smoke' : 'normal-autopilot-with-dom-upgrade-selection',
      serverMode,
      scriptedStartFallback: boot.scriptedStartFallback,
      stills,
      clips,
      upgradeChoiceClicks,
      webgl2: boot.state.webgl2,
    };
  } finally {
    if (chooser !== undefined) await chooser.stop();
    if (context !== undefined) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function writeBlocked(outputDir, error, attemptedModes) {
  const text = `# VFX capture blocked\n\n` +
    `**Generated:** ${new Date().toISOString()}\n\n` +
    `The capture harness could not reach a rendered combat frame. It did not silently pass P0.\n\n` +
    `## Attempted modes\n\n${attemptedModes.map((mode) => `- ${mode}`).join('\n')}\n\n` +
    `## Error\n\n\`\`\`text\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n\`\`\`\n\n` +
    `## Manual recovery\n\n` +
    `1. Run \`npm run build\` in \`apps/web-toy\`.\n` +
    `2. Retry \`npm run vfx:capture -- --preview --headed\`.\n` +
    `3. If Chromium cannot obtain a WebGL2 context, retry \`--headless\`; the report records that lower-fidelity fallback.\n` +
    `4. Do not score visual rubric items until real stills/contact sheets exist.\n`;
  writeFileSync(join(outputDir, 'BLOCKED.md'), text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = join(capturesRoot, args.iteration);
  if (existsSync(outputDir)) fail(`capture output already exists: ${outputDir}; choose --iteration <new-name>`);
  mkdirSync(outputDir, { recursive: true });
  const attemptedModes = [];
  let server;
  try {
    if (args.baseUrl !== null) {
      attemptedModes.push(`external base URL ${args.baseUrl}`);
      const report = await captureRun({ args, baseUrl: args.baseUrl, outputDir, serverMode: 'external' });
      const reportPath = join(outputDir, 'report.json');
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`[vfx-capture] wrote ${reportPath}`);
      if (args.failOnFlash && !report.flashPass) process.exitCode = 1;
      return;
    }

    attemptedModes.push(args.preview ? 'built Vite preview' : 'Vite dev source');
    server = await startViteServer({ port: args.port, usePreview: args.preview });
    let report;
    try {
      report = await captureRun({ args, baseUrl: server.baseUrl, outputDir, serverMode: server.mode });
    } catch (error) {
      if (!(error instanceof BootError) || args.preview) throw error;
      await server.close();
      server = undefined;
      attemptedModes.push('built Vite preview fallback after dev boot failure');
      server = await startViteServer({ port: args.port, usePreview: true });
      report = await captureRun({ args, baseUrl: server.baseUrl, outputDir, serverMode: server.mode });
    }
    const reportPath = join(outputDir, 'report.json');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[vfx-capture] wrote ${reportPath}`);
    if (args.failOnFlash && !report.flashPass) process.exitCode = 1;
  } catch (error) {
    writeBlocked(outputDir, error, attemptedModes);
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  } finally {
    if (server !== undefined) await server.close();
  }
}

await main();
