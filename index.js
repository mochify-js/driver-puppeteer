'use strict';

const driver = require('puppeteer');

/**
 * @import { Writable } from 'node:stream'
 * @import { LaunchOptions } from 'puppeteer'
 * @import { MochifyDriver } from '@mochify/mochify'
 */

/**
 * @typedef {Object} PuppeteerDriverOptions
 * @property {string} [url]
 * @property {Writable} [stderr]
 */

exports.mochifyDriver = mochifyDriver;

/**
 * @param {PuppeteerDriverOptions & LaunchOptions} [options]
 * @returns {Promise<MochifyDriver>}
 */
async function mochifyDriver(options = {}) {
  const {
    url = `file:${__dirname}/index.html`,
    stderr = /** @type {Writable} */ (process.stderr),
    ...launch_options
  } = options;

  // In case this arrives through CLI flags, yargs will pass a string
  // when a single arg is given and an Array of strings when multiple
  // args are given.
  const extra_args = launch_options.args || [];
  launch_options.args = [
    '--allow-insecure-localhost',
    '--disable-dev-shm-usage',
    ...extra_args
  ];

  // Add CI-specific flags only when running in CI environments
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    launch_options.args.push('--no-sandbox');
  }

  const browser = await driver.launch({
    headless: true,
    acceptInsecureCerts: true,
    ...launch_options
  });

  const page = await browser.newPage();
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'log') {
      return;
    }
    if (type === 'warn' && text.includes('window.webkitStorageInfo')) {
      // Swallow deprecation warning.
      return;
    }
    stderr.write(text);
    stderr.write('\n');
  });

  /**
   * @param {Error} err
   */
  function handlePuppeteerError(err) {
    stderr.write(err.stack || String(err));
    stderr.write('\n');
    process.exitCode = 1;
    end();
  }

  page.on('pageerror', handlePuppeteerError).on('error', handlePuppeteerError);

  async function end() {
    await page.close();
    await browser.close();
  }

  await page.goto(url);

  /**
   * @param {string} script
   * @returns {Promise<Object>}
   */
  function evaluate(script) {
    return page.evaluate(script);
  }

  return {
    evaluate,
    end
  };
}
