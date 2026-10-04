// Do the BROWSER tests bite? Break the page on purpose, one small change at a time, build the broken
// page into a scratch folder, and demand that the named browser test fails on it.
// A test that has only ever been seen passing has not been shown to check anything.
// Usage: node tools/mutate-page.mjs      (about 5 minutes; needs the same Python and browser as check.sh)
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.tmp', 'mutant-page');
let py = process.env.DEWGRUB_PYTHON || '/home/coder/.local/share/smm-venv/bin/python';
if (!existsSync(py)) py = 'python3';

// [what is broken, file, text to find (exactly once), replacement, the test that must fail]
const MUTANTS = [
  ['a swipe does not steer', 'src/main.js', "  finger.steered = true;\n  act({ type: 'turn', dir });", '  finger.steered = true;',
    'test_R_B3_touch_tap_starts_swipes_steer_tap_restarts'],
  ['a tap does nothing', 'src/main.js', "if (!finger.steered) act({ type: 'go' });", '',
    'test_R_B3_touch_tap_starts_swipes_steer_tap_restarts'],
  ['a swipe after game over restarts the game', 'src/main.js', "if (!finger.steered) act({ type: 'go' });", "act({ type: 'go' });",
    'test_R_B3_touch_tap_starts_swipes_steer_tap_restarts'],
  ['one finger can steer only once', 'src/main.js', "  if (!finger || e.pointerId !== finger.id) return;\n  const dir", "  if (!finger || e.pointerId !== finger.id || finger.steered) return;\n  const dir",
    'test_R_B3_one_long_swipe_can_steer_twice'],
  ['the W, A, S, D keys are dead', 'src/input.js', "  w: 'U', s: 'D', a: 'L', d: 'R',\n", '',
    'test_R_B2_keyboard_plays_from_ready_to_over_and_restarts'],
  ['an arrow key restarts a finished game', 'src/main.js', "if (intent.type === 'go' && performance.now()", 'if (performance.now()',
    'test_R_B2_arrow_keys_do_not_restart_a_finished_game'],
  ['the score on the page is never updated', 'src/main.js', 'scoreEl.textContent = `Score ${game.score}`;', "scoreEl.textContent = 'Score 0';",
    'test_R_B4_score_on_the_page_is_the_logic_score'],
  ['the seed in the address is ignored', 'src/main.js', 'if (urlSeed !== null) return urlSeed;', '',
    'test_R_B5_same_seed_and_same_keys_give_the_same_run'],
  ['every game without a seed uses seed 1', 'src/main.js', 'return window.crypto.getRandomValues(new Uint32Array(1))[0];', 'return 1;',
    'test_R_B5_without_a_seed_each_game_gets_its_own_seed'],
  ['a replay ignores the turn log', 'src/main.js', 'turn(game, replayLog[replayAt++].d);', 'replayAt++;',
    'test_R_B6_real_time_run_replays_to_the_same_result'],
  ['the replay link carries no turns', 'src/main.js', '&replay=${encodeLog(game.log)}`', '&replay=`',
    'test_R_B6_real_time_run_replays_to_the_same_result'],
  ['a replay can be steered', 'src/main.js', 'if (replaying) return; // a replay is watched, not steered', '',
    'test_R_B6_real_time_run_replays_to_the_same_result'],
  ['a broken replay link crashes the page', 'src/main.js', "try { replayLog = decodeLog(params.get('replay')); } catch (e) { replayLog = null; }", "replayLog = decodeLog(params.get('replay'));",
    'test_R_B6_a_broken_replay_link_falls_back_to_a_normal_game'],
  ['the page tries to load a tracking pixel', 'src/main.js', 'newGame();\nfit();', "new Image().src = 'pixel.gif';\nnewGame();\nfit();",
    'test_R_B7_no_network'],
  ['the security policy allows any connection', 'tools/build.mjs', "default-src 'none'; script-src", "default-src 'none'; connect-src *; script-src",
    'test_R_B7_the_browser_blocks_a_request_if_one_is_tried'],
  ['mute does not stop the sounds', 'src/audio.js', 'if (!notes || muted || !ctx) return false;', 'if (!notes || !ctx) return false;',
    'test_R_B8_sound_is_scheduled_on_eat_and_not_when_muted'],
  ['game events play no sound', 'src/main.js', 'for (const e of events) audio.play(e);', '',
    'test_R_B8_sound_is_scheduled_on_eat_and_not_when_muted'],
  ['the audio is never unlocked', 'src/main.js', '  audio.unlock();\n', '',
    'test_R_B8_sound_is_scheduled_on_eat_and_not_when_muted'],
  ['the canvas ignores the height of the bar', 'src/main.js', '(window.innerHeight - bar) / VIEW_H', 'window.innerHeight / VIEW_H',
    'test_R_B9_fits_phone_viewports_without_scrolling'],
  ['the bar labels may wrap and overflow', 'src/style.css', '  height: 44px;', '  height: 44px;\n  width: 480px;',
    'test_R_B9_fits_phone_viewports_without_scrolling'],
  ['pause does not stop the clock', 'src/main.js', "game.status === 'playing' && !paused) {\n    carry", "game.status === 'playing') {\n    carry",
    'test_R_B11_pause_stops_the_clock_and_a_hidden_tab_pauses'],
  ['a hidden tab does not pause', 'src/main.js', '&& !replaying) paused = true;', '&& !replaying) paused = false;',
    'test_R_B11_pause_stops_the_clock_and_a_hidden_tab_pauses'],
  ['the bar is too wide for a small phone', 'src/index.template.html', '<a id="replay" hidden>Replay</a>', '<a id="replay" hidden>Watch that run again</a>',
    'test_R_B9_fits_phone_viewports_without_scrolling'],
  ['Enter on the sound button starts a game', 'src/main.js', "  if (intent.type === 'go' && onControl(e)) return;\n", '',
    'test_R_B13_enter_and_space_on_the_sound_button_toggle_sound_and_do_not_start'],
  ['Enter on the replay link restarts instead of opening it', 'src/main.js', "  if (intent.type === 'go' && onControl(e)) return;\n", '',
    'test_R_B13_enter_on_the_replay_link_opens_the_replay'],
  ['any mouse button plays', 'src/main.js', "  if (e.pointerType === 'mouse' && e.button !== 0) return;\n", '',
    'test_R_B13_only_the_left_mouse_button_plays'],
  ['the board label never changes', 'src/main.js', "if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);", '',
    'test_R_B14_the_board_label_tells_the_game_status'],
  ['the page forbids zooming', 'src/index.template.html', ', viewport-fit=cover">', ', viewport-fit=cover, user-scalable=no">',
    'test_R_B14_the_board_label_tells_the_game_status'],
  ['the page throws while loading', 'src/main.js', 'newGame();\nfit();', 'newGame();\nfit();\nnull.x;',
    'test_R_B1_loads_clean_and_draws'],
  ['nothing is drawn on the board', 'src/render.js', "  ctx.save();\n  ctx.translate(0, HUD_H);", "  if (g) return drawn;\n  ctx.save();\n  ctx.translate(0, HUD_H);",
    'test_R_B1_loads_clean_and_draws'],
  ['the page uses a module script, which file:// refuses', 'src/index.template.html', '<script>__JS__</script>', '<script type="module" src="main.js"></script>',
    'test_R_B10_works_opened_from_disk'],
];

let survived = 0;
for (const [what, file, find, put, test] of MUTANTS) {
  const original = readFileSync(join(root, file), 'utf8');
  if (original.split(find).length !== 2) {
    console.error(`SETUP ERROR: ${JSON.stringify(find)} must occur exactly once in ${file}`);
    process.exit(2);
  }
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  cpSync(join(root, 'src'), join(work, 'src'), { recursive: true });
  cpSync(join(root, 'tools'), join(work, 'tools'), { recursive: true });
  writeFileSync(join(work, file), original.replace(find, () => put));
  const build = spawnSync('node', [join(work, 'tools', 'build.mjs')], { encoding: 'utf8' });
  if (build.status !== 0) {
    console.error(`SETUP ERROR: the broken page did not build (${what})\n${build.stderr}`);
    process.exit(2);
  }
  const run = spawnSync(py, ['-m', 'unittest', 'discover', '-s', join(root, 'e2e'), '-k', test], {
    encoding: 'utf8', timeout: 300000, env: { ...process.env, DEWGRUB_DIST: join(work, 'dist') },
  });
  const ran = /Ran (\d+) test/.exec(run.stderr || '');
  if (!ran || ran[1] === '0') {
    console.error(`SETUP ERROR: no test matched ${test}\n${run.stderr}`);
    process.exit(2);
  }
  if (run.status === 0) {
    survived++;
    console.log(`SURVIVED  ${what}  (${test} still passed)`);
  } else {
    console.log(`caught    ${what}  <- ${test}`);
  }
}
rmSync(work, { recursive: true, force: true });
console.log(`${MUTANTS.length - survived}/${MUTANTS.length} deliberate page faults were caught by the browser tests`);
if (survived) process.exit(1);
